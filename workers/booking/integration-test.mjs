import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { chargeDueLessons, chargeDueSameDayFees, retryPaymentRecovery } from "./index.mjs";
import { createSession, createResetToken, sessionVersion } from "./auth.mjs";
import { createManageToken } from "./tokens.mjs";
import { findRecurringCode, recurringLessonType, priceForMove } from "./rates.mjs";

const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ["2026-09-05T10:00:00.000Z"])); }
  static now() { return new NativeDate("2026-09-05T10:00:00.000Z").getTime(); }
};
const nativeFetch = globalThis.fetch;
const charges = [];
let checkoutUnavailable = false;
let decline = false;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
    if (checkoutUnavailable) return new Response(JSON.stringify({ error: { message: "Isolated unavailable test" } }), { status: 503 });
    return new Response(JSON.stringify({ id: "cs_recovery", url: "https://checkout.stripe.com/c/pay/mock" }));
  }
  assert.equal(String(url), "https://api.stripe.com/v1/payment_intents", "Only isolated charge mock may access network");
  const body = new URLSearchParams(options.body);
  charges.push({ amount: Number(body.get("amount")), key: options.headers["Idempotency-Key"] });
  if (decline) return new Response(JSON.stringify({ error: { message: "Isolated decline test", type: "card_error" } }), { status: 402 });
  return new Response(JSON.stringify({ id: `pi_mock_${charges.length}`, status: "succeeded" }));
};

// Real SQLite constraints and UPDATE statements; external payments/email are
// isolated. In particular these tests can interleave a write between the
// charge SELECT and its conditional claim, where unit-only tests missed races.
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./seed.sql", import.meta.url), "utf8"));
let beforeRun = null;
const DB = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      first() { return db.prepare(sql).get(...values) ?? null; },
      all() { return { results: db.prepare(sql).all(...values) }; },
      run() {
        beforeRun?.(sql, values);
        const result = db.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      }
    };
    return statement;
  },
  async batch(statements) {
    db.exec("BEGIN");
    try { const results = statements.map((statement) => statement.run()); db.exec("COMMIT"); return results; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
};
const env = {
  DB, BOOKING_TOKEN_SECRET: "isolated-test-signing-secret", ADMIN_TOKEN: "isolated-admin",
  ALLOWED_ORIGIN: "https://lesson.example", SITE_URL: "https://lesson.example",
  EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0",
  STRIPE_SECRET_KEY: "rk_test_mock", STRIPE_WEBHOOK_SECRET: "mock-webhook", STRIPE_EXPECTED_MODE: "test",
  PRIVATE_RECURRING_CODES: JSON.stringify([
    { code: "TEST15", duration: 60, cents: 1500 },
    { code: "DEMO27", duration: 90, cents: 2700 },
    { code: "MOCK19", duration: 60, cents: 1900 }
  ])
};
const tasks = [];
const ctx = { waitUntil(promise) { tasks.push(promise); } };
async function drain() { await Promise.all(tasks.splice(0)); }
let passed = 0;
async function test(name, fn) {
  beforeRun = null;
  try { await fn(); await drain(); passed++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
function student(id) {
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at,stripe_customer_id,stripe_payment_method) VALUES (?,?,?,'',?,?,?)")
    .run(id, `${id}@example.invalid`, "Test Student", new Date().toISOString(), `cus_${id}`, `pm_${id}`);
}
student("alice"); student("bob"); student("outsider"); student("teacher");
db.prepare("UPDATE students SET role = 'teacher' WHERE id = 'teacher'").run();
const sessions = Object.fromEntries(await Promise.all(["alice", "bob", "outsider", "teacher"].map(async (id) => [id, await createSession(id, env.BOOKING_TOKEN_SECRET)])));
async function call(path, { user = "alice", method = "POST", body = {}, origin = "https://lesson.example", raw, token, headers = {} } = {}) {
  return worker.fetch(new Request(`https://api.example${path}`, {
    method,
    headers: { Origin: origin, ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Authorization: `Bearer ${token || sessions[user]}` } : {}), ...headers },
    ...(method === "POST" ? { body: raw ?? JSON.stringify(body) } : {})
  }), env, ctx);
}
function booking(id, { start = "2026-09-07T09:00:00.000Z", end = "2026-09-07T10:00:00.000Z", payment = "scheduled", owner = "alice", series = null } = {}) {
  db.prepare(`INSERT INTO bookings (id,reference,lesson_type_id,student_id,student_name,student_email,student_phone,
    student_timezone,location,notes,starts_at,ends_at,status,sequence,created_at,updated_at,payment_status,amount_cents,series_id)
    VALUES (?,?,'single',?,'Test Student',?,'','Europe/Lisbon','online','',?,?,'confirmed',0,?,?,?,1500,?)`)
    .run(id, id, owner, `${owner}@example.invalid`, start, end, new Date().toISOString(), new Date().toISOString(), payment, series);
}
async function token(id) { return createManageToken(id, env.BOOKING_TOKEN_SECRET); }
async function webhook(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)))].map((value) => value.toString(16).padStart(2, "0")).join("");
  return call("/stripe/webhook", { user: null, raw, headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` } });
}

await test("exact allowlist never derives price from suffix", () => {
  assert.deepEqual(findRecurringCode(env.PRIVATE_RECURRING_CODES, "  test15  ", 60), { duration: 60, cents: 1500 });
  for (const code of ["TEST14", "TEST15extra", "AULA15", "LONGA25", "TEST 15"]) assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, code, 60), null);
  assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, "TEST15", 90), null);
});
await test("codes require authenticated account and cannot reveal catalogue", async () => {
  assert.equal((await call("/me/recurring-rates", { user: null })).status, 401);
  const response = await call("/me/recurring-rates", { method: "GET" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { rates: {} });
});
await test("reusable code grants same rate to two accounts and independent durations", async () => {
  for (const user of ["alice", "bob"]) assert.equal((await call("/me/recurring-rates", { user, body: { code: "test15", durationMinutes: 60 } })).status, 200);
  assert.equal((await call("/me/recurring-rates", { body: { code: "DEMO27", durationMinutes: 90 } })).status, 200);
  assert.deepEqual(await (await call("/me/recurring-rates", { method: "GET" })).json(), { rates: { 60: 1500, 90: 2700 } });
  assert.deepEqual(await (await call("/me/recurring-rates", { user: "outsider", method: "GET" })).json(), { rates: {} });
});
await test("concurrent redemption cannot replace or stack an existing rate", async () => {
  const responses = await Promise.all(["TEST15", "MOCK19"].map((code) => call("/me/recurring-rates", { body: { code, durationMinutes: 60 } })));
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
});
await test("parallel guesses bounded to eight requests per account window", async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, () => call("/me/recurring-rates", { user: "outsider", body: { code: "NOPE15", durationMinutes: 60 } })));
  assert.equal(responses.filter((res) => res.status === 429).length, 4);
});
await test("saved rate survives catalogue removal, trial and other duration keep public price", async () => {
  const local = { ...env, PRIVATE_RECURRING_CODES: "[]" };
  assert.equal((await recurringLessonType(local, "alice", { id: "single", duration_minutes: 60, price_cents: 2500 })).price_cents, 1500);
  assert.equal((await recurringLessonType(local, "alice", { id: "trial", duration_minutes: 60, price_cents: 2000 })).price_cents, 2000);
  assert.equal((await recurringLessonType(local, "bob", { id: "long", duration_minutes: 90, price_cents: 3500 })).price_cents, 3500);
  assert.equal(await priceForMove(local, { lesson_type_id: "single", amount_cents: 1800, series_id: "series", student_id: "alice" }, { id: "single", duration_minutes: 60, price_cents: 2500 }), 1800);
  assert.equal(await priceForMove(local, { lesson_type_id: "single", amount_cents: 1800, series_id: "series", student_id: "alice" }, { id: "long", duration_minutes: 90, price_cents: 3500 }), 2700);
});
await test("cross-site writes, unsupported content types and oversized streamed JSON fail", async () => {
  assert.equal((await call("/me", { origin: "https://attacker.example" })).status, 403);
  assert.equal((await call("/me", { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await call("/me", { raw: JSON.stringify({ name: "a".repeat(40000) }) })).status, 413);
});
await test("student cannot use teacher routes and forged manage links disclose nothing", async () => {
  assert.equal((await call("/admin/bookings", { method: "GET" })).status, 401);
  assert.equal((await call("/bookings/forged", { method: "GET" })).status, 404);
});
await test("recurring booking creation snapshots rate for every occurrence; one-off and tampering cannot use it", async () => {
  const payload = { lessonType: "single", startAt: "2026-09-08T09:00:00.000Z", repeat: 4, expectedPriceCents: 1500 };
  const result = await call("/bookings", { body: payload });
  assert.equal(result.status, 201, await result.clone().text());
  const rows = db.prepare("SELECT amount_cents FROM bookings WHERE series_id IS NOT NULL").all();
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.amount_cents === 1500));
  assert.equal((await call("/bookings", { body: { ...payload, startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 100 } })).status, 409);
  const one = await call("/bookings", { body: { lessonType: "single", startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 2500 } });
  assert.equal(one.status, 201);
  assert.equal((await one.json()).booking.amountCents, 2500);
});
await test("same-day cancellation records and charges just one separate fee under concurrent retries", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  booking("same-day-cancel", { start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
  const path = `/bookings/${await token("same-day-cancel")}/cancel`;
  const responses = await Promise.all([call(path), call(path)]);
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  await drain();
  await chargeDueSameDayFees(env);
  await chargeDueLessons(env, new Date("2026-09-06T10:00:00Z"));
  const row = db.prepare("SELECT * FROM bookings WHERE id='same-day-cancel'").get();
  assert.equal(row.status, "cancelled");
  assert.equal(row.same_day_fee_status, "paid");
  assert.equal(charges.filter((charge) => charge.key.includes("same-day-cancel")).length, 1);
  assert.equal(charges.find((charge) => charge.key.includes("same-day-cancel")).amount, 500);
});
await test("duplicate slot claims have one winner, and pending setup reserves its owner's slot", async () => {
  const body = { lessonType: "single", startAt: "2026-09-10T16:00:00.000Z", paymentConsent: true };
  const results = await Promise.all([call("/bookings", { body }), call("/bookings", { user: "bob", body })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  booking("pending-own", { owner: "bob", start: "2026-09-11T16:00:00.000Z", end: "2026-09-11T17:00:00.000Z", payment: "pending" });
  db.prepare("UPDATE bookings SET status='pending_payment',hold_expires_at='2026-09-05T10:35:00.000Z' WHERE id='pending-own'").run();
  assert.equal((await call("/bookings", { user: "bob", body: { ...body, startAt: "2026-09-11T16:00:00.000Z" } })).status, 409);
  assert.equal((await call("/bookings", { user: "outsider", body: { ...body, lessonType: "trial", repeat: 4 } })).status, 400);
});
await test("opening, unchanged submission and failed move never charge a fee", async () => {
  booking("no-action", { start: "2026-09-05T14:00:00.000Z", end: "2026-09-05T15:00:00.000Z" });
  const path = `/bookings/${await token("no-action")}`;
  assert.equal((await call(path, { method: "GET" })).status, 200);
  const unchanged = await call(`${path}/reschedule`, { body: { startAt: "2026-09-05T14:00:00.000Z" } });
  assert.equal(unchanged.status, 200);
  assert.equal((await unchanged.json()).sameDayFeeApplied, false);
  assert.equal((await call(`${path}/reschedule`, { body: { startAt: "invalid" } })).status, 409);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='no-action'").get().same_day_fee_status, "not_required");
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id='no-action'").run();
});
await test("same-day move preserves agreed price, charges once, then lesson only at new end", async () => {
  booking("same-day-move", { start: "2026-09-05T16:00:00.000Z", end: "2026-09-05T17:00:00.000Z" });
  const result = await call(`/bookings/${await token("same-day-move")}/reschedule`, { body: { startAt: "2026-09-08T14:00:00.000Z" } });
  assert.equal(result.status, 200, await result.clone().text());
  await drain();
  await chargeDueLessons(env, new Date("2026-09-05T18:00:00Z"));
  assert.equal(charges.filter((charge) => charge.key.includes("same-day-move")).length, 1);
  await chargeDueLessons(env, new Date("2026-09-08T15:00:00Z"));
  assert.deepEqual(charges.filter((charge) => charge.key.includes("same-day-move")).map((charge) => charge.amount), [500, 1500]);
});
await test("teacher move and cancellation have no student action fee and cannot alter processing charges", async () => {
  booking("teacher-action", { start: "2026-09-05T18:00:00.000Z", end: "2026-09-05T19:00:00.000Z" });
  const result = await call("/admin/bookings/teacher-action/reschedule", { user: "teacher", body: { startAt: "2026-09-09T12:00:00.000Z" } });
  assert.equal(result.status, 200);
  assert.equal((await call("/admin/bookings/teacher-action/cancel", { user: "teacher" })).status, 200);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='teacher-action'").get().same_day_fee_status, "not_required");
  booking("processing", { payment: "processing" });
  assert.equal((await call("/admin/bookings/processing/cancel", { user: "teacher" })).status, 409);
  assert.equal((await call("/admin/bookings/processing/reschedule", { user: "teacher", body: { startAt: "2026-09-09T15:00:00.000Z" } })).status, 409);
});
await test("cancel wins before selected due charge is claimed", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  booking("race-cancel", { start: "2026-01-01T10:00:00.000Z", end: "2026-01-01T11:00:00.000Z" });
  beforeRun = (sql) => { if (sql.includes("SET payment_status = 'processing'")) {
    beforeRun = null; db.prepare("UPDATE bookings SET status='cancelled' WHERE id='race-cancel'").run();
  } };
  await chargeDueLessons(env);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='race-cancel'").get().payment_status, "scheduled");
});
await test("move wins before selected due charge is claimed", async () => {
  booking("race-move", { start: "2026-01-01T12:00:00.000Z", end: "2026-01-01T13:00:00.000Z" });
  beforeRun = (sql) => { if (sql.includes("SET payment_status = 'processing'")) {
    beforeRun = null; db.prepare("UPDATE bookings SET ends_at='2099-01-01T13:00:00.000Z' WHERE id='race-move'").run();
  } };
  await chargeDueLessons(env);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='race-move'").get().payment_status, "scheduled");
});
await test("decline recovery-link outage retries without charging again or sending a broken link", async () => {
  booking("declined", { start: "2026-01-03T12:00:00.000Z", end: "2026-01-03T13:00:00.000Z" });
  decline = true; checkoutUnavailable = true;
  await chargeDueLessons(env);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='declined'").get().payment_status, "payment_due");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_log WHERE booking_id='declined'").get().count, 0);
  const attempts = charges.length;
  decline = false; checkoutUnavailable = false;
  await retryPaymentRecovery(env);
  assert.equal(db.prepare("SELECT stripe_session_id FROM bookings WHERE id='declined'").get().stripe_session_id, "cs_recovery");
  assert.equal(charges.length, attempts);
});
await test("signed webhook validates money and customer, settles once under replay", async () => {
  const session = { id: "cs_recovery", mode: "payment", payment_status: "paid", currency: "eur", amount_total: 1500,
    client_reference_id: "declined", payment_intent: "pi_recovery", customer: "cus_alice", metadata: { purpose: "lesson-due" } };
  const event = { id: "evt_recovery", type: "checkout.session.completed", livemode: false, data: { object: session } };
  assert.equal((await webhook({ ...event, data: { object: { ...session, amount_total: 1 } } })).status, 400);
  assert.equal((await webhook({ ...event, data: { object: { ...session, customer: "cus_outsider" } } })).status, 400);
  assert.equal((await webhook({ ...event, livemode: true })).status, 400);
  assert.equal((await call("/stripe/webhook", { user: null, body: event })).status, 400);
  const responses = await Promise.all([webhook(event), webhook(event)]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM stripe_events WHERE id='evt_recovery'").get().count, 1);
  assert.equal(db.prepare("SELECT charged_cents FROM bookings WHERE id='declined'").get().charged_cents, 1500);
});
await test("expired setup cannot confirm a released slot", async () => {
  booking("expired-setup");
  db.prepare("UPDATE bookings SET status='pending_payment',payment_status='pending',hold_expires_at='2026-09-05T09:00:00.000Z',stripe_session_id='cs_expired' WHERE id='expired-setup'").run();
  const response = await webhook({ id: "evt_expired", type: "checkout.session.completed", livemode: false, data: { object: {
    id: "cs_expired", client_reference_id: "expired-setup", customer: "cus_alice", mode: "setup", status: "complete", setup_intent: "seti_expired", metadata: { purpose: "card_setup" }
  } } });
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='expired-setup'").get().status, "pending_payment");
});
await test("ambiguous processing older than 23 hours never creates another charge", async () => {
  db.prepare("UPDATE bookings SET charge_started_at='2026-09-03T10:00:00.000Z',updated_at='2026-09-03T10:00:00.000Z',ends_at='2026-09-03T10:00:00.000Z' WHERE id='processing'").run();
  const count = charges.length;
  await chargeDueLessons(env);
  assert.equal(charges.length, count);
});
await test("logout revokes only the presented session and reset invalidates previous sessions", async () => {
  assert.equal((await call("/auth/logout", { user: "bob" })).status, 200);
  assert.equal((await call("/me/recurring-rates", { user: "bob", method: "GET" })).status, 401);
  const reset = await createResetToken("alice", env.BOOKING_TOKEN_SECRET);
  db.prepare("INSERT INTO password_resets (nonce,student_id,created_at) VALUES (?,'alice',?)").run(reset.split(".")[2], new Date().toISOString());
  const response = await call("/auth/reset", { user: null, body: { token: reset, password: "isolated-password-only" } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(sessionVersion(result.session), 1);
  assert.equal((await call("/me/recurring-rates", { method: "GET" })).status, 401);
  assert.equal((await call("/me/recurring-rates", { method: "GET", token: result.session })).status, 200);
  sessions.alice = result.session;
  assert.equal((await call("/auth/reset", { user: null, body: { token: reset, password: "second-isolated-password" } })).status, 400);
});

if (process.env.INES_PRIVATE_RATES_FILE) {
  await test("all private owner mappings activate exactly and are independently reusable", async () => {
    const rows = [...readFileSync(process.env.INES_PRIVATE_RATES_FILE, "utf8").matchAll(/^\| (60|90) \| €(\d+) \| ([A-Z]{4}\d{2}) \|$/gm)]
      .map(([, duration, price, code]) => ({ duration: Number(duration), cents: Number(price) * 100, code }));
    assert.equal(rows.length, 22);
    assert.equal(new Set(rows.map((row) => row.code.slice(0, 4))).size, 22);
    env.PRIVATE_RECURRING_CODES = JSON.stringify(rows);
    for (const [index, rate] of rows.entries()) {
      for (const suffix of ["a", "b"]) {
        const id = `private-check-${index}-${suffix}`;
        student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET);
        const response = await call("/me/recurring-rates", { user: id, body: { code: rate.code.toLowerCase(), durationMinutes: rate.duration } });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).rates[rate.duration], rate.cents);
      }
      assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, rate.code, rate.duration === 60 ? 90 : 60), null);
    }
  });
}
console.log(`${passed} booking integration tests passed.`);
globalThis.fetch = nativeFetch;
globalThis.Date = NativeDate;
db.close();

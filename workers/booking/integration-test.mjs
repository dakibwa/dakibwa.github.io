import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { chargeDueLessons, chargeDueSameDayFees, retryPaymentRecovery, retryRefunds } from "./index.mjs";
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
const checkoutRequests = [];
const refunds = [];
let duringRefund = null;
let refundUnavailable = false;
let refundStatus = "succeeded";
let refundLookups = 0;
let checkoutStatus = "open";
let chargeError = null;
let googleJwk = null;
let checkoutUnavailable = false;
let decline = false;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("https://api.stripe.com/v1/refunds/")) {
    refundLookups++;
    return Response.json({ id: String(url).split("/").at(-1), status: refundStatus });
  }
  if (String(url) === "https://api.stripe.com/v1/refunds") {
    refunds.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    await duringRefund?.();
    if (refundUnavailable) return Response.json({ error: { message: "Isolated refund response loss" } }, { status: 503 });
    return Response.json({ id: `re_${refunds.length}`, status: refundStatus });
  }
  if (String(url) === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [googleJwk] });
  if (String(url).startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    if (checkoutUnavailable) throw new Error("Isolated lookup outage");
    return Response.json({ id: String(url).split("/").at(-1), status: checkoutStatus, url: "https://checkout.stripe.com/c/pay/mock" });
  }
  if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
    checkoutRequests.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    if (checkoutUnavailable) return new Response(JSON.stringify({ error: { message: "Isolated unavailable test" } }), { status: 503 });
    return new Response(JSON.stringify({ id: options.headers["Idempotency-Key"].endsWith(":cs_old") ? "cs_new" : "cs_recovery", url: "https://checkout.stripe.com/c/pay/mock" }));
  }
  assert.equal(String(url), "https://api.stripe.com/v1/payment_intents", "Only isolated charge mock may access network");
  const body = new URLSearchParams(options.body);
  charges.push({ amount: Number(body.get("amount")), key: options.headers["Idempotency-Key"], body: options.body });
  if (chargeError) return Response.json({ error: { message: "Isolated ambiguous payment", type: chargeError.type } }, { status: chargeError.status });
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
  for (const startAt of ["2026-09-05T14:00:00Z", "2026-09-05T14:00:00+00:00", "2026-09-05T15:00:00+01:00"]) {
    const alias = await call(`${path}/reschedule`, { body: { startAt } });
    assert.equal(alias.status, 200);
    assert.equal((await alias.json()).sameDayFeeApplied, false);
  }
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
    beforeRun = null; db.prepare("UPDATE bookings SET starts_at='2099-01-01T12:00:00.000Z',ends_at='2099-01-01T13:00:00.000Z' WHERE id='race-move'").run();
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
await test("fifty stale ambiguous payments cannot starve fresh lesson and action-fee charges", async () => {
  for (let i = 0; i < 50; i++) {
    booking(`stale-${i}`, { payment: "processing", start: "2026-01-01T09:00:00.000Z", end: "2026-01-01T10:00:00.000Z" });
    db.prepare("UPDATE bookings SET charge_started_at='2026-01-01T10:00:00.000Z',same_day_fee_status='processing',same_day_fee_started_at='2026-01-01T10:00:00.000Z',updated_at='2026-01-01T10:00:00.000Z' WHERE id=?").run(`stale-${i}`);
  }
  booking("fresh-charge", { start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z" });
  db.prepare("UPDATE bookings SET same_day_fee_status='scheduled',same_day_fee_cents=500 WHERE id='fresh-charge'").run();
  const count = charges.length;
  await chargeDueLessons(env); await chargeDueSameDayFees(env);
  assert.equal(charges.length, count + 2);
  assert.deepEqual(charges.slice(count).map((charge) => charge.amount), [1500, 500]);
  const admin = await (await call("/admin/bookings", { method: "GET", user: "teacher" })).json();
  assert.equal(admin.manualPaymentReconciliation.length, 51);
});
await test("ambiguous retry freezes card and money; idempotency errors never open a second payment path", async () => {
  booking("ambiguous-snapshot", { start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z" });
  db.prepare("UPDATE bookings SET same_day_fee_status='scheduled',same_day_fee_cents=500 WHERE id='ambiguous-snapshot'").run();
  const before = charges.length;
  const checkouts = checkoutRequests.length;
  chargeError = { status: 503, type: "api_error" };
  await chargeDueLessons(env); await chargeDueSameDayFees(env);
  db.prepare("UPDATE students SET stripe_payment_method='pm_changed' WHERE id='alice'").run();
  db.prepare("UPDATE bookings SET amount_cents=9900,same_day_fee_cents=9900,updated_at='2026-09-05T09:00:00.000Z' WHERE id='ambiguous-snapshot'").run();
  chargeError = { status: 400, type: "idempotency_error" };
  await chargeDueLessons(env);
  db.prepare("UPDATE bookings SET updated_at='2026-09-05T09:00:00.000Z' WHERE id='ambiguous-snapshot'").run();
  await chargeDueSameDayFees(env);
  assert.equal(charges[before].body, charges[before + 2].body);
  assert.equal(charges[before + 1].body, charges[before + 3].body);
  assert.equal(checkoutRequests.length, checkouts);
  assert.deepEqual({ ...db.prepare("SELECT payment_status,same_day_fee_status FROM bookings WHERE id='ambiguous-snapshot'").get() }, { payment_status: "processing", same_day_fee_status: "processing" });
  chargeError = null;
});
await test("durable recovery only replaces a provider-expired session and remains single-path under concurrency", async () => {
  booking("expired-recovery", { payment: "payment_due" });
  db.prepare("UPDATE bookings SET stripe_session_id='cs_old' WHERE id='expired-recovery'").run();
  const path = `/bookings/${await token("expired-recovery")}/payment`;
  const start = checkoutRequests.length;
  assert.equal((await call("/bookings/forged/payment", { body: { purpose: "lesson" } })).status, 404);
  checkoutUnavailable = true;
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 503);
  checkoutUnavailable = false; checkoutStatus = "complete";
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 503);
  checkoutStatus = "open";
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 200);
  assert.equal(checkoutRequests.length, start);
  checkoutStatus = "expired";
  const responses = await Promise.all([1, 2].map(() => call(path, { body: { purpose: "lesson" } })));
  assert.deepEqual(responses.map((res) => res.status), [200, 200]);
  assert.equal(db.prepare("SELECT stripe_session_id FROM bookings WHERE id='expired-recovery'").get().stripe_session_id, "cs_new");
  assert.equal(new Set(checkoutRequests.slice(start).map((request) => request.key)).size, 1);
  assert.equal(new Set(checkoutRequests.slice(start).map((request) => request.body)).size, 1);
  assert.equal(new URLSearchParams(checkoutRequests.at(-1).body).has("expires_at"), false);
  db.prepare("UPDATE bookings SET payment_status='paid' WHERE id='expired-recovery'").run();
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 409);
  checkoutStatus = "open";
});
await test("verified Google first-link removes preregistration password and sessions while preserving account data", async () => {
  const registered = await call("/auth/register", { user: null, body: { email: "victim@example.invalid", name: "Victim", password: "attacker-known-password" } });
  assert.equal(registered.status, 201);
  const attacker = await registered.json();
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  googleJwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "isolated-google" };
  env.GOOGLE_CLIENT_ID = "isolated-client";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "RS256", kid: googleJwk.kid })}.${encode({ sub: "verified-victim", email: "victim@example.invalid", email_verified: true, iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, exp: Date.now() / 1000 + 3600 })}`;
  const signature = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(payload))).toString("base64url");
  const linked = await call("/auth/google", { user: null, body: { credential: `${payload}.${signature}` } });
  assert.equal(linked.status, 200);
  const victim = await linked.json();
  assert.equal(victim.student.id, attacker.student.id);
  assert.equal(sessionVersion(victim.session), 1);
  assert.equal((await call("/me", { method: "GET", token: attacker.session })).status, 401);
  assert.equal((await call("/auth/login", { user: null, body: { email: "victim@example.invalid", password: "attacker-known-password" } })).status, 401);
  assert.equal((await call("/me", { method: "GET", token: victim.session })).status, 200);
  const again = await (await call("/auth/google", { user: null, body: { credential: `${payload}.${signature}` } })).json();
  assert.equal(sessionVersion(again.session), 1);
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

await test("teacher creation atomically loses to a concurrent student claim", async () => {
  beforeRun = (sql) => {
    if (sql.startsWith("INSERT INTO bookings")) {
      beforeRun = null;
      booking("student-wins-admin-race", { start: "2026-09-16T11:00:00.000Z", end: "2026-09-16T12:00:00.000Z" });
    }
  };
  const response = await call("/admin/bookings", { user: "teacher", body: { email: "alice@example.invalid", lessonType: "single", startAt: "2026-09-16T11:00:00.000Z" } });
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE starts_at='2026-09-16T11:00:00.000Z'").get().count, 1);
});
await test("expired setup holds do not block either student or teacher moves", async () => {
  booking("old-hold", { start: "2026-09-17T16:00:00.000Z", end: "2026-09-17T17:00:00.000Z", payment: "pending" });
  db.prepare("UPDATE bookings SET status='pending_payment',hold_expires_at='2026-09-05T09:00:00.000Z' WHERE id='old-hold'").run();
  booking("move-past-hold", { start: "2026-09-17T12:00:00.000Z", end: "2026-09-17T13:00:00.000Z" });
  const response = await call(`/bookings/${await token("move-past-hold")}/reschedule`, { body: { startAt: "2026-09-17T16:00:00.000Z" } });
  assert.equal(response.status, 200, await response.clone().text());
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id='move-past-hold'").run();
  booking("teacher-past-hold", { start: "2026-09-17T12:00:00.000Z", end: "2026-09-17T13:00:00.000Z" });
  assert.equal((await call("/admin/bookings/teacher-past-hold/reschedule", { user: "teacher", body: { startAt: "2026-09-17T16:00:00.000Z" } })).status, 200);
});
await test("paid student and teacher cancellation claim before refund; concurrent move cannot escape", async () => {
  for (const actor of ["student", "teacher"]) {
    const id = `refund-${actor}`;
    booking(id, { payment: "paid", start: "2026-09-25T12:00:00.000Z", end: "2026-09-25T13:00:00.000Z" });
    db.prepare("UPDATE bookings SET stripe_payment_intent=? WHERE id=?").run(`pi_${id}`, id);
    duringRefund = async () => {
      const moved = await call(`/admin/bookings/${id}/reschedule`, { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } });
      assert.equal(moved.status, 409);
    };
    const path = actor === "teacher" ? `/admin/bookings/${id}/cancel` : `/bookings/${await token(id)}/cancel`;
    const response = await call(path, { user: actor === "teacher" ? "teacher" : "alice" });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual({ ...db.prepare("SELECT status,payment_status FROM bookings WHERE id=?").get(id) }, { status: "cancelled", payment_status: "refunded" });
    duringRefund = null;
  }
});
await test("a move winning before the refund claim prevents any refund call", async () => {
  booking("refund-lost", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_lost' WHERE id='refund-lost'").run();
  beforeRun = (sql) => {
    if (sql.startsWith("INSERT OR IGNORE INTO booking_refunds")) {
      beforeRun = null;
      db.prepare("UPDATE bookings SET sequence=sequence+1,starts_at='2026-09-09T08:00:00.000Z',ends_at='2026-09-09T09:00:00.000Z' WHERE id='refund-lost'").run();
    }
  };
  const count = refunds.length;
  assert.equal((await call(`/bookings/${await token("refund-lost")}/cancel`)).status, 409);
  assert.equal(refunds.length, count);
});
await test("ambiguous refund stays reserved and reconciles same immutable request before cancelling", async () => {
  booking("refund-ambiguous", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_ambiguous' WHERE id='refund-ambiguous'").run();
  refundUnavailable = true;
  const count = refunds.length;
  const response = await call(`/bookings/${await token("refund-ambiguous")}/cancel`);
  assert.equal(response.status, 503);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='refund-ambiguous'").get().status, "confirmed");
  // A paid postpay lesson retains its original charge timestamp. The refund
  // lock must never be mistaken for an abandoned lesson-charge claim.
  db.prepare("UPDATE bookings SET charge_started_at='2026-09-05T09:00:00.000Z',updated_at='2026-09-05T09:00:00.000Z' WHERE id='refund-ambiguous'").run();
  const chargeCount = charges.length;
  await chargeDueLessons(env);
  assert.equal(charges.length, chargeCount);
  assert.equal((await call("/admin/bookings/refund-ambiguous/reschedule", { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } })).status, 409);
  db.prepare("UPDATE bookings SET amount_cents=9900 WHERE id='refund-ambiguous'").run();
  db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id='refund-ambiguous'").run();
  refundUnavailable = false;
  await retryRefunds(env);
  assert.deepEqual(refunds[count], refunds[count + 1]);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='refund-ambiguous'").get().payment_status, "refunded");
});
await test("pending provider refunds reconcile by id, never create another refund", async () => {
  booking("refund-pending", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_pending' WHERE id='refund-pending'").run();
  refundStatus = "pending";
  assert.equal((await call(`/bookings/${await token("refund-pending")}/cancel`)).status, 503);
  const count = refunds.length;
  const lookups = refundLookups;
  db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id='refund-pending'").run();
  refundStatus = "succeeded";
  await retryRefunds(env);
  assert.equal(refunds.length, count);
  assert.equal(refundLookups, lookups + 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='refund-pending'").get().status, "cancelled");
});
await test("whole-series duration changes require the displayed rate while unchanged durations preserve mixed prices", async () => {
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('mixed-series','alice','single',1,660,?,?)").run(new Date().toISOString(), new Date().toISOString());
  booking("mixed-a", { series: "mixed-series", start: "2026-10-05T10:00:00.000Z", end: "2026-10-05T11:00:00.000Z" });
  booking("mixed-b", { series: "mixed-series", start: "2026-10-12T10:00:00.000Z", end: "2026-10-12T11:00:00.000Z" });
  db.prepare("UPDATE bookings SET amount_cents=1800 WHERE id='mixed-b'").run();
  const payload = { lessonType: "long", startAt: "2026-10-05T12:00:00.000Z" };
  assert.equal((await call("/series/mixed-series/reschedule", { body: payload })).status, 409);
  assert.equal((await call("/series/mixed-series/reschedule", { body: { ...payload, expectedPriceCents: 1 } })).status, 409);
  const sameLength = await call("/series/mixed-series/reschedule", { body: { ...payload, lessonType: "single", expectedPriceCents: 1500 } });
  assert.equal(sameLength.status, 200, await sameLength.clone().text());
  assert.deepEqual(db.prepare("SELECT amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all().map((row) => row.amount_cents), [1500, 1800]);
  const newLength = await call("/series/mixed-series/reschedule", { body: { ...payload, expectedPriceCents: 2700 } });
  assert.equal(newLength.status, 200, await newLength.clone().text());
  assert.deepEqual(db.prepare("SELECT amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all().map((row) => row.amount_cents), [2700, 2700]);
});
await test("series cancellation locks paid occurrences before refunding and reports actual outcomes", async () => {
  const seriesId = db.prepare("SELECT id FROM booking_series LIMIT 1").get().id;
  booking("refund-series", { payment: "paid", series: seriesId, start: "2026-09-28T12:00:00.000Z", end: "2026-09-28T13:00:00.000Z" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_series' WHERE id='refund-series'").run();
  duringRefund = async () => assert.equal((await call("/admin/bookings/refund-series/reschedule", { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } })).status, 409);
  const response = await call(`/series/${seriesId}/stop`, { body: { cancelRemaining: true } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).refunded, 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='refund-series'").get().status, "cancelled");
  duringRefund = null;
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

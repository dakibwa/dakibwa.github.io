import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { chargeDueLessons, chargeDueSameDayFees, retryPaymentRecovery, retryRefunds } from "./index.mjs";
import { createSession, createResetToken, sessionVersion } from "./auth.mjs";
import { createManageToken } from "./tokens.mjs";
import { findRecurringCode, recurringLessonType, priceForMove } from "./rates.mjs";
import { bookingSelection, portoWeekOf } from "./selection.mjs";
import { computeAvailability } from "./availability.mjs";

const NativeDate = Date;
const DEFAULT_TEST_NOW = "2026-09-05T10:00:00.000Z";
let testNow = DEFAULT_TEST_NOW;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [testNow])); }
  static now() { return new NativeDate(testNow).getTime(); }
};
const nativeFetch = globalThis.fetch;
const charges = [];
const checkoutRequests = [];
const emailRequests = [];
let emailUnavailable = false;
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
const setupIntents = new Map();
let duringSetupRead = null;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://api.resend.com/emails") {
    emailRequests.push(JSON.parse(options.body));
    return emailUnavailable
      ? Response.json({ message: "Isolated email outage" }, { status: 503 })
      : Response.json({ id: `email_mock_${emailRequests.length}` });
  }
  if (String(url).startsWith("https://api.stripe.com/v1/setup_intents/")) {
    await duringSetupRead?.();
    return Response.json(setupIntents.get(String(url).split("/").at(-1)) ?? { status: "requires_payment_method" });
  }
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
    return new Response(JSON.stringify({ id: new URLSearchParams(options.body).get("mode") === "setup" ? `cs_setup_${checkoutRequests.length}` : options.headers["Idempotency-Key"].endsWith(":cs_old") ? "cs_new" : "cs_recovery", url: "https://checkout.stripe.com/c/pay/mock" }));
  }
  assert.equal(String(url), "https://api.stripe.com/v1/payment_intents", "Only isolated charge mock may access network");
  const body = new URLSearchParams(options.body);
  assert.equal(body.get("payment_method_types[0]"), "card", "error_on_requires_action requires explicit card methods in the real Stripe API");
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
let beforeBatch = null;
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
    beforeBatch?.(statements);
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
  testNow = DEFAULT_TEST_NOW;
  beforeRun = null;
  beforeBatch = null;
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

// Multi-date booking uses the same real SQLite adapter and isolated providers.
let selectionStudent = 0;
async function selectionFixture({ savedCard = true } = {}) {
  await drain();
  db.exec("DELETE FROM booking_refunds; DELETE FROM bookings; DELETE FROM booking_series; DELETE FROM stripe_events; DELETE FROM email_log;");
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = `selection-${++selectionStudent}`;
  student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET);
  if (!savedCard) db.prepare("UPDATE students SET stripe_customer_id=NULL,stripe_payment_method=NULL WHERE id=?").run(id);
  duringSetupRead = null; checkoutUnavailable = false; beforeRun = null;
  return id;
}
const selectedStarts = ["2026-09-14T09:00:00.000Z", "2026-09-15T09:00:00.000Z"];
function selectionBody(extra = {}) {
  return { lessonType: "single", startAts: selectedStarts, paymentConsent: true, expectedPriceCents: 2500, ...extra };
}
function selectionEvent(user, { count, id = "evt_selection", customer = `cus_${user}` } = {}) {
  const row = db.prepare("SELECT * FROM bookings WHERE student_id=? ORDER BY starts_at").get(user);
  setupIntents.set(`seti_${user}`, { status: "succeeded", customer, payment_method: `pm_${user}` });
  return { id, type: "checkout.session.completed", livemode: false, data: { object: {
    id: row.stripe_session_id, client_reference_id: row.id, mode: "setup", status: "complete", customer,
    setup_intent: `seti_${user}`, metadata: { purpose: "card_setup", selection_count: String(count) }
  } } };
}
await test("selection validates count, overlapping aliases and Porto calendar week boundaries", () => {
  assert.ok(bookingSelection({ startAts: [] }).error);
  assert.ok(bookingSelection({ startAts: Array(9).fill(selectedStarts[0]) }).error);
  assert.ok(bookingSelection({ startAts: [selectedStarts[0], "2026-09-14T10:00:00+01:00"] }).error);
  assert.ok(bookingSelection({ startAts: [selectedStarts[0], "2026-09-14T09:30:00Z"] }).error);
  assert.ok(bookingSelection({ startAts: selectedStarts }, { trial: true }).error);
  assert.ok(bookingSelection({ startAts: [selectedStarts[0], "2026-09-21T09:00:00Z"] }, { recurring: true }).error);
  assert.deepEqual(bookingSelection({ startAts: [selectedStarts[0], "2026-09-21T09:00:00Z"] }).starts.length, 2);
  assert.equal(portoWeekOf("2026-09-13T23:30:00Z"), "2026-09-14", "Porto is already Monday while UTC is Sunday");
  assert.equal(portoWeekOf("2026-12-31T10:00:00Z"), portoWeekOf("2027-01-01T10:00:00Z"));
});
await test("several single dates confirm together, retain individual prices and send one calendar message", async () => {
  const user = await selectionFixture();
  const chargedBefore = charges.length;
  const response = await call("/bookings", { user, body: selectionBody({ startAts: [...selectedStarts, "2026-09-22T09:00:00Z"] }) });
  assert.equal(response.status, 201, await response.clone().text());
  const result = await response.json();
  assert.equal(result.selection.booked.length, 3);
  assert.equal(result.selection.recurring, false);
  const rows = db.prepare("SELECT * FROM bookings WHERE student_id=?").all(user);
  assert.ok(rows.every((row) => row.payment_status === "scheduled" && row.amount_cents === 2500 && !row.series_id));
  assert.equal(charges.length, chargedBefore, "No payment is taken on booking");
  const availabilityInput = { fromKey: "2026-09-14", toKey: "2026-09-22", lessonType: { duration_minutes: 60 }, now: new Date() };
  const available = await computeAvailability(env, availabilityInput);
  const offeredStarts = Object.values(available.slotsByDate).flat().map((slot) => slot.startAt);
  assert.ok(rows.every((row) => !offeredStarts.includes(row.starts_at)), "Booked single lessons must not be advertised as free when their series ID is null");
  const moving = await computeAvailability(env, { ...availabilityInput, ignoreBookingId: rows[0].id });
  const movingStarts = Object.values(moving.slotsByDate).flat().map((slot) => slot.startAt);
  assert.ok(movingStarts.includes(rows[0].starts_at), "Moving one single lesson may reuse its own time");
  assert.ok(rows.slice(1).every((row) => !movingStarts.includes(row.starts_at)), "Moving a single lesson must retain all other busy times");
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE kind='student_series_booked'").get().n, 1);
});
await test("two weekly starts must share a week, snapshot private rates and keep both Porto times through DST", async () => {
  const user = await selectionFixture();
  await call("/me/recurring-rates", { user, body: { code: "TEST15", durationMinutes: 60 } });
  assert.equal((await call("/bookings", { user, body: selectionBody({ repeat: 4, expectedPriceCents: 1500, startAts: [selectedStarts[0], "2026-09-21T09:00:00Z"] }) })).status, 400);
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4, expectedPriceCents: 1500, startAts: ["2026-10-19T09:00:00Z", "2026-10-20T09:00:00Z"] }) });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).selection.booked.length, 8);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 2);
  const rows = db.prepare("SELECT * FROM bookings WHERE student_id=? ORDER BY starts_at").all(user);
  assert.ok(rows.every((row) => row.amount_cents === 1500));
  assert.equal(rows[2].starts_at, "2026-10-26T10:00:00.000Z", "10:00 Porto survives the winter offset change");
  assert.equal(rows[3].starts_at, "2026-10-27T10:00:00.000Z");
});
await test("a slot taken between preview and the atomic claim leaves no partial selection or orphan series", async () => {
  const user = await selectionFixture();
  beforeRun = (sql) => {
    if (!sql.startsWith("WITH candidates")) return;
    beforeRun = null;
    booking("competitor", { owner: "bob", start: selectedStarts[1], end: "2026-09-15T10:00:00.000Z" });
  };
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4 }) });
  assert.equal(response.status, 409, await response.clone().text());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);
});
await test("a shared card setup holds both runs, saves once and confirms all occurrences on a signed webhook", async () => {
  const user = await selectionFixture({ savedCard: false });
  const requestsBefore = checkoutRequests.length;
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4 }) });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal(checkoutRequests.length, requestsBefore + 1);
  const sent = new URLSearchParams(checkoutRequests.at(-1).body);
  assert.equal(sent.get("mode"), "setup");
  assert.equal(sent.get("metadata[selection_count]"), "8");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='pending_payment'").get().n, 8);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);
  const event = selectionEvent(user, { count: 8 });
  const result = await webhook(event);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE payment_status='scheduled' AND status='confirmed'").get().n, 8);
  assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, `pm_${user}`);
  await drain();
  const emails = db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n;
  assert.equal(emails, 1);
  assert.equal((await webhook(event)).status, 200);
  assert.equal((await webhook({ ...event, id: "evt_selection_duplicate" })).status, 200);
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, emails);
});
await test("one-off selection card setup confirms every date and rejects wrong session or partial expiry", async () => {
  const user = await selectionFixture({ savedCard: false });
  assert.equal((await call("/bookings", { user, body: selectionBody() })).status, 201);
  const event = selectionEvent(user, { count: 2 });
  const wrong = structuredClone(event); wrong.data.object.id = "cs_other";
  assert.equal((await webhook(wrong)).status, 400);
  const wrongCount = structuredClone(event); wrongCount.data.object.metadata.selection_count = "3";
  assert.equal((await webhook(wrongCount)).status, 409);
  duringSetupRead = () => db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T09:59:00.000Z' WHERE student_id=? AND starts_at=?").run(user, selectedStarts[1]);
  assert.equal((await webhook(event)).status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").get().n, 0);
  assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);
  duringSetupRead = null;
  db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T10:35:00.000Z' WHERE student_id=?").run(user);
  assert.equal((await webhook(event)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").get().n, 2);
});
await test("failed checkout cleans the entire held selection and both weekly recipes", async () => {
  const user = await selectionFixture({ savedCard: false });
  checkoutUnavailable = true;
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4 }) });
  assert.equal(response.status, 502, await response.clone().text());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
  checkoutUnavailable = false;
});
await test("two ongoing times create 24 lessons and an abandoned checkout releases both sequences", async () => {
  const user = await selectionFixture({ savedCard: false });
  const response = await call("/bookings", { user, body: selectionBody({ repeat: null }) });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).selection.booked.length, 24);
  db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T09:00:00.000Z' WHERE student_id=?").run(user);
  await call("/availability?lessonType=single&from=2026-09-14&to=2026-09-15", { method: "GET", user: null });
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
});


// Teacher-added card lessons keep providers isolated while exercising the real
// approval credential, SQLite state transitions, and signed setup webhook.
const TEACHER_PAYMENT_CONSENT_VERSION = "2026-09-13-teacher-arranged-v1";
let manualStudent = 0;
async function manualFixture({ savedCard = true, mandate = false } = {}) {
  await drain();
  db.exec("DELETE FROM manual_booking_payments; DELETE FROM booking_refunds; DELETE FROM bookings; DELETE FROM booking_series; DELETE FROM stripe_events; DELETE FROM email_log;");
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = `manual-${++manualStudent}`;
  student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET);
  if (!savedCard) db.prepare("UPDATE students SET stripe_customer_id=NULL,stripe_payment_method=NULL WHERE id=?").run(id);
  if (mandate) db.prepare("UPDATE students SET teacher_payment_consent_at=?,teacher_payment_consent_version=? WHERE id=?")
    .run(new Date().toISOString(), TEACHER_PAYMENT_CONSENT_VERSION, id);
  Object.assign(env, { EMAIL_DRY_RUN: "0", RESEND_API_KEY: "isolated-email-mock", TEACHER_NOTIFICATIONS_ENABLED: "1", TEACHER_EMAIL: "teacher@example.invalid", STRIPE_UI_MODE: "embedded" });
  testNow = DEFAULT_TEST_NOW;
  duringSetupRead = null; beforeRun = null; beforeBatch = null; checkoutUnavailable = false; checkoutStatus = "open";
  emailUnavailable = false; decline = false; chargeError = null;
  emailRequests.length = 0; checkoutRequests.length = 0; charges.length = 0;
  return id;
}
function manualBody(user, extra = {}) {
  return { email: `${user}@example.invalid`, name: "Test Student", lessonType: "single", startAt: "2026-09-14T09:00:00.000Z", location: "online", paymentMode: "card", ...extra };
}
async function createManual(user, extra = {}) {
  const response = await call("/admin/bookings", { user: "teacher", body: manualBody(user, extra) });
  assert.equal(response.status, 201, await response.clone().text());
  const result = await response.json();
  await drain();
  const row = db.prepare("SELECT * FROM bookings WHERE reference=?").get(result.booking.reference);
  assert.ok(row);
  return { row, result };
}
function invitationToken(user) {
  const message = emailRequests.find((entry) => entry.to.includes(`${user}@example.invalid`) && entry.text.includes("/confirm-lesson/"));
  assert.ok(message, "The student must receive a private lesson-approval link");
  const match = message.text.match(/\/confirm-lesson\/#token=([^\s<>"']+)/);
  assert.ok(match, "The approval credential stays in the URL fragment");
  return decodeURIComponent(match[1]);
}
function invitationPath(value) { return `/booking-invitations/${encodeURIComponent(value)}`; }
function teacherPermission(user) {
  return db.prepare("SELECT teacher_payment_consent_at,teacher_payment_consent_version FROM students WHERE id=?").get(user);
}
function manualSetupEvent(row, user, id = "evt_manual_setup") {
  const request = checkoutRequests.find((entry) => new URLSearchParams(entry.body).get("client_reference_id") === row.id);
  assert.ok(request);
  const metadata = {};
  for (const [key, value] of new URLSearchParams(request.body)) {
    const match = key.match(/^metadata\[([^\]]+)\]$/);
    if (match) metadata[match[1]] = value;
  }
  setupIntents.set(`seti_${user}`, { status: "succeeded", customer: `cus_${user}`, payment_method: `pm_${user}` });
  const current = db.prepare("SELECT stripe_session_id FROM bookings WHERE id=?").get(row.id);
  return { id, type: "checkout.session.completed", livemode: false, data: { object: {
    id: current.stripe_session_id, client_reference_id: row.id, mode: "setup", status: "complete", customer: `cus_${user}`,
    setup_intent: `seti_${user}`, metadata
  } } };
}
function isClientRejection(response) { assert.ok(response.status >= 400 && response.status < 500, `Expected a client rejection, received ${response.status}`); }

await test("teacher card creation requires teacher authority; omitted or offline payment keeps established arrangements", async () => {
  const user = await manualFixture({ mandate: true });
  for (const actor of [null, user]) {
    assert.equal((await call("/admin/bookings", { user: actor, body: manualBody(user) })).status, 401);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 0);
  for (const paymentMode of [undefined, "offline"]) {
    const { row, result } = await createManual(user, { paymentMode, startAt: paymentMode ? "2026-09-15T09:00:00.000Z" : "2026-09-14T09:00:00.000Z" });
    assert.equal(result.paymentAction, "offline");
    assert.equal(row.status, "confirmed");
    assert.equal(row.payment_status, "not_required");
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manual_booking_payments").get().n, 0);
  assert.equal(checkoutRequests.length, 0);
  assert.equal(charges.length, 0);
});
await test("teacher card creation refuses unavailable Stripe and already-started lessons without side effects", async () => {
  const user = await manualFixture();
  env.STRIPE_EXPECTED_MODE = "live";
  const unavailable = await call("/admin/bookings", { user: "teacher", body: manualBody(user) });
  env.STRIPE_EXPECTED_MODE = "test";
  assert.equal(unavailable.status, 503);
  isClientRejection(await call("/admin/bookings", { user: "teacher", body: manualBody(user, { startAt: "2026-09-05T09:00:00.000Z" }) }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 0);
  assert.equal(emailRequests.length, 0);
  assert.equal(checkoutRequests.length, 0);
  assert.equal(charges.length, 0);
});
await test("a manually entered new email gets a held lesson and private invitation without charging or requiring an account login", async () => {
  await manualFixture();
  const user = `new-manual-${++manualStudent}`;
  assert.equal(db.prepare("SELECT id FROM students WHERE email=?").get(`${user}@example.invalid`), undefined);
  const { row, result } = await createManual(user);
  const created = db.prepare("SELECT * FROM students WHERE id=?").get(row.student_id);
  assert.equal(created.email, `${user}@example.invalid`);
  assert.equal(created.password_hash, "");
  assert.equal(created.stripe_payment_method, null);
  assert.equal(result.paymentAction, "confirmation_required");
  const response = await call(invitationPath(invitationToken(user)), { user: null, method: "GET" });
  assert.equal(response.status, 200);
  assert.equal(checkoutRequests.length, 0);
  assert.equal(charges.length, 0);
});
await test("legacy saved-card consent cannot authorise a teacher lesson, and only the student invitation can approve it", async () => {
  const user = await manualFixture();
  booking("older-self-booking", { owner: user, start: "2026-09-20T09:00:00.000Z", end: "2026-09-20T10:00:00.000Z" });
  db.prepare("UPDATE bookings SET payment_consent_at=?,payment_consent_version='2026-09-01-after-lesson-v1' WHERE id='older-self-booking'").run(new Date().toISOString());
  const { row, result } = await createManual(user, { paymentConsent: true, allowTeacherPayments: true });
  assert.equal(result.paymentAction, "confirmation_required");
  assert.equal(row.status, "pending_payment");
  assert.equal(row.payment_status, "pending");
  assert.equal(row.hold_expires_at, "2026-09-06T10:00:00.000Z");
  assert.equal(row.payment_consent_at, null, "A teacher's request cannot stand in for student consent");
  const secret = invitationToken(user);
  const before = JSON.stringify(db.prepare("SELECT * FROM bookings WHERE id=?").get(row.id));
  const invitation = await call(invitationPath(secret), { user: null, method: "GET" });
  assert.equal(invitation.status, 200);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM bookings WHERE id=?").get(row.id)), before, "Email preview and GET must not accept a lesson");
  const exposed = [JSON.stringify(result), await (await call("/admin/bookings", { user: "teacher", method: "GET" })).text(), await (await call("/me", { user, method: "GET" })).text()];
  assert.ok(exposed.every((value) => !value.includes(secret) && !value.includes(encodeURIComponent(secret))), "Teacher and ordinary account responses must not disclose the approval credential");
  assert.ok(emailRequests.filter((entry) => !entry.to.includes(`${user}@example.invalid`)).every((entry) => !JSON.stringify(entry).includes(secret) && !JSON.stringify(entry).includes(encodeURIComponent(secret))), "Teacher notifications cannot contain the student's payment credential");
  isClientRejection(await call(invitationPath(await token(row.id)), { user: null, body: { paymentConsent: true } }));
  isClientRejection(await call(invitationPath(secret), { user: null, body: { paymentConsent: false, allowTeacherPayments: true } }));
  assert.equal(db.prepare("SELECT payment_consent_at FROM bookings WHERE id=?").get(row.id).payment_consent_at, null);
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  assert.equal(checkoutRequests.length, 0);
  assert.equal(charges.length, 0);
});
await test("current explicit teacher permission reuses a saved card and schedules only an after-lesson charge", async () => {
  const user = await manualFixture({ mandate: true });
  const { row, result } = await createManual(user);
  assert.equal(result.paymentAction, "scheduled");
  assert.equal(row.status, "confirmed");
  assert.equal(row.payment_status, "scheduled");
  assert.equal(row.amount_cents, 2500);
  assert.ok(row.payment_consent_at);
  assert.equal(checkoutRequests.length, 0);
  assert.equal(charges.length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE kind='student_manual_confirmation'").get().n, 0);
  await chargeDueLessons(env, new Date(row.starts_at));
  assert.equal(charges.length, 0, "The lesson cannot charge before its scheduled end");
});
await test("revocation immediately before the teacher's scheduling claim wins over an earlier permission read", async () => {
  const user = await manualFixture({ mandate: true });
  beforeRun = (sql) => {
    if (!sql.startsWith("UPDATE bookings SET status = 'confirmed', payment_status = 'scheduled'")) return;
    beforeRun = null;
    db.prepare("UPDATE students SET teacher_payment_consent_at=NULL,teacher_payment_consent_version=NULL,teacher_payment_revision=teacher_payment_revision+1 WHERE id=?").run(user);
  };
  const { row, result } = await createManual(user);
  assert.equal(result.paymentAction, "confirmation_required");
  assert.equal(row.status, "pending_payment");
  assert.equal(row.payment_consent_at, null);
  assert.ok(invitationToken(user));
  assert.equal(charges.length, 0);
});
await test("a teacher's hold expiring during its database claim cannot automatically confirm after the lesson starts", async () => {
  const user = await manualFixture({ mandate: true });
  beforeRun = (sql) => {
    if (!sql.startsWith("INSERT INTO manual_booking_payments")) return;
    beforeRun = null;
    testNow = "2026-09-05T10:02:00.000Z";
  };
  // Teacher additions intentionally bypass the student's minimum notice rule.
  const response = await call("/admin/bookings", { user: "teacher", body: manualBody(user, { startAt: "2026-09-05T10:01:00.000Z" }) });
  isClientRejection(response);
  await drain();
  const row = db.prepare("SELECT * FROM bookings WHERE student_id=?").get(user);
  assert.equal(row.status, "pending_payment");
  assert.equal(row.payment_consent_at, null);
  assert.equal(emailRequests.length, 0);
  assert.equal(charges.length, 0);
});
await test("an expired teacher hold cannot auto-confirm over a competing active booking", async () => {
  for (const competitorStatus of ["confirmed", "pending_payment"]) {
    const user = await manualFixture({ mandate: true });
    beforeRun = (sql) => {
      if (!sql.startsWith("UPDATE bookings SET status = 'confirmed', payment_status = 'scheduled'")) return;
      beforeRun = null;
      testNow = "2026-09-06T10:01:00.000Z";
      booking("competing-manual-slot", { owner: "bob", start: "2026-09-14T09:00:00.000Z", end: "2026-09-14T10:00:00.000Z" });
      if (competitorStatus === "pending_payment") db.prepare("UPDATE bookings SET status='pending_payment',payment_status='pending',hold_expires_at='2026-09-07T10:00:00.000Z' WHERE id='competing-manual-slot'").run();
    };
    const response = await call("/admin/bookings", { user: "teacher", body: manualBody(user) });
    isClientRejection(response);
    await drain();
    assert.equal(db.prepare("SELECT status FROM bookings WHERE student_id=?").get(user).status, "pending_payment");
    assert.equal(db.prepare("SELECT status FROM bookings WHERE id='competing-manual-slot'").get().status, competitorStatus);
    assert.equal(emailRequests.length, 0);
    assert.equal(charges.length, 0);
  }
});
await test("stale or incomplete teacher permission and permission without a saved card still require confirmation", async () => {
  for (const state of ["old-version", "missing-timestamp", "no-card"]) {
    const user = await manualFixture({ savedCard: state !== "no-card", mandate: true });
    if (state === "old-version") db.prepare("UPDATE students SET teacher_payment_consent_version='retired-version' WHERE id=?").run(user);
    if (state === "missing-timestamp") db.prepare("UPDATE students SET teacher_payment_consent_at=NULL WHERE id=?").run(user);
    const { row, result } = await createManual(user);
    assert.equal(result.paymentAction, "confirmation_required", state);
    assert.equal(row.status, "pending_payment", state);
    assert.equal(checkoutRequests.length, 0);
    assert.equal(charges.length, 0);
  }
});
await test("an existing saved card confirms one teacher lesson idempotently without granting future permission", async () => {
  const user = await manualFixture();
  const { row } = await createManual(user);
  const path = invitationPath(invitationToken(user));
  const accepted = await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: false } });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  const updated = db.prepare("SELECT * FROM bookings WHERE id=?").get(row.id);
  assert.equal(updated.status, "confirmed");
  assert.equal(updated.payment_status, "scheduled");
  assert.ok(updated.payment_consent_at);
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  assert.equal(checkoutRequests.length, 0);
  assert.equal(charges.length, 0);
  await drain();
  const delivered = emailRequests.length;
  assert.equal((await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } })).status, 200);
  await drain();
  assert.equal(emailRequests.length, delivered, "Replaying acceptance cannot duplicate confirmation mail");
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null, "A replay cannot broaden an already accepted lesson's consent");
});
await test("a saved card changed between approval read and transaction is preserved and cannot confirm or grant permission", async () => {
  for (const change of ["replacement", "removed", "different-customer"]) {
    const user = await manualFixture();
    const { row } = await createManual(user);
    const updatedCustomer = change === "different-customer" ? "cus_replaced" : `cus_${user}`;
    const updatedMethod = change === "removed" ? null : "pm_replaced";
    beforeBatch = () => {
      beforeBatch = null;
      db.prepare("UPDATE students SET stripe_customer_id=?,stripe_payment_method=? WHERE id=?").run(updatedCustomer, updatedMethod, user);
    };
    const response = await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true, allowTeacherPayments: true } });
    isClientRejection(response);
    await drain();
    const student = db.prepare("SELECT * FROM students WHERE id=?").get(user);
    assert.equal(student.stripe_customer_id, updatedCustomer, change);
    assert.equal(student.stripe_payment_method, updatedMethod, change);
    assert.equal(student.teacher_payment_consent_at, null, change);
    const pending = db.prepare("SELECT * FROM bookings WHERE id=?").get(row.id);
    assert.equal(pending.status, "pending_payment", change);
    assert.equal(pending.payment_consent_at, null, change);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id=? AND kind='student_booked'").get(row.id).n, 0);
    assert.equal(checkoutRequests.length, 0);
    assert.equal(charges.length, 0);
  }
});
await test("approval cannot confirm an expired hold over another active booking while entering its transaction", async () => {
  for (const competitorStatus of ["confirmed", "pending_payment"]) {
    const user = await manualFixture();
    const { row } = await createManual(user);
    beforeBatch = () => {
      beforeBatch = null;
      testNow = "2026-09-06T10:01:00.000Z";
      booking("competing-approval-slot", { owner: "bob", start: row.starts_at, end: row.ends_at });
      if (competitorStatus === "pending_payment") db.prepare("UPDATE bookings SET status='pending_payment',payment_status='pending',hold_expires_at='2026-09-07T10:00:00.000Z' WHERE id='competing-approval-slot'").run();
    };
    const response = await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true, allowTeacherPayments: true } });
    isClientRejection(response);
    await drain();
    assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(row.id).status, "pending_payment");
    assert.equal(db.prepare("SELECT status FROM bookings WHERE id='competing-approval-slot'").get().status, competitorStatus);
    assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id=? AND kind='student_booked'").get(row.id).n, 0);
    assert.equal(charges.length, 0);
  }
});
await test("optional future permission is explicit and authenticated revocation affects only its owner", async () => {
  const user = await manualFixture();
  const { row } = await createManual(user);
  assert.deepEqual(await (await call("/me/teacher-payments", { user, method: "GET" })).json(), { enabled: false });
  assert.equal((await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true, allowTeacherPayments: true } })).status, 200);
  await drain();
  assert.equal(teacherPermission(user).teacher_payment_consent_version, TEACHER_PAYMENT_CONSENT_VERSION);
  assert.deepEqual(await (await call("/me/teacher-payments", { user, method: "GET" })).json(), { enabled: true });
  const next = await createManual(user, { startAt: "2026-09-15T09:00:00.000Z" });
  assert.equal(next.result.paymentAction, "scheduled");
  assert.equal((await call("/me/teacher-payments", { user: null, body: { enabled: false } })).status, 401);
  isClientRejection(await call("/me/teacher-payments", { user, body: { enabled: true } }));
  assert.equal((await call("/me/teacher-payments", { user: "outsider", body: { enabled: false, studentId: user } })).status, 200);
  assert.ok(teacherPermission(user).teacher_payment_consent_at, "Another account cannot revoke this student's permission");
  assert.equal((await call("/me/teacher-payments", { user, body: { enabled: false } })).status, 200);
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  assert.equal(teacherPermission(user).teacher_payment_consent_version, null);
  assert.equal((await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true, allowTeacherPayments: true } })).status, 200);
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null, "Replaying an old approved invitation cannot restore revoked future permission");
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(row.id).payment_status, "scheduled", "Revocation preserves the already agreed lesson");
  assert.equal((await createManual(user, { startAt: "2026-09-16T09:00:00.000Z" })).result.paymentAction, "confirmation_required");
  assert.equal(charges.length, 0);
});
await test("new payer receives one hosted card setup, and its verified callback alone activates optional future permission", async () => {
  const user = await manualFixture({ savedCard: false });
  const { row } = await createManual(user);
  const path = invitationPath(invitationToken(user));
  const accepted = await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.ok((await accepted.json()).checkoutUrl);
  assert.equal(checkoutRequests.length, 1);
  const setup = new URLSearchParams(checkoutRequests[0].body);
  assert.equal(setup.get("mode"), "setup");
  assert.equal(setup.get("payment_method_types[0]"), "card");
  assert.ok(setup.get("success_url"), "Email-started setup is hosted even when ordinary booking uses embedded Stripe");
  assert.equal(setup.get("ui_mode"), null);
  assert.equal(charges.length, 0);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(row.id).status, "pending_payment");
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null, "An abandoned checkout is not reusable payment permission");
  assert.equal((await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } })).status, 200);
  assert.equal(checkoutRequests.length, 1, "Repeat submission reuses the same checkout");
  const event = manualSetupEvent(row, user);
  const wrongSession = structuredClone(event); wrongSession.data.object.id = "cs_other";
  assert.equal((await webhook(wrongSession)).status, 400);
  const wrongCustomer = structuredClone(event); wrongCustomer.data.object.customer = "cus_other";
  isClientRejection(await webhook(wrongCustomer));
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  const confirmed = await webhook(event);
  assert.equal(confirmed.status, 200, await confirmed.clone().text());
  assert.equal(db.prepare("SELECT status,payment_status FROM bookings WHERE id=?").get(row.id).status, "confirmed");
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(row.id).payment_status, "scheduled");
  assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, `pm_${user}`);
  assert.equal(teacherPermission(user).teacher_payment_consent_version, TEACHER_PAYMENT_CONSENT_VERSION);
  await drain();
  const delivered = emailRequests.length;
  assert.equal((await webhook(event)).status, 200);
  assert.equal((await webhook({ ...event, id: "evt_manual_setup_duplicate" })).status, 200);
  await drain();
  assert.equal(emailRequests.length, delivered);
  assert.equal(charges.length, 0);
});
await test("failed manual setup preserves the held lesson and retries the same Stripe parameters", async () => {
  const user = await manualFixture({ savedCard: false });
  const { row } = await createManual(user);
  const path = invitationPath(invitationToken(user));
  checkoutUnavailable = true;
  const failed = await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } });
  checkoutUnavailable = false;
  assert.equal(failed.status, 502);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(row.id).status, "pending_payment");
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  const retry = await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } });
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.equal(checkoutRequests.length, 2);
  assert.equal(checkoutRequests[1].key, checkoutRequests[0].key);
  assert.equal(checkoutRequests[1].body, checkoutRequests[0].body, "A lost Stripe response must not change idempotency parameters");
});
await test("student decline and teacher cancellation release pending lessons without fees or consent", async () => {
  for (const actor of ["student", "teacher"]) {
    const user = await manualFixture();
    const { row, result } = await createManual(user, { startAt: "2026-09-05T12:00:00.000Z" });
    assert.equal(result.confirmationExpiresAt, row.starts_at, "A same-day hold ends when the lesson starts");
    const path = invitationPath(invitationToken(user));
    const response = actor === "student"
      ? await call(`${path}/decline`, { user: null })
      : await call(`/admin/bookings/${row.id}/cancel`, { user: "teacher" });
    assert.equal(response.status, 200, await response.clone().text());
    const cancelled = db.prepare("SELECT * FROM bookings WHERE id=?").get(row.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.same_day_fee_status, "not_required");
    isClientRejection(await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } }));
    assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
    assert.equal(checkoutRequests.length, 0);
    assert.equal(charges.length, 0);
  }
});
await test("expired approval cannot reclaim a slot already booked by somebody else", async () => {
  const user = await manualFixture();
  const { row } = await createManual(user);
  const path = invitationPath(invitationToken(user));
  db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T09:59:00.000Z' WHERE id=?").run(row.id);
  const competitor = await createManual("bob", { paymentMode: "offline" });
  isClientRejection(await call(path, { user: null, body: { paymentConsent: true, allowTeacherPayments: true } }));
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(competitor.row.id).status, "confirmed");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE starts_at=? AND status='confirmed'").get(row.starts_at).n, 1);
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  assert.equal(charges.length, 0);
});
await test("expired or concurrently cancelled card setup cannot grant payment permission", async () => {
  for (const stale of ["expired", "cancelled"]) {
    const user = await manualFixture({ savedCard: false });
    const { row } = await createManual(user);
    assert.equal((await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true, allowTeacherPayments: true } })).status, 200);
    const event = manualSetupEvent(row, user);
    duringSetupRead = () => stale === "expired"
      ? db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T09:59:00.000Z' WHERE id=?").run(row.id)
      : db.prepare("UPDATE bookings SET status='cancelled',hold_expires_at=NULL WHERE id=?").run(row.id);
    const response = await webhook(event);
    duringSetupRead = null;
    isClientRejection(response);
    assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
    assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, null, "A stale setup cannot replace the account's card");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE id=? AND status='confirmed'").get(row.id).n, 0);
    assert.equal(charges.length, 0);
  }
});
await test("revocation during an open setup cannot be undone by its later successful webhook", async () => {
  const user = await manualFixture({ savedCard: false });
  const { row } = await createManual(user);
  assert.equal((await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true, allowTeacherPayments: true } })).status, 200);
  assert.equal((await call("/me/teacher-payments", { user, body: { enabled: false } })).status, 200);
  const response = await webhook(manualSetupEvent(row, user));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(row.id).status, "confirmed");
  assert.equal(teacherPermission(user).teacher_payment_consent_at, null);
  assert.equal(teacherPermission(user).teacher_payment_consent_version, null);
});
await test("approved manual lessons use after-lesson charging and the existing hosted recovery on decline", async () => {
  const user = await manualFixture();
  const { row } = await createManual(user);
  assert.equal((await call(invitationPath(invitationToken(user)), { user: null, body: { paymentConsent: true } })).status, 200);
  await drain();
  await chargeDueLessons(env, new Date(row.starts_at));
  assert.equal(charges.length, 0);
  decline = true;
  await chargeDueLessons(env, new Date(row.ends_at));
  decline = false;
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amount, row.amount_cents);
  const due = db.prepare("SELECT * FROM bookings WHERE id=?").get(row.id);
  assert.equal(due.status, "confirmed");
  assert.equal(due.payment_status, "payment_due");
  assert.ok(due.stripe_session_id);
  assert.equal(new URLSearchParams(checkoutRequests.at(-1).body).get("mode"), "payment");
  assert.ok(emailRequests.some((entry) => entry.to.includes(`${user}@example.invalid`) && entry.text.includes("/book/?manage=")));
  const recovery = await call(`/bookings/${await token(row.id)}/payment`, { user: null, body: { purpose: "lesson" } });
  assert.equal(recovery.status, 200);
  assert.ok((await recovery.json()).url.includes("checkout.stripe.com"), "The durable email link resolves to the current hosted payment session");
  await chargeDueLessons(env, new Date(row.ends_at));
  assert.equal(charges.length, 1, "Outstanding recovery must not cause another saved-card attempt");
});
await test("a failed invitation retries the private approval message and never sends a false confirmation", async () => {
  const user = await manualFixture();
  emailUnavailable = true;
  const { row } = await createManual(user);
  assert.equal(db.prepare("SELECT status FROM email_log WHERE booking_id=? AND kind='student_manual_confirmation'").get(row.id).status, "failed");
  const secret = invitationToken(user);
  const previousRequests = emailRequests.length;
  db.prepare("UPDATE email_log SET created_at='2026-09-05T09:50:00.000Z' WHERE booking_id=? AND status='failed'").run(row.id);
  emailUnavailable = false;
  await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx);
  await drain();
  const retried = emailRequests.slice(previousRequests).filter((entry) => entry.to.includes(`${user}@example.invalid`));
  assert.equal(retried.length, 1);
  assert.ok(retried[0].text.includes(encodeURIComponent(secret)));
  assert.equal(db.prepare("SELECT status FROM email_log WHERE booking_id=? AND kind='student_manual_confirmation'").get(row.id).status, "sent");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id=? AND kind='student_booked'").get(row.id).n, 0);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(row.id).status, "pending_payment");
});
Object.assign(env, { EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0" });
delete env.RESEND_API_KEY;

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

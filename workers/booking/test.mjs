/**
 * Unit tests for the parts of the booking Worker that are pure logic and
 * genuinely easy to get wrong: timezone arithmetic across DST, iCalendar
 * escaping and folding, and manage-link signing.
 *
 * Run with `npm run test:booking`. No network, no database, no Worker runtime.
 */

import assert from "node:assert/strict";
import { candidateStartMinutes } from "./availability.mjs";
import { verifyWebhook } from "./stripe.mjs";
import { verifyGoogleIdToken } from "./google.mjs";
import { hashPassword, verifyPassword, passwordProblem } from "./auth.mjs";
import { buildCalendarInvite, calendarUid } from "./ics.mjs";
import { createManageToken, readManageToken, safeEqual, bookingReference } from "./tokens.mjs";
import {
  addDaysToKey,
  dateKey,
  dayBounds,
  eachDateKey,
  differingZonedTime,
  formatInZone,
  formatShort,
  isValidTimeZone,
  offsetMinutes,
  parseDateKey,
  weekdayOf,
  zonedToUtc
} from "./time.mjs";

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split("\n")[0]}`);
  }
}

// --- Time -------------------------------------------------------------------

await test("Porto is UTC+1 in summer and UTC+0 in winter", () => {
  assert.equal(zonedToUtc(2026, 7, 15, 600).toISOString(), "2026-07-15T09:00:00.000Z");
  assert.equal(zonedToUtc(2026, 12, 15, 600).toISOString(), "2026-12-15T10:00:00.000Z");
});

await test("the spring-forward day is 23 hours long", () => {
  const { start, end } = dayBounds("2026-03-29");
  assert.equal((end - start) / 3600000, 23);
});

await test("the autumn fall-back day is 25 hours long", () => {
  const { start, end } = dayBounds("2026-10-25");
  assert.equal((end - start) / 3600000, 25);
});

await test("10:00 Porto stays 10:00 Porto across the DST boundary", () => {
  // The whole point of storing minutes-from-midnight rather than a fixed
  // offset: her 10:00 lesson must not become 09:00 when the clocks change.
  const before = zonedToUtc(2026, 10, 24, 600);
  const after = zonedToUtc(2026, 10, 26, 600);
  assert.equal(formatInZone(before).slice(-5), "10:00");
  assert.equal(formatInZone(after).slice(-5), "10:00");
  // ...even though they are a different number of UTC hours apart.
  assert.notEqual(before.toISOString().slice(11, 16), after.toISOString().slice(11, 16));
});

await test("offsetMinutes tracks the transition", () => {
  assert.equal(offsetMinutes(new Date("2026-07-15T12:00:00Z")), 60);
  assert.equal(offsetMinutes(new Date("2026-12-15T12:00:00Z")), 0);
});

await test("impossible dates are rejected rather than rolled forward", () => {
  assert.equal(parseDateKey("2026-02-31"), null);
  assert.equal(parseDateKey("2026-13-01"), null);
  assert.equal(parseDateKey("not-a-date"), null);
  assert.deepEqual(parseDateKey("2026-02-28"), { year: 2026, month: 2, day: 28 });
});

await test("weekday convention matches JavaScript (0 = Sunday)", () => {
  assert.equal(weekdayOf("2026-08-30"), 0); // Sunday
  assert.equal(weekdayOf("2026-08-31"), 1); // Monday
  assert.equal(weekdayOf("2026-08-29"), 6); // Saturday
});

await test("date arithmetic crosses month and year boundaries", () => {
  assert.equal(addDaysToKey("2026-08-31", 1), "2026-09-01");
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
});

await test("eachDateKey is inclusive and refuses to run away", () => {
  assert.deepEqual(eachDateKey("2026-08-30", "2026-09-01"), ["2026-08-30", "2026-08-31", "2026-09-01"]);
  assert.equal(eachDateKey("2026-09-01", "2026-08-01").length, 0);
  assert.ok(eachDateKey("2020-01-01", "2030-01-01").length <= 400);
});

await test("dateKey reports the Porto date, not the UTC one", () => {
  // 00:30 Porto in summer is 23:30 UTC the previous day. A booking then belongs
  // to the Porto date, or her whole day boundary is off by one.
  assert.equal(dateKey(new Date("2026-07-14T23:30:00Z")), "2026-07-15");
});

await test("invalid timezones are rejected", () => {
  assert.equal(isValidTimeZone("Europe/Lisbon"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
  assert.equal(isValidTimeZone(""), false);
});

// --- Slot generation --------------------------------------------------------

const asTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

await test("lastStart is a start time, so lesson length does not shorten the day", () => {
  // Her Wed-Fri rule: first start 17:00, last start 19:00.
  const range = [{ start: 1020, lastStart: 1140 }];
  const hour = candidateStartMinutes({ startRanges: range, duration: 60, interval: 30 });
  const longer = candidateStartMinutes({ startRanges: range, duration: 90, interval: 30 });

  // Both formats must still offer 19:00 — the 90-minute one simply runs to 20:30.
  assert.equal(asTime(hour.at(-1)), "19:00");
  assert.equal(asTime(longer.at(-1)), "19:00");
  assert.deepEqual(hour, longer);
});

await test("a blocked span withholds every lesson that would overlap it", () => {
  const range = [{ start: 600, lastStart: 1140 }];
  // She is out 13:00-14:00.
  const blockedSpans = [{ start: 780, end: 840 }];
  const starts = candidateStartMinutes({ startRanges: range, blockedSpans, duration: 60, interval: 30 }).map(asTime);

  // 12:30 would run into 13:00, so it goes too — not just the slots inside it.
  assert.ok(!starts.includes("12:30"), "a lesson overlapping the block was still offered");
  assert.ok(!starts.includes("13:00"));
  assert.ok(!starts.includes("13:30"));
  assert.ok(starts.includes("12:00"), "12:00 finishes exactly as the block starts and is fine");
  assert.ok(starts.includes("14:00"), "14:00 begins exactly as the block ends and is fine");
});

await test("a longer lesson is withheld earlier than a shorter one", () => {
  const range = [{ start: 600, lastStart: 1140 }];
  const blockedSpans = [{ start: 780, end: 840 }];
  const hour = candidateStartMinutes({ startRanges: range, blockedSpans, duration: 60, interval: 30 }).map(asTime);
  const longer = candidateStartMinutes({ startRanges: range, blockedSpans, duration: 90, interval: 30 }).map(asTime);

  assert.ok(hour.includes("12:00"));
  assert.ok(!longer.includes("12:00"), "a 90-minute lesson at 12:00 would run into the block");
  assert.ok(longer.includes("11:30"));
});

await test("a lunch block withholds a long lesson earlier than a short one", () => {
  // Her Mon-Tue rule, with 12:30-13:30 blocked every weekday.
  const startRanges = [{ start: 600, lastStart: 1140 }];
  const blockedSpans = [{ start: 750, end: 810 }];
  const hour = candidateStartMinutes({ startRanges, blockedSpans, duration: 60, interval: 30 }).map(asTime);
  const longer = candidateStartMinutes({ startRanges, blockedSpans, duration: 90, interval: 30 }).map(asTime);

  // An hour ending exactly as lunch begins is fine; the next one is not.
  assert.ok(hour.includes("11:30"));
  assert.ok(!hour.includes("12:00"));
  assert.ok(hour.includes("13:30"));

  // Ninety minutes from 11:30 would run to 13:00, straight through it. This is
  // why lunch is a blocked span rather than a gap between two rules — splitting
  // the rules could not have known the lesson's length.
  assert.ok(!longer.includes("11:30"));
  assert.ok(longer.includes("11:00"));
  assert.ok(longer.includes("13:30"));
});

await test("overlapping rules merge instead of double-offering a time", () => {
  const starts = candidateStartMinutes({
    startRanges: [
      { start: 600, lastStart: 720 },
      { start: 660, lastStart: 780 }
    ],
    duration: 60,
    interval: 30
  });
  assert.equal(new Set(starts).size, starts.length, "a time was offered twice");
  assert.equal(asTime(starts[0]), "10:00");
  assert.equal(asTime(starts.at(-1)), "13:00");
});

await test("a whole-day block leaves nothing bookable", () => {
  const starts = candidateStartMinutes({
    startRanges: [{ start: 600, lastStart: 1140 }],
    blockedSpans: [{ start: 0, end: 1440 }],
    duration: 60,
    interval: 30
  });
  assert.equal(starts.length, 0);
});

await test("a second timezone is only offered when the clock actually differs", () => {
  const summer = new Date("2026-09-25T18:00:00Z");
  const winter = new Date("2026-12-15T10:00:00Z");

  // Lisbon and London share an offset all year, so showing both is pure noise —
  // "19:00 (WEST) / 19:00 (BST)" is what a UK student was being sent.
  assert.equal(differingZonedTime(summer, "Europe/London"), null);
  assert.equal(differingZonedTime(winter, "Europe/London"), null);
  assert.equal(differingZonedTime(summer, "Europe/Lisbon"), null);
  assert.equal(differingZonedTime(summer, ""), null);

  // A genuinely different clock is still shown.
  assert.match(differingZonedTime(summer, "America/New_York") ?? "", /14:00/);
  assert.match(differingZonedTime(summer, "Europe/Berlin") ?? "", /20:00/);
});

await test("the short form used in subject lines stays short and is Porto-based", () => {
  const summer = new Date("2026-09-25T18:00:00Z");
  assert.equal(formatShort(summer), "Fri 25 Sept, 19:00");

  // Winter, when Porto is UTC — the same instant must not shift the label.
  const winter = new Date("2026-12-15T10:00:00Z");
  assert.equal(formatShort(winter), "Tue 15 Dec, 10:00");

  // Short enough that an inbox does not truncate the sender's meaning away.
  assert.ok(formatShort(summer).length <= 20, formatShort(summer));
});

// --- iCalendar --------------------------------------------------------------

await test("TEXT values escape backslash, semicolon, comma and newline", () => {
  const ics = buildCalendarInvite({
    method: "REQUEST",
    uid: "u@x",
    sequence: 0,
    summary: "A; B, C\\D",
    description: "line one\nline two",
    location: "Online",
    startsAt: "2026-09-03T09:00:00.000Z",
    endsAt: "2026-09-03T10:00:00.000Z",
    organiserName: "Inês",
    organiserEmail: "a@b.com"
  });
  assert.ok(ics.includes("SUMMARY:A\\; B\\, C\\\\D"), "escaping is wrong");
  assert.ok(ics.includes("DESCRIPTION:line one\\nline two"));
});

await test("no line exceeds 75 octets, and accents survive folding", () => {
  const ics = buildCalendarInvite({
    method: "REQUEST",
    uid: calendarUid("abc"),
    sequence: 3,
    summary: "Aula de Português com a Inês — um título deliberadamente longo para forçar a dobragem",
    description: "Inês Dias Baía",
    location: "Porto",
    startsAt: "2026-09-03T09:00:00.000Z",
    endsAt: "2026-09-03T10:00:00.000Z",
    organiserName: "Inês Dias Baía",
    organiserEmail: "a@b.com",
    attendees: [{ name: "Inês Dias Baía", email: "i@example.com" }]
  });

  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  assert.ok(ics.replace(/\r\n /g, "").includes("Português"), "unfolded text lost its accents");
});

await test("a cancellation is CANCEL/CANCELLED and carries no alarm", () => {
  const ics = buildCalendarInvite({
    method: "CANCEL",
    uid: "u@x",
    sequence: 2,
    summary: "s",
    description: "d",
    location: "l",
    startsAt: "2026-09-03T09:00:00.000Z",
    endsAt: "2026-09-03T10:00:00.000Z",
    organiserName: "I",
    organiserEmail: "a@b.com"
  });
  assert.ok(ics.includes("METHOD:CANCEL"));
  assert.ok(ics.includes("STATUS:CANCELLED"));
  assert.ok(!ics.includes("BEGIN:VALARM"), "a cancelled event should not remind anyone");
});

await test("UID is stable so updates land on the original event", () => {
  assert.equal(calendarUid("abc"), calendarUid("abc"));
  assert.notEqual(calendarUid("abc"), calendarUid("def"));
});

// --- Tokens -----------------------------------------------------------------

await test("a manage token round-trips", async () => {
  const token = await createManageToken("booking-1", "secret");
  assert.equal(await readManageToken(token, "secret"), "booking-1");
});

await test("a tampered or re-signed token is rejected", async () => {
  const token = await createManageToken("booking-1", "secret");
  assert.equal(await readManageToken(`${token}x`, "secret"), null);
  assert.equal(await readManageToken(token, "other-secret"), null);
  // The signature belongs to that booking id and cannot be moved to another.
  const [, signature] = token.split(".");
  assert.equal(await readManageToken(`booking-2.${signature}`, "secret"), null);
  assert.equal(await readManageToken("nonsense", "secret"), null);
  assert.equal(await readManageToken("", "secret"), null);
});

await test("safeEqual compares correctly", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
  assert.equal(safeEqual(undefined, ""), true);
});

await test("booking references avoid ambiguous glyphs", () => {
  for (let index = 0; index < 200; index += 1) {
    const reference = bookingReference();
    assert.match(reference, /^PT-[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{6}$/);
  }
});

// --- Stripe webhook signature ------------------------------------------------

const SECRET = "whsec_test_secret";

async function stripeSignature(payload, timestamp, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

await test("a correctly signed webhook is accepted", async () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await stripeSignature(payload, timestamp)}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), true);
});

await test("a webhook signed with the wrong secret is rejected", async () => {
  const payload = JSON.stringify({ id: "evt_1" });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await stripeSignature(payload, timestamp, "whsec_wrong")}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), false);
});

await test("a tampered payload is rejected even with a valid signature", async () => {
  // The exact attack this guards: marking someone else's booking paid.
  const original = JSON.stringify({ id: "evt_1", amount: 100 });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await stripeSignature(original, timestamp)}`;
  const tampered = JSON.stringify({ id: "evt_1", amount: 999999 });
  assert.equal(await verifyWebhook(tampered, header, SECRET), false);
});

await test("an old signature is rejected, so a captured request cannot be replayed", async () => {
  const payload = JSON.stringify({ id: "evt_1" });
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const header = `t=${stale},v1=${await stripeSignature(payload, stale)}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), false);
});

await test("malformed signature headers are rejected", async () => {
  const payload = "{}";
  for (const header of ["", "nonsense", "t=123", "v1=abc", "t=abc,v1=abc", null, undefined]) {
    assert.equal(await verifyWebhook(payload, header, SECRET), false, `accepted: ${header}`);
  }
});

// --- Password hashing --------------------------------------------------------

await test("a password round-trips, and a wrong one does not", async () => {
  const stored = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("Correct horse battery", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

await test("every hash is salted, so identical passwords do not collide", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

await test("no single PBKDF2 call exceeds the Workers cap of 100,000", async () => {
  // The runtime refuses more than this per call, and Miniflare does not
  // enforce it — which is why the deployed Worker was the first thing to fail.
  const [, cost] = (await hashPassword("x")).split("$");
  const [rounds, iterations] = cost.split("x").map(Number);
  assert.ok(iterations <= 100000, `single-call iterations too high: ${iterations}`);
  assert.ok(rounds * iterations >= 200000, `work factor too low: ${rounds * iterations}`);
});

await test("a stored hash carries its own cost, so it survives a change of cost", async () => {
  // A single-round record from before chaining must still verify.
  const legacy = await hashPassword("legacy");
  const asSingleRound = legacy.replace(/\$\d+x(\d+)\$/, "$$$1$$");
  assert.notEqual(asSingleRound, legacy);
  // The rewritten record has a different work factor, so it must NOT verify —
  // proving the cost is read from the record rather than assumed.
  assert.equal(await verifyPassword("legacy", asSingleRound), false);
  assert.equal(await verifyPassword("legacy", legacy), true);
});

await test("malformed hash records are rejected rather than throwing", async () => {
  for (const stored of ["", "nonsense", "pbkdf2$$$", "bcrypt$10$abc$def", "pbkdf2$0x0$YQ$YQ", null, undefined]) {
    assert.equal(await verifyPassword("anything", stored), false, `accepted: ${stored}`);
  }
});

await test("password length is enforced", () => {
  assert.ok(passwordProblem("short"));
  assert.equal(passwordProblem("eight888"), null);
  assert.ok(passwordProblem("x".repeat(500)));
});

// --- Google ID tokens --------------------------------------------------------

const CLIENT_ID = "1234.apps.googleusercontent.com";

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodePart = (object) => b64url(new TextEncoder().encode(JSON.stringify(object)));

const googleKeyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const publicJwk = await crypto.subtle.exportKey("jwk", googleKeyPair.publicKey);

// Stand in for Google's published keys, so no network is touched.
globalThis.fetch = async () =>
  new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" }
  });

async function makeIdToken(overrides = {}, { signingKey = googleKeyPair.privateKey, kid = "test-key" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodePart({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "10769150350006150715",
    email: "joana@example.com",
    email_verified: true,
    name: "Joana Ferreira",
    iat: now,
    exp: now + 3600,
    ...overrides
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64url(signature)}`;
}

await test("a genuine Google ID token is accepted", async () => {
  const profile = await verifyGoogleIdToken(await makeIdToken(), CLIENT_ID);
  assert.equal(profile?.email, "joana@example.com");
  assert.equal(profile?.name, "Joana Ferreira");
});

await test("a token minted for another app is rejected", async () => {
  // Without the audience check, any Google app's token would sign a person in.
  assert.equal(await verifyGoogleIdToken(await makeIdToken(), "9999.apps.googleusercontent.com"), null);
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ aud: "someone-else" }), CLIENT_ID), null);
});

await test("a token from the wrong issuer is rejected", async () => {
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ iss: "https://evil.example" }), CLIENT_ID), null);
});

await test("an expired token is rejected", async () => {
  const past = Math.floor(Date.now() / 1000) - 7200;
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ iat: past, exp: past + 3600 }), CLIENT_ID), null);
});

await test("a token signed by someone else is rejected", async () => {
  const impostor = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const forged = await makeIdToken({}, { signingKey: impostor.privateKey });
  assert.equal(await verifyGoogleIdToken(forged, CLIENT_ID), null);
});

await test("an unverified Google email is rejected", async () => {
  // Otherwise someone could claim an account belonging to an address they do
  // not control, simply by putting it on a Google profile.
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ email_verified: false }), CLIENT_ID), null);
});

await test("an unsigned token is rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "none", kid: "test-key" });
  const payload = encodePart({ iss: "https://accounts.google.com", aud: CLIENT_ID, email: "a@b.com", exp: now + 60 });
  assert.equal(await verifyGoogleIdToken(`${header}.${payload}.`, CLIENT_ID), null);
});

await test("a token referencing an unknown key is rejected", async () => {
  assert.equal(await verifyGoogleIdToken(await makeIdToken({}, { kid: "not-a-real-key" }), CLIENT_ID), null);
});

await test("malformed tokens are rejected", async () => {
  for (const token of ["", "a.b", "a.b.c", "not-a-token", null, undefined]) {
    assert.equal(await verifyGoogleIdToken(token, CLIENT_ID), null, `accepted: ${token}`);
  }
});

// --- Report -----------------------------------------------------------------

if (failures.length) {
  console.error(`\n${failures.length} failing:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`${passed} booking tests passed.`);

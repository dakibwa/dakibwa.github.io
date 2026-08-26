/**
 * Unit tests for the parts of the booking Worker that are pure logic and
 * genuinely easy to get wrong: timezone arithmetic across DST, iCalendar
 * escaping and folding, and manage-link signing.
 *
 * Run with `npm run test:booking`. No network, no database, no Worker runtime.
 */

import assert from "node:assert/strict";
import { buildCalendarInvite, calendarUid } from "./ics.mjs";
import { createManageToken, readManageToken, safeEqual, bookingReference } from "./tokens.mjs";
import {
  addDaysToKey,
  dateKey,
  dayBounds,
  eachDateKey,
  formatInZone,
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

// --- Report -----------------------------------------------------------------

if (failures.length) {
  console.error(`\n${failures.length} failing:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`${passed} booking tests passed.`);

import test from "node:test";
import assert from "node:assert/strict";
import { candidateStartMinutes } from "../workers/booking/availability.mjs";
import {
  bookingSegments,
  canPaintHours,
  dateKey,
  daysOff,
  hoursFromRules,
  hoursProblem,
  lessonStarts,
  mondayOf,
  monthDates,
  paintHours,
  shiftMonth,
} from "../src/lib/teacher-calendar.ts";

test("paint and erase preserve the actual bookable starts at inclusive last-start boundaries", () => {
  const original = [
    { start: 600, lastStart: 690 },
    { start: 810, lastStart: 1140 },
  ];
  const split = paintHours(original, 630, 660, false);
  assert.deepEqual(split, [
    { start: 600, lastStart: 600 },
    { start: 690, lastStart: 690 },
    { start: 810, lastStart: 1140 },
  ]);
  const added = paintHours(split, 780, 720, true);
  const actual = candidateStartMinutes({
    startRanges: added,
    duration: 90,
    interval: 30,
  });
  assert.deepEqual(
    actual,
    [
      600, 690, 720, 750, 780, 810, 840, 870, 900, 930, 960, 990, 1020, 1050,
      1080, 1110, 1140,
    ],
  );
  assert.equal(
    actual.at(-1),
    1140,
    "19:00 remains a valid start for a 90-minute lesson",
  );
  assert.deepEqual(original, [
    { start: 600, lastStart: 690 },
    { start: 810, lastStart: 1140 },
  ]);
});

test("precise windows are preserved and use the same range merge semantics as the Worker", () => {
  const precise = [
    { start: 615, lastStart: 700 },
    { start: 680, lastStart: 760 },
  ];
  assert.equal(canPaintHours(precise, 30), false);
  assert.strictEqual(paintHours(precise, 600, 690, false), precise);
  assert.deepEqual(
    lessonStarts(precise),
    candidateStartMinutes({ startRanges: precise, duration: 60, interval: 30 }),
  );
  const week = hoursFromRules([
    { id: 1, weekday: 1, start_minute: 615, last_start_minute: 700, active: 1 },
    { id: 2, weekday: 2, start_minute: 600, last_start_minute: 690, active: 0 },
  ]);
  assert.deepEqual(week[1], [{ start: 615, lastStart: 700 }]);
  assert.deepEqual(week[2], []);
  assert.equal(hoursProblem(week), null);
  assert.match(
    hoursProblem({ ...week, 1: [{ start: Number.NaN, lastStart: 700 }] }),
    /Monday/,
  );
  assert.match(
    hoursProblem({ ...week, 2: [{ start: 900, lastStart: 800 }] }),
    /Tuesday/,
  );
});

test("whole-day editing does not turn partial blocks, extras or recurring exceptions into days off", () => {
  const base = { date: "2026-09-21", note: "", weekday: null };
  const exceptions = [
    { ...base, id: 1, kind: "blocked", start_minute: null, end_minute: null },
    {
      ...base,
      id: 2,
      date: "2026-09-22",
      kind: "blocked",
      start_minute: 600,
      end_minute: 660,
    },
    {
      ...base,
      id: 3,
      date: "2026-09-23",
      kind: "extra",
      start_minute: 600,
      end_minute: 660,
    },
    {
      ...base,
      id: 4,
      date: "2026-09-24",
      kind: "blocked",
      weekday: 4,
      start_minute: null,
      end_minute: null,
    },
    {
      ...base,
      id: 5,
      date: "2026-09-25",
      kind: "blocked",
      start_minute: 0,
      end_minute: 1440,
    },
  ];
  assert.deepEqual([...daysOff(exceptions)], ["2026-09-21", "2026-09-25"]);
});

test("calendar month/week navigation is independent of local timezone, DST and year boundaries", () => {
  assert.equal(dateKey(new Date("2026-09-07T23:30:00Z")), "2026-09-08");
  assert.equal(dateKey(new Date("2026-12-07T23:30:00Z")), "2026-12-07");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(shiftMonth("2026-12-31", 1), "2027-01-01");
  const february = monthDates("2028-02-01");
  assert.ok(february.includes("2028-02-29"));
  assert.equal(new Set(february).size, february.length);
  assert.equal(february.length % 7, 0);
  assert.equal(new Date(february[0] + "T12:00:00Z").getUTCDay(), 1);
});

test("lessons crossing midnight or the autumn clock change stay visible in Porto dates", () => {
  const overnight = {
    id: "overnight",
    starts_at: "2026-09-06T22:30:00Z",
    ends_at: "2026-09-06T23:30:00Z",
  };
  const segments = bookingSegments([overnight], "2026-09-07");
  assert.equal(segments.length, 1);
  assert.deepEqual(
    { date: segments[0].date, start: segments[0].start, end: segments[0].end },
    { date: "2026-09-07", start: 0, end: 30 },
  );
  const repeatedHour = {
    id: "dst",
    starts_at: "2026-10-25T00:30:00Z",
    ends_at: "2026-10-25T01:30:00Z",
  };
  const [segment] = bookingSegments([repeatedHour], "2026-10-19");
  assert.equal(segment.date, "2026-10-25");
  assert.ok(segment.end > segment.start);
});

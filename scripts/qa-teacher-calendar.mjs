import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// All account and calendar endpoints are isolated fixtures. No provider writes.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const teacher = {
  id: "teacher",
  name: "Inês",
  email: "teacher@example.invalid",
  phone: "",
  timezone: "Europe/Lisbon",
  role: "teacher",
};
const lesson = (id, name, start, location = "online") => ({
  id,
  reference: `TEST-${id}`,
  lesson_name: "60 minutes",
  student_name: name,
  student_email: `${id}@example.invalid`,
  student_phone: "",
  starts_at: start,
  ends_at: new Date(Date.parse(start) + 3600000).toISOString(),
  status: "confirmed",
  location,
  notes: "",
  same_day_change: 0,
  same_day_fee_status: "not_required",
  reschedule_count: 0,
  payment_status: "scheduled",
  attendance_status: "expected",
});

async function fixture(width, options = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    hasTouch: width < 741,
  });
  await page.clock.setFixedTime(new Date("2026-09-07T10:15:00Z"));
  await page.addInitScript(() =>
    localStorage.setItem("ines-student-session", "isolated-teacher-fixture"),
  );
  const state = {
    rules: [
      { id: 1, weekday: 1, start_minute: 600, last_start_minute: 690 },
      { id: 2, weekday: 3, start_minute: 615, last_start_minute: 705 },
    ],
    exceptions: [
      { id: 1, date: "2026-09-21", kind: "blocked", note: "Holiday" },
      {
        id: 2,
        date: "2026-09-21",
        kind: "blocked",
        start_minute: 600,
        end_minute: 660,
        note: "Short break",
      },
      { id: 3, date: "2026-09-22", kind: "extra", note: "Extra hours" },
      { id: 4, date: "2026-09-21", kind: "blocked", note: "Duplicate day" },
    ],
    bookings: [
      lesson("now", "Alex", "2026-09-07T10:00:00Z"),
      lesson("next", "Sam", "2026-09-08T13:00:00Z", "porto"),
    ],
    writes: [],
    errors: [],
    failHours: 0,
    failDay: "",
    failMove: 0,
    failBookings: false,
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/me", (route) =>
    route.fulfill({
      json: {
        student: { ...teacher, role: options.student ? "student" : "teacher" },
        bookings: [],
        series: [],
      },
    }),
  );
  await page.route("**/admin/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const data = request.method() === "POST" ? request.postDataJSON() : null;
    const fail = (error) => route.fulfill({ status: 503, json: { error } });
    if (data) state.writes.push({ path, data });
    if (path === "/admin/availability") {
      if (data) {
        if (state.failHours-- > 0)
          return fail("Hours could not be saved. Try again.");
        state.rules = data.rules.map((rule, id) => ({
          id,
          weekday: rule.weekday,
          start_minute: rule.startMinute,
          last_start_minute: rule.lastStartMinute,
        }));
        return route.fulfill({ json: { ok: true, count: data.rules.length } });
      }
      return route.fulfill({
        json: {
          rules: state.rules,
          exceptions: state.exceptions,
          settings: { slotIntervalMinutes: 30 },
        },
      });
    }
    if (path === "/admin/exceptions") {
      if (data.date === state.failDay) {
        state.failDay = "";
        return fail("Day could not be saved.");
      }
      if (data.remove)
        state.exceptions = state.exceptions.filter(
          (entry) => entry.id !== data.remove,
        );
      else state.exceptions.push({ id: 100 + state.writes.length, ...data });
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/admin/bookings") {
      if (!data) {
        if (state.failBookings) return fail("Lessons could not be loaded.");
        return route.fulfill({ json: { bookings: state.bookings } });
      }
      state.bookings.push(
        lesson("manual", data.name, data.startAt, data.location),
      );
      return route.fulfill({ json: { booking: { reference: "TEST-manual" } } });
    }
    const match = path.match(
      /^\/admin\/bookings\/([^/]+)\/(reschedule|cancel|no-show)$/,
    );
    if (match) {
      const booking = state.bookings.find((entry) => entry.id === match[1]);
      if (match[2] === "reschedule") {
        if (state.failMove-- > 0)
          return fail("That time is unavailable. Choose another time.");
        Object.assign(booking, {
          starts_at: data.startAt,
          ends_at: new Date(Date.parse(data.startAt) + 3600000).toISOString(),
        });
      } else if (match[2] === "cancel") booking.status = "cancelled";
      else booking.attendance_status = data.noShow ? "no_show" : "expected";
      return route.fulfill({ json: { booking } });
    }
    state.errors.push(
      `Unexpected fixture request: ${request.method()} ${path}`,
    );
    return route.abort();
  });
  await page.goto(`${base}/schedule/`, { waitUntil: "domcontentloaded" });
  if (!options.student)
    await page
      .getByRole("heading", { name: "7 Sept – 13 Sept 2026" })
      .waitFor();
  return { page, state };
}

const byDay = (page, date) => page.locator(`[data-day-off="${date}"]`);
const slot = (page, day, minute) =>
  page.locator(`[data-slot-day="${day}"][data-slot-minute="${minute}"]`);
const showHours = (page) =>
  page.getByRole("button", { name: /^Teaching hours/ }).click();
const showLessons = (page) =>
  page.getByRole("button", { name: "Lessons", exact: true }).click();
const noOverflow = async (page) =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Calendar must fit the viewport",
  );

try {
  const { page, state } = await fixture(1440);
  await showHours(page);
  const from = await slot(page, 1, 480).boundingBox();
  const to = await slot(page, 1, 540).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  for (const minute of [480, 510, 540])
    await expect(slot(page, 1, minute)).toHaveAttribute("aria-pressed", "true");
  await slot(page, 1, 510).click();
  await expect(slot(page, 1, 510)).toHaveAttribute("aria-pressed", "false");
  await slot(page, 1, 540).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(slot(page, 1, 570)).toHaveAttribute("aria-pressed", "true");
  assert.equal(state.writes.length, 0, "Selection alone must not save hours");
  state.failHours = 1;
  await page
    .getByRole("button", { name: "Save teaching hours", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Hours could not be saved" })
    .waitFor();
  await expect(slot(page, 1, 570)).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Save teaching hours", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Teaching hours saved" })
    .waitFor();
  assert.deepEqual(
    state.rules
      .filter((rule) => rule.weekday === 1)
      .map(({ start_minute, last_start_minute }) => [
        start_minute,
        last_start_minute,
      ]),
    [
      [480, 480],
      [540, 690],
    ],
  );
  assert.deepEqual(
    state.rules.find((rule) => rule.weekday === 3),
    { id: 2, weekday: 3, start_minute: 615, last_start_minute: 705 },
    "Another day's precise hours must survive painting",
  );
  await slot(page, 3, 600).click();
  await expect(page.getByLabel("Wednesday window 1, first start")).toHaveValue(
    "10:15",
  );
  await page.getByLabel("Wednesday window 1, last start").fill("09:00");
  await expect(
    page.getByRole("button", { name: "Save teaching hours", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();

  // Draft hours survive a lesson mutation and its subsequent booking reload.
  await slot(page, 1, 510).click();
  await showLessons(page);
  await page.getByRole("button", { name: /^Alex,.*View lesson$/ }).click();
  await page.getByRole("button", { name: "Mark no-show", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mark as a no-show?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm no-show" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(state.bookings[0].attendance_status, "no_show");
  await showHours(page);
  await expect(slot(page, 1, 510)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await showLessons(page);
  const sam = page.getByRole("button", { name: /^Sam,.*View lesson$/ });
  await sam.click();
  await page.keyboard.press("Escape");
  await expect(sam).toBeFocused();
  await sam.click();
  await expect(
    page.getByRole("button", { name: "Mark no-show", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Move lesson", exact: true }).click();
  await page.getByLabel("New date").fill("2026-09-10");
  await page.getByRole("dialog").getByLabel("Time in Porto").fill("00:30");
  state.failMove = 1;
  await page.getByRole("button", { name: "Save new time" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "That time is unavailable" })
    .waitFor();
  await expect(page.getByLabel("New date")).toHaveValue("2026-09-10");
  await page.getByRole("button", { name: "Save new time" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    state.bookings[1].starts_at,
    "2026-09-09T23:30:00.000Z",
    "Move must use Porto time across the UTC date boundary",
  );

  // Partial saves reconcile completed writes, retain remaining selections and
  // never delete an extra-hours or partial-day exception.
  await byDay(page, "2026-09-21").click();
  await byDay(page, "2026-09-23").click();
  await byDay(page, "2026-09-24").click();
  state.failDay = "2026-09-24";
  await page
    .getByRole("button", { name: "Save days off", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Not all days off could be saved" })
    .waitFor();
  await expect(byDay(page, "2026-09-24")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByRole("button", { name: "Save days off", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Days off saved" })
    .waitFor();
  assert.deepEqual(
    state.exceptions.filter((entry) => entry.id < 100).map((entry) => entry.id),
    [2, 3],
  );
  assert.equal(
    state.exceptions.filter((entry) => entry.date === "2026-09-23").length,
    1,
    "Retry must not duplicate completed days",
  );
  assert.equal(
    state.bookings.filter((entry) => entry.status === "confirmed").length,
    2,
  );
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();

  const manual = page.locator(".teacher-manual");
  assert.equal(await manual.getAttribute("open"), null);
  assert.equal(
    await manual.evaluate((node) =>
      node.previousElementSibling?.classList.contains("teacher-days-off"),
    ),
    true,
  );
  await manual.locator("summary").click();
  await manual.getByLabel("Student’s email").fill("manual@example.invalid");
  await manual.getByLabel("Student’s name").fill("Robin");
  await manual.getByLabel("Where").selectOption("porto");
  await manual.getByLabel("Date", { exact: true }).fill("2026-09-11");
  await manual
    .getByRole("button", { name: "Add lesson and email student" })
    .click();
  await manual.getByRole("status").waitFor();
  assert.equal(
    state.writes.find((entry) => entry.path === "/admin/bookings").data
      .location,
    "porto",
  );
  await page.getByRole("button", { name: /^Robin,.*View lesson$/ }).click();
  await page
    .getByRole("button", { name: "Cancel lesson", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cancel this lesson?" }),
  ).toBeVisible();
  assert.equal(
    state.bookings.find((entry) => entry.id === "manual").status,
    "confirmed",
  );
  await page.getByRole("button", { name: "Yes, cancel lesson" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    state.bookings.find((entry) => entry.id === "manual").status,
    "cancelled",
  );
  state.failBookings = true;
  await page.getByRole("button", { name: "Next week" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Lessons could not be loaded" })
    .waitFor();
  await expect(
    page.getByText("No lessons booked this week.", { exact: false }),
  ).toHaveCount(0);
  state.failBookings = false;
  await page.getByRole("button", { name: "Reload lessons" }).click();
  await expect(page.locator(".teacher-timetable")).toBeVisible();
  await noOverflow(page);
  assert.deepEqual(state.errors, []);
  await page.close();

  const mobile = await fixture(390);
  await byDay(mobile.page, "2026-09-08").tap();
  await mobile.page
    .getByRole("status")
    .filter({ hasText: "1 booked lesson falls" })
    .waitFor();
  await mobile.page.getByRole("button", { name: "View those lessons" }).click();
  await expect(
    mobile.page.getByRole("button", {
      name: "Tuesday 8 September, show lessons",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    mobile.page.getByRole("button", { name: /^Sam,.*View lesson$/ }),
  ).toBeVisible();
  await showHours(mobile.page);
  await mobile.page
    .getByRole("button", { name: "Saturday, show teaching hours" })
    .tap();
  await slot(mobile.page, 6, 600).tap();
  await expect(slot(mobile.page, 6, 600)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mobile.page
    .getByRole("button", { name: "Save teaching hours", exact: true })
    .click();
  await mobile.page
    .getByRole("status")
    .filter({ hasText: "Teaching hours saved" })
    .waitFor();
  for (const width of [390, 320, 827]) {
    await mobile.page.setViewportSize({ width, height: 900 });
    await noOverflow(mobile.page);
  }
  assert.deepEqual(mobile.state.errors, []);
  await mobile.page.close();

  const student = await fixture(390, { student: true });
  await student.page
    .getByRole("status")
    .filter({ hasText: "this page is Inês’s" })
    .waitFor();
  await expect(student.page.locator(".teacher-workspace")).toHaveCount(0);
  assert.deepEqual(student.state.writes, []);
  await student.page.close();
  console.log(
    "Teacher calendar passed: drag/keyboard/touch, exact hours, retries, partial saves, protected exceptions, drafts, Porto moves, attendance, cancellation, manual fallback, responsive layout and access gate.",
  );
} finally {
  await browser.close();
}

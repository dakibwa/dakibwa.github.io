import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "tmp/qa");
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const routes = [
  { id: "home", path: "/", heading: "Português" },
  { id: "approach", path: "/approach", heading: "No class." },
  { id: "lessons", path: "/lessons", heading: "Lessons, and" },
  { id: "faq", path: "/faq", heading: "Questions" },
  { id: "booking", path: "/book", heading: "Your Portuguese lessons" }
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const logs = [];
const results = [];

page.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});

for (const route of routes) {
  for (const viewport of [
    { id: "desktop", width: 1440, height: 1000 },
    { id: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").waitFor({ timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const heading = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
    assertIncludes(heading, route.heading, `${route.id} heading`);

    const headingCount = await page.locator("h1").count();
    if (headingCount !== 1) {
      throw new Error(`${route.id} should have exactly one h1; found ${headingCount}.`);
    }

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      throw new Error(
        `${route.id} ${viewport.id} has horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px.`
      );
    }

    await page.screenshot({
      path: path.join(outDir, `${route.id}-${viewport.id}.png`),
      fullPage: true
    });

    results.push({
      route: route.id,
      viewport: viewport.id,
      heading,
      overflow
    });
  }
}

// Account navigation should describe the student's lessons, not introduce a
// second calendar alongside the booking workspace. A synthetic local session
// is enough here because AccountLink only needs to know whether one exists.
const signedInPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
signedInPage.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
signedInPage.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});
await signedInPage.addInitScript(() => {
  window.localStorage.setItem("ines-student-session", "qa-session");
});
await signedInPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
const signedInAccountLinks = signedInPage.getByRole("link", { name: "My lessons", exact: true });
await signedInAccountLinks.first().waitFor({ timeout: 10_000 });
if ((await signedInAccountLinks.count()) !== 2) {
  throw new Error("Signed-in header and footer navigation should both say My lessons.");
}
for (const link of await signedInAccountLinks.all()) {
  if ((await link.getAttribute("href")) !== "/book/#lesson-calendar") {
    throw new Error("My lessons should return to the unified booking calendar.");
  }
}
await signedInPage.close();

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
const expectedApproachUrl = new URL(`${base}/approach/`).href;

// On a phone every link is behind the toggle — the header's are, and the
// footer no longer repeats them. Opening the menu is now part of the journey
// rather than a detail of it.
await page.locator(".nav-toggle").click();
await page.waitForTimeout(400);
await page.locator("#site-nav-mobile a", { hasText: "Approach" }).first().click();
await page.waitForURL(expectedApproachUrl, { timeout: 10_000 });
const mobileNavigation = await page.evaluate(() => ({
  overlayCount: document.querySelectorAll(".route-transition-wash").length,
  transform: getComputedStyle(document.querySelector(".route-fade")).transform,
  url: window.location.href
}));

if (mobileNavigation.url !== expectedApproachUrl) {
  throw new Error(
    `Mobile route navigation changed destination: expected ${expectedApproachUrl}, received ${mobileNavigation.url}.`
  );
}

if (mobileNavigation.overlayCount !== 0 || mobileNavigation.transform !== "none") {
  throw new Error("Mobile route navigation should use opacity only, with no overlay or transform.");
}

await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${base}/faq`, { waitUntil: "domcontentloaded" });
const firstFaq = page.locator(".faq-row").first();
if (!(await firstFaq.evaluate((element) => element.hasAttribute("open")))) {
  throw new Error("The first booking question should be open by default.");
}
await firstFaq.locator("summary").click();
if (await firstFaq.evaluate((element) => element.hasAttribute("open"))) {
  throw new Error("The FAQ disclosure did not close.");
}

await page.goto(`${base}/book`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".booking-provider", { timeout: 10_000 });
const bookingCalendar = (await page.locator(".booking-steps").count()) > 0;
const bookingPlaceholder = (await page.locator(".booking-placeholder").count()) > 0;

// The booking UI is served by this site against the ines-booking Worker. With
// no API configured the page must degrade to the placeholder rather than to a
// broken calendar, so both outcomes are legitimate — but nothing else is.
if (!bookingCalendar && !bookingPlaceholder) {
  throw new Error("The booking page rendered neither the calendar nor the setup placeholder.");
}

if (bookingCalendar) {
  try {
    await page.waitForSelector(".lesson-card", { timeout: 10_000 });
  } catch {
    const alert = await page.locator(".booking-alert").innerText().catch(() => "");
    throw new Error(
      `The booking flow rendered no lesson types. This is usually the booking API refusing the origin ${base} ` +
        `via CORS, or being unreachable.${alert ? ` The page said: ${alert.replace(/\s+/g, " ").trim()}` : ""}`
    );
  }

  const bookingText = (await page.locator(".booking-composition").innerText()).toLowerCase();
  assertIncludes(bookingText, "what would you like to book?", "lesson choice heading");
  assertIncludes(bookingText, "porto time", "booking timezone note");
  if (bookingText.includes("booked lessons and free times share the same calendar")) {
    throw new Error("The unified calendar still repeats its own purpose above the booking controls.");
  }
  if ((await page.locator(".unified-booking__head .booking-step-heading").count()) !== 0) {
    throw new Error("The unified calendar still has a redundant visible heading.");
  }
  if ((await page.locator("#lesson-calendar").count()) !== 1) {
    throw new Error("Booking and lesson management should share one calendar.");
  }

  // The mobile menu replaces the inline nav below 820px; both must work.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const toggle = page.locator(".nav-toggle");
  if (!(await toggle.isVisible())) throw new Error("The mobile menu toggle is missing below 820px.");
  if (await page.locator(".site-nav").isVisible()) throw new Error("The inline nav is still shown below 820px.");
  await toggle.click();
  await page.waitForTimeout(400);
  if ((await toggle.getAttribute("aria-expanded")) !== "true") throw new Error("The mobile menu did not open.");
  if ((await page.locator("#site-nav-mobile a").count()) < 5) throw new Error("The mobile menu is missing links.");
  await page.setViewportSize({ width: 1440, height: 1000 });
}

// The signed-in account controls live directly on the booking page rather than
// behind another disclosure. Mock only private account calls so this can cover
// the real UI without using a student's session or changing a real repeating series.
let repeatStopped = false;
let stopRepeatCalls = 0;
const accountRequestMethods = [];
const qaStart = new Date(Date.now() + 7 * 86_400_000);
qaStart.setUTCHours(17, 0, 0, 0);
const qaEnd = new Date(qaStart.getTime() + 60 * 60_000);
const qaSecondStart = new Date(qaStart.getTime() + 2 * 60 * 60_000);
const qaSecondEnd = new Date(qaSecondStart.getTime() + 60 * 60_000);
const qaFreeStart = new Date(qaStart.getTime() + 24 * 60 * 60_000);
const qaFreeEnd = new Date(qaFreeStart.getTime() + 60 * 60_000);
const qaFreeDate = qaFreeStart.toISOString().slice(0, 10);
const qaPastStart = new Date(Date.now() - 7 * 24 * 60 * 60_000);
qaPastStart.setUTCHours(15, 0, 0, 0);
const qaPastEnd = new Date(qaPastStart.getTime() + 60 * 60_000);
const accountPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
accountPage.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
accountPage.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});
await accountPage.addInitScript(() => {
  window.localStorage.setItem("ines-student-session", "qa-session");
});
await accountPage.route("**/lesson-types", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      lessonTypes: [
        {
          id: "single-60",
          slug: "single-lesson",
          name: "Single lesson",
          description: "One hour of Portuguese practice.",
          duration_minutes: 60,
          price_cents: 2500
        },
        {
          id: "longer-90",
          slug: "longer-lesson",
          name: "Longer lesson",
          description: "Ninety minutes when you want more time.",
          duration_minutes: 90,
          price_cents: 3500
        }
      ],
      prepay: false
    })
  });
});
await accountPage.route("**/availability?*", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      slotsByDate: {
        [qaFreeDate]: [{ startAt: qaFreeStart.toISOString(), endAt: qaFreeEnd.toISOString() }]
      },
      timeZone: "Europe/Lisbon",
      minimumNoticeHours: 24,
      horizonDays: 56,
      lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
    })
  });
});
await accountPage.route("**/me", async (route) => {
  accountRequestMethods.push(route.request().method());
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      }
    });
    return;
  }
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      student: {
        id: "student-qa",
        email: "student@example.com",
        name: "Ana Martins",
        phone: "",
        timezone: "Europe/Lisbon",
        role: "student"
      },
      bookings: [
        {
          reference: "INES-QA01",
          status: "confirmed",
          startAt: qaStart.toISOString(),
          endAt: qaEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: "series-qa",
          manageToken: "manage-qa"
        },
        {
          reference: "INES-QA02",
          status: "confirmed",
          startAt: qaSecondStart.toISOString(),
          endAt: qaSecondEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-qa-2"
        },
        {
          reference: "INES-OLD1",
          status: "cancelled",
          startAt: qaPastStart.toISOString(),
          endAt: qaPastEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: true,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-old"
        }
      ],
      series: repeatStopped
        ? []
        : [
            {
              id: "series-qa",
              weekday: 1,
              minuteOfDay: 1080,
              occurrences: null,
              openEnded: true,
              upcoming: 4
            }
          ],
      sameDayFeeCents: 500
    })
  });
});
await accountPage.route("**/series/series-qa/stop", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      }
    });
    return;
  }
  stopRepeatCalls += 1;
  repeatStopped = true;
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, stopped: true, cancelled: 0 })
  });
});

await accountPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
const accountPanel = accountPage.locator("#account-controls");
try {
  await accountPanel.waitFor({ state: "visible", timeout: 10_000 });
} catch {
  const pageText = (await accountPage.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 600);
  throw new Error(
    `The synthetic signed-in account did not load. /me methods: ${accountRequestMethods.join(", ") || "none"}. ` +
      `Page text: ${pageText}`
  );
}
for (const oldToggleName of ["Account", "Close", "Close account"]) {
  if (await accountPage.getByRole("button", { name: oldToggleName, exact: true }).count()) {
    throw new Error(`The obsolete ${oldToggleName} account disclosure is still present.`);
  }
}
await accountPage.getByRole("button", { name: "Sign out", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Stop repeating", exact: true }).waitFor();
if (await accountPanel.getByText("History", { exact: true }).count()) {
  throw new Error("History should not be rendered inside the account controls at the top of the page.");
}
const bookingHistory = accountPage.locator(".booking-history");
await bookingHistory.waitFor({ state: "visible" });
if (await bookingHistory.evaluate((node) => node.open)) {
  throw new Error("Past lessons should be collapsed by default.");
}
const historyFollowsCalendar = await accountPage.evaluate(() => {
  const calendar = document.querySelector("#lesson-calendar");
  const history = document.querySelector(".booking-history");
  return Boolean(calendar && history && calendar.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING);
});
if (!historyFollowsCalendar) throw new Error("History should sit after the booking calendar, not above it.");

const desktopAccountLayout = await accountPage.evaluate(() => {
  const bounds = (selector) => {
    const rectangle = document.querySelector(selector)?.getBoundingClientRect();
    return rectangle
      ? {
          top: rectangle.top,
          bottom: rectangle.bottom,
          left: rectangle.left,
          right: rectangle.right,
          width: rectangle.width
        }
      : null;
  };
  return {
    head: bounds(".unified-booking__head"),
    panel: bounds("#account-controls"),
    lessonPicker: bounds(".unified-booking__lesson-picker")
  };
});
if (
  !desktopAccountLayout.head ||
  !desktopAccountLayout.panel ||
  !desktopAccountLayout.lessonPicker ||
  desktopAccountLayout.panel.top < desktopAccountLayout.head.bottom - 1 ||
  desktopAccountLayout.panel.bottom > desktopAccountLayout.lessonPicker.top + 1 ||
  Math.abs(desktopAccountLayout.panel.right - desktopAccountLayout.lessonPicker.right) > 2 ||
  Math.abs(desktopAccountLayout.head.right - desktopAccountLayout.panel.right) > 2
) {
  throw new Error("The account panel should be compact, right-aligned and directly above the booking choices.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-desktop.png"), fullPage: true });

await accountPage.setViewportSize({ width: 390, height: 844 });
await accountPage.waitForTimeout(300);
const mobileAccountLayout = await accountPage.evaluate(() => {
  const repeatCopy = document.querySelector(".my-lessons__series-row > p")?.getBoundingClientRect();
  const repeatAction = document.querySelector(".my-lessons__series-row > button")?.getBoundingClientRect();
  return {
    repeatCopyBottom: repeatCopy?.bottom ?? 0,
    repeatActionTop: repeatAction?.top ?? 0,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
});
if (mobileAccountLayout.repeatActionTop < mobileAccountLayout.repeatCopyBottom - 1) {
  throw new Error("The mobile stop-repeating control still crowds the repeat description.");
}
if (mobileAccountLayout.scrollWidth > mobileAccountLayout.clientWidth + 1) {
  throw new Error("The open mobile account controls cause horizontal overflow.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-mobile.png"), fullPage: true });

const fullCalendarWeekCount = await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count();
if (fullCalendarWeekCount <= 1) throw new Error("The calendar overview should show more than one week.");
const bookingCount = accountPage.locator("#lesson-calendar .calendar-booking-count", { hasText: "2×" });
await bookingCount.waitFor({ state: "visible" });
const bookedDay = accountPage.getByRole("button", { name: /2 lessons/ }).first();
await bookedDay.click();
const showAllDates = accountPage.getByRole("button", { name: "Show all dates", exact: true });
await showAllDates.waitFor({ state: "visible" });
const compactCalendarWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (compactCalendarWeekCount !== 1) {
  throw new Error(`Selecting a day should shrink the calendar to one week; found ${compactCalendarWeekCount}.`);
}
const selectedLessonCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__bookings .lesson-calendar__lesson")
  .count();
if (selectedLessonCount !== 2) {
  throw new Error(`The selected day should show both lessons below the compact calendar; found ${selectedLessonCount}.`);
}
const compactCalendarLayout = await accountPage.evaluate(() => {
  const grid = document.querySelector("#lesson-calendar .unified-calendar__grid")?.getBoundingClientRect();
  const details = document.querySelector("#lesson-calendar .unified-calendar__panel")?.getBoundingClientRect();
  return { gridBottom: grid?.bottom ?? 0, detailsTop: details?.top ?? 0 };
});
if (compactCalendarLayout.detailsTop - compactCalendarLayout.gridBottom > 24) {
  throw new Error("The selected lesson details are not directly below the compact mobile calendar.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-selected-mobile.png"), fullPage: true });
await showAllDates.click();
if ((await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count()) !== fullCalendarWeekCount) {
  throw new Error("Show all dates did not restore the complete calendar overview.");
}

const lessonCardCount = await accountPage.locator(".unified-booking__lesson-picker .lesson-card").count();
if (lessonCardCount !== 2) throw new Error(`Expected two full lesson choices; found ${lessonCardCount}.`);
await accountPage.getByRole("button", { name: "Single lesson 60 minutes · €25", exact: true }).click();
const lessonSummary = accountPage.locator(".booking-choice-summary");
await lessonSummary.waitFor({ state: "visible" });
if (await accountPage.locator(".unified-booking__lesson-picker .lesson-card").count()) {
  throw new Error("Choosing a lesson type should collapse the large lesson cards.");
}
const changeLesson = accountPage.getByRole("button", { name: "Change lesson", exact: true });
await changeLesson.click();
await accountPage.getByRole("button", { name: "Single lesson 60 minutes · €25", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Single lesson 60 minutes · €25", exact: true }).click();
await lessonSummary.waitFor({ state: "visible" });
const freeDay = accountPage.getByRole("button", { name: /1 times free/ }).first();
await freeDay.waitFor({ state: "visible" });
await freeDay.click();
await showAllDates.waitFor({ state: "visible" });
await accountPage.waitForTimeout(450);
const freeCompactWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (freeCompactWeekCount !== 1) {
  throw new Error(`Selecting a free day should shrink the calendar to one week; found ${freeCompactWeekCount}.`);
}
const availableTimeCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__availability .slot-grid button")
  .count();
if (availableTimeCount !== 1) {
  throw new Error(`The free-day details should appear below the compact calendar; found ${availableTimeCount} times.`);
}
const nextStepOrientation = await accountPage.evaluate(() => {
  const panel = document.querySelector("#booking-next-step")?.getBoundingClientRect();
  return { top: panel?.top ?? Infinity, bottom: panel?.bottom ?? -Infinity, viewportHeight: window.innerHeight };
});
if (nextStepOrientation.top >= nextStepOrientation.viewportHeight || nextStepOrientation.bottom <= 0) {
  throw new Error("Choosing a day did not bring the available times into the mobile viewport.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-free-day-mobile.png"), fullPage: true });

await accountPage
  .locator("#lesson-calendar .unified-calendar__availability .slot-grid button")
  .first()
  .click();
const confirmHeading = accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true });
await confirmHeading.waitFor({ state: "visible" });
await accountPage.waitForTimeout(450);
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("Choosing a time should collapse the calendar before the confirmation step.");
}
if (await accountPage.locator(".unified-booking__lesson-picker").count()) {
  throw new Error("Choosing a time should collapse the earlier lesson choice before confirmation.");
}
const confirmOrientation = await confirmHeading.evaluate((heading) => {
  const rectangle = heading.getBoundingClientRect();
  return { top: rectangle.top, bottom: rectangle.bottom, viewportHeight: window.innerHeight };
});
if (confirmOrientation.top >= confirmOrientation.viewportHeight || confirmOrientation.bottom <= 0) {
  throw new Error("Choosing a time did not bring the confirmation step into the mobile viewport.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-confirm-mobile.png"), fullPage: true });

await accountPage.getByRole("button", { name: "Change time", exact: true }).click();
await showAllDates.waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count()) !== 1) {
  throw new Error("Changing the time should restore the selected week, not the full calendar.");
}
await lessonSummary.waitFor({ state: "visible" });
await showAllDates.click();

const stopRepeating = accountPage.getByRole("button", { name: "Stop repeating", exact: true });
await stopRepeating.click();
await accountPage.getByRole("heading", { name: "Stop repeating lessons?", exact: true }).waitFor();
if (stopRepeatCalls !== 0) throw new Error("Opening the repeat confirmation called the stop endpoint.");
await accountPage.screenshot({
  path: path.join(outDir, "booking-account-repeat-confirm-mobile.png"),
  fullPage: true
});
await accountPage.getByRole("button", { name: "No, keep repeating", exact: true }).click();
if (stopRepeatCalls !== 0) throw new Error("Keeping the repeat called the stop endpoint.");
await stopRepeating.click();
await accountPage.getByRole("button", { name: "Yes, stop repeating", exact: true }).click();
await stopRepeating.waitFor({ state: "hidden" });
if (stopRepeatCalls !== 1) throw new Error(`Expected one confirmed stop call; received ${stopRepeatCalls}.`);

await accountPage.getByRole("button", { name: "Sign out", exact: true }).click();
await accountPage.getByRole("button", { name: "Sign in to see your lessons", exact: true }).waitFor();
await accountPanel.waitFor({ state: "detached" });
await accountPage.close();

// Old emailed links remain valid, but now land in the same booking workspace.
await page.goto(`${base}/booking`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#lesson-calendar", { timeout: 10_000 });
await page.waitForURL((url) => url.pathname === "/book/", { timeout: 10_000 });
if (new URL(page.url()).pathname !== "/book/") {
  throw new Error(`The legacy management route did not normalise to /book/: ${page.url()}`);
}

await browser.close();

const fatalLogs = logs.filter((entry) => !entry.includes("Failed to load resource"));

if (fatalLogs.length) {
  throw new Error(`Browser errors were recorded:\n${fatalLogs.join("\n")}`);
}

console.log(
  JSON.stringify(
    {
      base,
      results,
      bookingCalendar,
      bookingPlaceholder,
      signedInAccountLinks: 2,
      accountControls: {
        desktopLayout: desktopAccountLayout,
        mobileLayout: mobileAccountLayout,
        calendarCompact: {
          fullWeekCount: fullCalendarWeekCount,
          compactWeekCount: compactCalendarWeekCount,
          selectedLessonCount,
          freeCompactWeekCount,
          availableTimeCount,
          layout: compactCalendarLayout
        },
        stopRepeatCalls,
        accountRequestMethods,
        signedOut: true
      },
      mobileNavigation,
      externalResourceWarnings: logs.filter((entry) => entry.includes("Failed to load resource")),
      screenshots: outDir
    },
    null,
    2
  )
);

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`Missing ${label}: ${expected}`);
  }
}

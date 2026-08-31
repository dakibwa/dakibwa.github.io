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

// Some browsers expose the view-transition CSS property without exposing the
// JavaScript API. Force that exact capability gap and make sure the booking
// flow uses its local content fade rather than snapping between states. Run
// this before the route matrix so its client bundle is tested from a clean
// browser cache rather than behind ten screenshot navigations.
const fallbackMotionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await fallbackMotionPage.addInitScript(() => {
  Object.defineProperty(Document.prototype, "startViewTransition", {
    configurable: true,
    value: undefined
  });
});
await fallbackMotionPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
await fallbackMotionPage
  .getByRole("button", { name: "Book a new lesson", exact: true })
  .waitFor({ state: "visible", timeout: 10_000 });
await fallbackMotionPage.getByRole("button", { name: "Book a new lesson", exact: true }).click();
const fallbackSingleLesson = fallbackMotionPage.getByRole("button", {
  name: "Single lesson 60 minutes · €25",
  exact: true
});
await fallbackSingleLesson.waitFor({ state: "visible", timeout: 10_000 });
await fallbackMotionPage.evaluate(() => {
  document.documentElement.dataset.qaFallbackTransitionSeen = "false";
  const observer = new MutationObserver(() => {
    if (!document.documentElement.classList.contains("booking-fallback-transitioning")) return;
    requestAnimationFrame(() => {
      const summary = document.querySelector(".booking-choice-summary");
      const style = summary ? getComputedStyle(summary) : null;
      document.documentElement.dataset.qaFallbackTransitionSeen = "true";
      document.documentElement.dataset.qaFallbackAnimationName = style?.animationName ?? "";
      document.documentElement.dataset.qaFallbackAnimationDuration = style?.animationDuration ?? "";
      observer.disconnect();
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});
await fallbackSingleLesson.click();
await fallbackMotionPage.locator(".booking-choice-summary").waitFor({ state: "visible" });
const fallbackBookingMotion = await fallbackMotionPage.evaluate(() => ({
  animationDuration: document.documentElement.dataset.qaFallbackAnimationDuration,
  animationName: document.documentElement.dataset.qaFallbackAnimationName,
  seen: document.documentElement.dataset.qaFallbackTransitionSeen === "true"
}));
if (
  !fallbackBookingMotion.seen ||
  !fallbackBookingMotion.animationName?.includes("booking-flow-in") ||
  fallbackBookingMotion.animationDuration === "0s"
) {
  throw new Error("Browsers without the view-transition API should receive the local booking fade.");
}
await fallbackMotionPage.close();

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

// Booking is the one destination whether the visitor is signed in or not. The
// account itself belongs inside that workspace, not as a second navigation
// destination that changes label after hydration.
const signedInBrowser = await chromium.launch({ headless: true });
const signedInPage = await signedInBrowser.newPage({ viewport: { width: 1440, height: 1000 } });
signedInPage.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
signedInPage.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});
await signedInPage.addInitScript(() => {
  window.localStorage.setItem("ines-student-session", "qa-session");
});
await signedInPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
const signedInBookingLinks = signedInPage.getByRole("link", { name: "Booking", exact: true });
await signedInBookingLinks.first().waitFor({ timeout: 10_000 });
if ((await signedInBookingLinks.count()) !== 2) {
  throw new Error("Signed-in header and footer navigation should both keep the single Booking destination.");
}
if (await signedInPage.getByRole("link", { name: "My lessons", exact: true }).count()) {
  throw new Error("My lessons should not appear as a second navigation destination.");
}
await signedInPage.close();
await signedInBrowser.close();

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
  animationDuration: getComputedStyle(document.querySelector(".route-fade")).animationDuration,
  animationName: getComputedStyle(document.querySelector(".route-fade")).animationName,
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

if (
  !mobileNavigation.animationName.includes("route-fade-in") ||
  mobileNavigation.animationDuration === "0s"
) {
  throw new Error("Mobile route navigation should dissolve the destination without delaying the click.");
}

const reducedMotionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await reducedMotionPage.emulateMedia({ reducedMotion: "reduce" });
await reducedMotionPage.goto(`${base}/faq/`, { waitUntil: "domcontentloaded" });
await reducedMotionPage.locator("h1").waitFor({ timeout: 10_000 });
const reducedRouteMotion = await reducedMotionPage.evaluate(() => {
  const style = getComputedStyle(document.querySelector(".route-fade"));
  return { animationDuration: style.animationDuration, animationName: style.animationName };
});
if (reducedRouteMotion.animationName !== "none" && reducedRouteMotion.animationDuration !== "0s") {
  throw new Error("Reduced-motion users should not receive a route transition.");
}
await reducedMotionPage.close();

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
  await page.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor({ timeout: 10_000 });
  if ((await page.locator("#lesson-calendar").count()) !== 0) {
    throw new Error("The booking calendar should wait for the student's first decision.");
  }
  await page.getByRole("button", { name: "Book a new lesson", exact: true }).click();
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
  assertIncludes(bookingText, "choose a lesson", "lesson choice heading");
  assertIncludes(bookingText, "porto time", "booking timezone note");
  if (bookingText.includes("booked lessons and free times share the same calendar")) {
    throw new Error("The unified calendar still repeats its own purpose above the booking controls.");
  }
  if ((await page.locator(".unified-booking__head .booking-step-heading").count()) !== 0) {
    throw new Error("The unified calendar still has a redundant visible heading.");
  }
  if ((await page.locator("#lesson-calendar").count()) !== 0) {
    throw new Error("The calendar should wait until the lesson type has been chosen.");
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
  if ((await page.locator("#site-nav-mobile a").count()) !== 4) {
    throw new Error("The mobile menu should contain the four primary destinations once each.");
  }
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
const qaLaterStart = new Date(Date.now() + 84 * 24 * 60 * 60_000);
qaLaterStart.setUTCHours(17, 0, 0, 0);
const qaLaterEnd = new Date(qaLaterStart.getTime() + 60 * 60_000);
const qaLaterDate = qaLaterStart.toISOString().slice(0, 10);
const accountBrowser = await chromium.launch({ headless: true });
const accountPage = await accountBrowser.newPage({ viewport: { width: 1440, height: 1000 } });
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
          id: "trial",
          slug: "trial-lesson",
          name: "Trial lesson",
          description: "A first lesson with Inês.",
          duration_minutes: 60,
          price_cents: 2000
        },
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
        },
        {
          reference: "INES-LATER",
          status: "confirmed",
          startAt: qaLaterStart.toISOString(),
          endAt: qaLaterEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-later"
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
await accountPage.route("**/bookings/manage-qa", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-QA01",
        status: "confirmed",
        startAt: qaStart.toISOString(),
        endAt: qaEnd.toISOString(),
        location: "online",
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
      },
      isPast: false,
      sameDayFeeApplies: false,
      changeLocked: false,
      refundOnCancel: false
    })
  });
});
await accountPage.route("**/bookings/manage-later", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-LATER",
        status: "confirmed",
        startAt: qaLaterStart.toISOString(),
        endAt: qaLaterEnd.toISOString(),
        location: "online",
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
      },
      isPast: false,
      sameDayFeeApplies: false,
      changeLocked: false,
      refundOnCancel: false
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
if ((await accountPanel.getByText("Ana Martins", { exact: true }).count()) !== 1) {
  throw new Error("The signed-in identity should appear once, inside the account bar.");
}
for (const duplicateIdentity of ["Signed in as", "Booking as", "Not you?"]) {
  if (await accountPage.getByText(duplicateIdentity, { exact: false }).count()) {
    throw new Error(`The booking flow still repeats the account identity as “${duplicateIdentity}”.`);
  }
}
if (await accountPage.locator(".booking-history").count()) {
  throw new Error("The old detached history disclosure is still rendered below the calendar.");
}
await accountPage.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor();
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("The calendar should not compete with the first book-or-view decision.");
}
if (await accountPage.locator(".unified-booking__lesson-picker").count()) {
  throw new Error("Lesson types should wait until the student chooses to book.");
}
for (const hiddenUntilViewing of [/Upcoming lessons/, /Past lessons/, /Stop repeating/]) {
  if (await accountPanel.getByRole("button", { name: hiddenUntilViewing }).count()) {
    throw new Error(`${hiddenUntilViewing} should not compete with the first workflow choice.`);
  }
}
const initialWorkflowLayout = await accountPage.evaluate(() => {
  const account = document.querySelector("#account-controls")?.getBoundingClientRect();
  const start = document.querySelector("#booking-journey-start")?.getBoundingClientRect();
  const accountName = document.querySelector(".my-lessons__account-name")?.getBoundingClientRect();
  return {
    accountLeft: account?.left ?? 0,
    accountRight: account?.right ?? 0,
    startLeft: start?.left ?? 0,
    startRight: start?.right ?? 0,
    accountTop: account?.top ?? 0,
    nameTop: accountName?.top ?? 0
  };
});
if (
  Math.abs(initialWorkflowLayout.accountLeft - initialWorkflowLayout.startLeft) > 2 ||
  Math.abs(initialWorkflowLayout.accountRight - initialWorkflowLayout.startRight) > 2 ||
  initialWorkflowLayout.nameTop - initialWorkflowLayout.accountTop < 16
) {
  throw new Error(`The first workflow and account bar are not cleanly aligned and padded: ${JSON.stringify(initialWorkflowLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-workflow-start-desktop.png"), fullPage: true });

await accountPanel.getByRole("button", { name: "Edit details", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const desktopDetailRows = await accountPanel.locator(".my-lessons__details-row").evaluateAll((rows) =>
  rows.map((row) => {
    const field = row.querySelector("label")?.getBoundingClientRect();
    const action = row.querySelector("button")?.getBoundingClientRect();
    return { fieldRight: field?.right ?? Infinity, actionLeft: action?.left ?? 0 };
  })
);
if (desktopDetailRows.length !== 2 || desktopDetailRows.some((row) => row.actionLeft < row.fieldRight - 1)) {
  throw new Error(`Account field actions should sit beside their fields when they fit: ${JSON.stringify(desktopDetailRows)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-edit-desktop.png"), fullPage: true });
await accountPanel.getByRole("button", { name: "Done", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "detached" });

await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 1) {
  throw new Error("Viewing existing lessons should open the next booked week, not the full calendar.");
}
await accountPage.getByRole("button", { name: "Stop repeating", exact: true }).waitFor();
const pastLessonsToggle = accountPanel.getByRole("button", { name: /Past lessons/ });
await pastLessonsToggle.click();
await accountPanel.getByRole("heading", { name: "Past lessons", exact: true }).waitFor();
if (!(await accountPanel.getByText("INES-OLD1", { exact: true }).isVisible())) {
  throw new Error("Past lessons should open inside the account bar.");
}
await pastLessonsToggle.click();

const upcomingLessonsToggle = accountPanel.getByRole("button", { name: /Upcoming lessons/ });
await upcomingLessonsToggle.click();
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
const upcomingLessonButtons = accountPanel.locator("#account-upcoming-lessons .lesson-calendar__lesson");
if ((await upcomingLessonButtons.count()) !== 3) {
  throw new Error("Upcoming lessons should show every future booking in one place.");
}
const laterLessonButton = upcomingLessonButtons.last();
await laterLessonButton.waitFor({ state: "visible" });
if (!(await accountPanel.getByText(/including dates after this eight-week calendar/i).isVisible())) {
  throw new Error("Upcoming lessons should explain that it also includes dates beyond the calendar.");
}
await laterLessonButton.click();
const laterManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
try {
  await laterManagePanel.getByRole("heading", { name: "Single lesson", exact: true }).waitFor({ timeout: 10_000 });
} catch {
  const panelText = (await laterManagePanel.innerText().catch(() => "missing panel")).replace(/\s+/g, " ").trim();
  throw new Error(`A later lesson did not open in the shared management panel. Panel: ${panelText}`);
}
await laterManagePanel.getByText("Booked lesson", { exact: true }).waitFor();
await laterManagePanel.getByRole("button", { name: "Back to calendar", exact: true }).click();
await accountPage.locator(".booking-workflow-context").waitFor({ state: "visible" });
if ((await upcomingLessonsToggle.getAttribute("aria-expanded")) === "true") {
  await upcomingLessonsToggle.click();
  await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "detached" });
}
await waitForOrientation(accountPage);
if (await accountPage.locator(`#lesson-calendar [data-date-key="${qaLaterDate}"]`).count()) {
  throw new Error("A later recurring lesson stretched the visible calendar beyond eight weeks.");
}

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
    composition: bounds(".booking-composition"),
    intro: bounds(".booking-intro"),
    provider: bounds(".booking-provider"),
    panel: bounds("#account-controls"),
    workflowContext: bounds(".booking-workflow-context")
  };
});
if (
  !desktopAccountLayout.composition ||
  !desktopAccountLayout.intro ||
  !desktopAccountLayout.provider ||
  !desktopAccountLayout.panel ||
  !desktopAccountLayout.workflowContext ||
  desktopAccountLayout.panel.bottom > desktopAccountLayout.workflowContext.top + 1 ||
  Math.abs(desktopAccountLayout.panel.left - desktopAccountLayout.workflowContext.left) > 2 ||
  Math.abs(desktopAccountLayout.panel.right - desktopAccountLayout.workflowContext.right) > 2
) {
  throw new Error(
    `The account controls and active workflow should share one aligned workspace: ${JSON.stringify(desktopAccountLayout)}.`
  );
}
if (
  desktopAccountLayout.intro.width / desktopAccountLayout.composition.width > 0.34 ||
  desktopAccountLayout.provider.width <= desktopAccountLayout.intro.width
) {
  throw new Error("The desktop introduction still takes too much space from the booking task.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-desktop.png"), fullPage: true });

const desktopBookingTimes = accountPage.locator("#lesson-calendar .calendar-booking-times span");
if ((await desktopBookingTimes.count()) !== 2) {
  throw new Error("A day with two lessons should show both booked times, not a cramped count badge.");
}
const desktopBookedDay = accountPage.getByRole("button", { name: /2 lessons/ }).first();
await desktopBookedDay.scrollIntoViewIfNeeded();
const desktopScrollBeforeSelection = await accountPage.evaluate(() => window.scrollY);
await desktopBookedDay.click();
await waitForOrientation(accountPage);
const desktopScrollAfterSelection = await accountPage.evaluate(() => window.scrollY);
if (Math.abs(desktopScrollAfterSelection - desktopScrollBeforeSelection) > 8) {
  throw new Error("Selecting a visible desktop day should not unnecessarily move the page.");
}
const desktopCalendarStack = await accountPage.evaluate(() => {
  const calendar = document.querySelector("#lesson-calendar .unified-calendar__grid")?.getBoundingClientRect();
  const panel = document.querySelector("#lesson-calendar .unified-calendar__panel")?.getBoundingClientRect();
  return {
    panelTop: panel?.top ?? Infinity,
    calendarTop: calendar?.top ?? Infinity
  };
});
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-selected-desktop.png"), fullPage: true });
if (Math.abs(desktopCalendarStack.panelTop - desktopCalendarStack.calendarTop) > 2) {
  throw new Error(
    `The compact calendar and selected-day panel should remain one aligned workspace: ${JSON.stringify(desktopCalendarStack)}.`
  );
}
if ((await accountPage.locator("#lesson-calendar .lesson-calendar__status", { hasText: "Booked" }).count()) !== 2) {
  throw new Error("Each existing lesson should be explicitly labelled Booked in the selected-day panel.");
}
await accountPage
  .locator("#lesson-calendar .unified-calendar__bookings .lesson-calendar__lesson")
  .first()
  .click();
const desktopManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
await desktopManagePanel.getByRole("heading", { name: "Single lesson", exact: true }).waitFor();
await desktopManagePanel.getByText("Booked lesson", { exact: true }).waitFor();
if (await desktopManagePanel.getByText("Your lesson", { exact: true }).count()) {
  throw new Error("The selected-lesson header still stacks the redundant “Your lesson” label.");
}
await waitForOrientation(accountPage);
const desktopManageControls = await desktopManagePanel.evaluate((panel) => {
  const bounds = [...panel.querySelectorAll(".manage-booking__actions .button")].map((button) => {
    const rectangle = button.getBoundingClientRect();
    return { left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height };
  });
  const back = panel.querySelector(".booking-back--tertiary")?.getBoundingClientRect();
  const rectangle = panel.getBoundingClientRect();
  return { bounds, backHeight: back?.height ?? Infinity, panelRight: rectangle.right, panelWidth: rectangle.width };
});
if (
  desktopManageControls.bounds.length !== 2 ||
  Math.abs(desktopManageControls.bounds[0].height - desktopManageControls.bounds[1].height) > 2 ||
  desktopManageControls.bounds.some((button) => button.width >= desktopManageControls.panelWidth * 0.75) ||
  desktopManageControls.panelRight - desktopManageControls.bounds.at(-1).right > 40 ||
  desktopManageControls.backHeight > 44
) {
  throw new Error(
    `Lesson management should use one compact, aligned control system: ${JSON.stringify(desktopManageControls)}.`
  );
}
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-desktop.png"), fullPage: true });
await desktopManagePanel.getByRole("button", { name: "Back to calendar", exact: true }).click();
await accountPage.getByRole("button", { name: "Show all dates", exact: true }).click();
await waitForOrientation(accountPage);

await accountPage.setViewportSize({ width: 390, height: 844 });
await accountPage.waitForTimeout(300);
const mobileAccountLayout = await accountPage.evaluate(() => {
  const repeatCopy = document.querySelector(".my-lessons__series-row > p")?.getBoundingClientRect();
  const repeatAction = document.querySelector(".my-lessons__series-row > button")?.getBoundingClientRect();
  const repeatRow = document.querySelector(".my-lessons__series-row")?.getBoundingClientRect();
  const calendar = document.querySelector("#lesson-calendar .unified-calendar__grid");
  const calendarBounds = calendar?.getBoundingClientRect();
  const firstWeekday = calendar?.querySelector(".calendar-weekdays span:first-child")?.getBoundingClientRect();
  const lastWeekday = calendar?.querySelector(".calendar-weekdays span:last-child")?.getBoundingClientRect();
  const legend = calendar?.querySelector(".unified-calendar__legend")?.getBoundingClientRect();
  return {
    repeatCopyRight: repeatCopy?.right ?? 0,
    repeatActionLeft: repeatAction?.left ?? Infinity,
    repeatActionRight: repeatAction?.right ?? 0,
    repeatRowRight: repeatRow?.right ?? 0,
    calendarLeft: calendarBounds?.left ?? 0,
    calendarRight: calendarBounds?.right ?? 0,
    firstWeekdayLeft: firstWeekday?.left ?? -Infinity,
    lastWeekdayRight: lastWeekday?.right ?? Infinity,
    legendLeft: legend?.left ?? -Infinity,
    legendRight: legend?.right ?? Infinity,
    calendarScrollLeft: calendar?.scrollLeft ?? Infinity,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
});
if (
  mobileAccountLayout.repeatActionLeft < mobileAccountLayout.repeatCopyRight - 1 ||
  mobileAccountLayout.repeatRowRight - mobileAccountLayout.repeatActionRight > 3
) {
  throw new Error("The mobile stop-repeating control should sit cleanly at the right of the repeat description.");
}
if (mobileAccountLayout.scrollWidth > mobileAccountLayout.clientWidth + 1) {
  throw new Error("The open mobile account controls cause horizontal overflow.");
}
if (
  mobileAccountLayout.firstWeekdayLeft < mobileAccountLayout.calendarLeft - 1 ||
  mobileAccountLayout.lastWeekdayRight > mobileAccountLayout.calendarRight + 1 ||
  mobileAccountLayout.legendLeft < mobileAccountLayout.calendarLeft - 1 ||
  mobileAccountLayout.legendRight > mobileAccountLayout.calendarRight + 1 ||
  mobileAccountLayout.calendarScrollLeft > 1
) {
  throw new Error(`The mobile calendar clips its first or last day: ${JSON.stringify(mobileAccountLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-mobile.png"), fullPage: true });

await accountPage.evaluate(() => {
  document.documentElement.dataset.qaBookingTransitionSeen = "false";
  const observer = new MutationObserver(() => {
    if (document.documentElement.classList.contains("booking-transitioning")) {
      document.documentElement.dataset.qaBookingTransitionSeen = "true";
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});

const fullCalendarWeekCount = await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count();
if (fullCalendarWeekCount !== 8) {
  throw new Error(`The eight-week booking window rendered ${fullCalendarWeekCount} calendar rows.`);
}
await accountPage.getByText("Next 8 weeks", { exact: true }).waitFor({ state: "visible" });
const bookingTimes = accountPage.locator("#lesson-calendar .calendar-booking-times span");
if ((await bookingTimes.count()) !== 2) {
  throw new Error("The mobile booked day should show both lesson times.");
}
const bookedDay = accountPage.getByRole("button", { name: /2 lessons/ }).first();
await bookedDay.click();
const showAllDates = accountPage.getByRole("button", { name: "Show all dates", exact: true });
await showAllDates.waitFor({ state: "visible" });
const bookingTransitionSeen = await accountPage.evaluate(
  () => document.documentElement.dataset.qaBookingTransitionSeen === "true"
);
if ((await accountPage.evaluate(() => typeof document.startViewTransition === "function")) && !bookingTransitionSeen) {
  throw new Error("A supported browser should animate booking decisions as one calendar workspace.");
}
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
if ((await accountPage.locator("#lesson-calendar .lesson-calendar__status", { hasText: "Booked" }).count()) !== 2) {
  throw new Error("Booked lessons need an explicit status label on mobile too.");
}
await accountPage
  .locator("#lesson-calendar .unified-calendar__bookings .lesson-calendar__lesson")
  .first()
  .click();
const mobileManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
await mobileManagePanel.getByRole("heading", { name: "Single lesson", exact: true }).waitFor();
await mobileManagePanel.getByText("Booked lesson", { exact: true }).waitFor();
await waitForOrientation(accountPage);
const mobileManageControls = await mobileManagePanel.evaluate((panel) => {
  const bounds = [...panel.querySelectorAll(".manage-booking__actions .button")].map((button) => {
    const rectangle = button.getBoundingClientRect();
    return { right: rectangle.right, width: rectangle.width, height: rectangle.height };
  });
  const rectangle = panel.getBoundingClientRect();
  return { bounds, panelRight: rectangle.right, panelWidth: rectangle.width };
});
if (
  mobileManageControls.bounds.length !== 2 ||
  Math.abs(mobileManageControls.bounds[0].height - mobileManageControls.bounds[1].height) > 2 ||
  mobileManageControls.bounds.some((button) => button.width >= mobileManageControls.panelWidth * 0.75) ||
  mobileManageControls.panelRight - mobileManageControls.bounds.at(-1).right > 40
) {
  throw new Error(
    `Mobile lesson actions should stay compact and right-aligned: ${JSON.stringify(mobileManageControls)}.`
  );
}
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-mobile.png"), fullPage: true });
await mobileManagePanel.getByRole("button", { name: "Back to calendar", exact: true }).click();
await mobileManagePanel.getByText("Selected day", { exact: true }).waitFor();
await waitForOrientation(accountPage);
const compactCalendarLayout = await accountPage.evaluate(() => {
  const grid = document.querySelector("#lesson-calendar .unified-calendar__grid")?.getBoundingClientRect();
  const details = document.querySelector("#lesson-calendar .unified-calendar__panel")?.getBoundingClientRect();
  return { gridBottom: grid?.bottom ?? 0, detailsTop: details?.top ?? 0 };
});
if (compactCalendarLayout.detailsTop - compactCalendarLayout.gridBottom > 24) {
  throw new Error("The selected lesson details are not directly below the compact mobile calendar.");
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-selected-mobile.png"), fullPage: true });
await showAllDates.click();
await accountPage.waitForFunction(
  (expected) => document.querySelectorAll("#lesson-calendar .unified-calendar__grid .calendar-week").length === expected,
  fullCalendarWeekCount
);
const restoredCalendarWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (restoredCalendarWeekCount !== fullCalendarWeekCount) {
  throw new Error(
    `Show all dates restored ${restoredCalendarWeekCount} weeks instead of ${fullCalendarWeekCount}.`
  );
}

await accountPage.getByRole("button", { name: "Book a new lesson", exact: true }).click();
await accountPage.getByRole("heading", { name: "Choose a lesson", exact: true }).waitFor();
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("The calendar should wait until a lesson type has been chosen.");
}
if (await accountPage.getByRole("button", { name: /Trial lesson/ }).count()) {
  throw new Error("A student with any non-cancelled booking should not be offered the trial.");
}
if (await accountPage.getByText(/The trial is for a first lesson/i).count()) {
  throw new Error("Trial ineligibility should restore the valid choices without a warning banner.");
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
const lessonSummaryLayout = await lessonSummary.evaluate((summary) => {
  const copy = summary.querySelector(".booking-choice-summary__copy")?.getBoundingClientRect();
  const action = summary.querySelector(".booking-choice-summary__change")?.getBoundingClientRect();
  const rectangle = summary.getBoundingClientRect();
  return {
    copyRight: copy?.right ?? 0,
    actionLeft: action?.left ?? Infinity,
    actionRight: action?.right ?? 0,
    summaryRight: rectangle.right
  };
});
if (
  lessonSummaryLayout.actionLeft < lessonSummaryLayout.copyRight - 1 ||
  lessonSummaryLayout.summaryRight - lessonSummaryLayout.actionRight > 18
) {
  throw new Error(`Change lesson should stay aligned on the right: ${JSON.stringify(lessonSummaryLayout)}.`);
}
await changeLesson.click();
await accountPage.getByRole("button", { name: "Single lesson 60 minutes · €25", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Single lesson 60 minutes · €25", exact: true }).click();
await lessonSummary.waitFor({ state: "visible" });
const freeDay = accountPage.getByRole("button", { name: /1 times free/ }).first();
await freeDay.waitFor({ state: "visible" });
await freeDay.click();
await showAllDates.waitFor({ state: "visible" });
await accountPage.waitForFunction(
  () => {
    const panel = document.querySelector("#booking-next-step")?.getBoundingClientRect();
    return Boolean(panel && panel.top < window.innerHeight && panel.bottom > 0);
  },
  null,
  { timeout: 2_000 }
);
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
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-free-day-mobile.png"), fullPage: true });

await accountPage
  .locator("#lesson-calendar .unified-calendar__availability .slot-grid button")
  .first()
  .click();
const confirmHeading = accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true });
await confirmHeading.waitFor({ state: "visible" });
for (const duplicateIdentity of ["Signed in as", "Booking as", "Not you?"]) {
  if (await accountPage.getByText(duplicateIdentity, { exact: false }).count()) {
    throw new Error(`Confirmation still repeats the account identity as “${duplicateIdentity}”.`);
  }
}
await accountPage.waitForFunction(
  () => {
    const heading = document.querySelector("#booking-step-heading")?.getBoundingClientRect();
    return Boolean(heading && heading.top < window.innerHeight && heading.bottom > 0);
  },
  null,
  { timeout: 2_000 }
);
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
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-confirm-mobile.png"), fullPage: true });

await accountPage.getByRole("button", { name: "Change time", exact: true }).click();
await showAllDates.waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count()) !== 1) {
  throw new Error("Changing the time should restore the selected week, not the full calendar.");
}
await lessonSummary.waitFor({ state: "visible" });
await showAllDates.click();

await changeLesson.click();
await accountPage.getByRole("heading", { name: "Choose a lesson", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Back", exact: true }).click();
await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });

const stopRepeating = accountPage.getByRole("button", { name: "Stop repeating", exact: true });
await stopRepeating.click();
await accountPage.getByRole("heading", { name: "Stop repeating lessons?", exact: true }).waitFor();
if (stopRepeatCalls !== 0) throw new Error("Opening the repeat confirmation called the stop endpoint.");
await waitForOrientation(accountPage);
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
await accountPage.getByRole("button", { name: "Book a new lesson", exact: true }).waitFor();
await accountPanel.waitFor({ state: "detached" });
await accountPage.close();
await accountBrowser.close();

// Old emailed links remain valid, but now land in the same booking workspace.
const legacyBrowser = await chromium.launch({ headless: true });
const legacyPage = await legacyBrowser.newPage({ viewport: { width: 390, height: 844 } });
await legacyPage.goto(`${base}/booking`, { waitUntil: "domcontentloaded" });
await legacyPage.waitForSelector("#booking-journey-start", { timeout: 10_000 });
await legacyPage.waitForFunction(() => window.location.pathname === "/book/", null, { timeout: 10_000 });
if (new URL(legacyPage.url()).pathname !== "/book/") {
  throw new Error(`The legacy management route did not normalise to /book/: ${legacyPage.url()}`);
}
await legacyPage.close();
await legacyBrowser.close();

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
      unifiedBookingLinks: 2,
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
      reducedRouteMotion,
      fallbackBookingMotion,
      bookingTransitionSeen,
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

async function waitForOrientation(targetPage) {
  await targetPage.waitForFunction(
    () => !document.documentElement.classList.contains("booking-transitioning"),
    null,
    { timeout: 2_000 }
  );
  await targetPage.evaluate(
    () =>
      new Promise((resolve) => {
        let previousY = window.scrollY;
        let stableFrames = 0;
        let frames = 0;
        const check = () => {
          const currentY = window.scrollY;
          stableFrames = Math.abs(currentY - previousY) < 0.5 ? stableFrames + 1 : 0;
          previousY = currentY;
          frames += 1;
          if (stableFrames >= 4 || frames >= 120) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      })
  );
}

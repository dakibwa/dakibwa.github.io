import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "tmp/qa");
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const routes = [
  { id: "home", path: "/", heading: "European Portuguese lessons." },
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

// Booking decisions use one lightweight local transition in every browser.
// Exercise it before the route matrix so the bundle is tested from a clean
// browser cache rather than behind ten screenshot navigations.
const localMotionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await localMotionPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
await localMotionPage
  .getByRole("button", { name: "Book a new lesson", exact: true })
  .waitFor({ state: "visible", timeout: 10_000 });
await localMotionPage.getByRole("button", { name: "Book a new lesson", exact: true }).click();
await localMotionPage.getByRole("button", { name: "One lesson · choose 60 or 90 minutes", exact: true }).click();
await localMotionPage.getByRole("heading", { name: "Choose your lesson", exact: true }).waitFor();
const localMotionSingleLesson = localMotionPage.getByRole("radio", {
  name: "60 minutes lesson · €25",
  exact: true
});
await localMotionSingleLesson.waitFor({ state: "visible", timeout: 10_000 });
await localMotionSingleLesson.check();
await localMotionPage.evaluate(() => {
  document.documentElement.dataset.qaFallbackTransitionSeen = "false";
  const observer = new MutationObserver(() => {
    if (!document.documentElement.classList.contains("booking-transitioning")) return;
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
await localMotionPage.getByRole("button", { name: "Choose a date", exact: true }).click();
await localMotionPage.locator(".booking-choice-summary").waitFor({ state: "visible" });
const localBookingMotion = await localMotionPage.evaluate(() => ({
  animationDuration: document.documentElement.dataset.qaFallbackAnimationDuration,
  animationName: document.documentElement.dataset.qaFallbackAnimationName,
  seen: document.documentElement.dataset.qaFallbackTransitionSeen === "true"
}));
if (
  !localBookingMotion.seen ||
  !localBookingMotion.animationName?.includes("booking-flow-in") ||
  localBookingMotion.animationDuration === "0s"
) {
  throw new Error("Booking decisions should receive the lightweight local surface transition.");
}
await localMotionPage.close();

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

    const wordmarkCount = await page.locator(".brand-wordmark").count();
    if (wordmarkCount !== 2) {
      throw new Error(`${route.id} should use one header wordmark and one footer sign-off; found ${wordmarkCount}.`);
    }

    if ((await page.locator(".site-footer .brand-wordmark").count()) !== 1) {
      throw new Error(`${route.id} should retain the cream-on-blue footer wordmark once.`);
    }

    if (route.id === "home") {
      const homeBookingActions = await page.locator("main").getByRole("link", { name: "Book a lesson", exact: true }).count();
      if (homeBookingActions !== 1) {
        throw new Error(`Home should present one booking action; found ${homeBookingActions}.`);
      }
      if ((await page.locator(".home-hero__links a").count()) !== 2 || (await page.locator(".home-closing").count())) {
        throw new Error("Home should keep its two supporting routes inside the introduction with no closing strip.");
      }
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
  assertIncludes(bookingText, "how would you like to book?", "booking pattern heading");
  assertIncludes(bookingText, "one lesson", "one-off booking choice");
  assertIncludes(bookingText, "recurring lessons", "recurring booking choice");
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
const stopRepeatPayloads = [];
let qaManagedStart;
let qaManagedLessonType = { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
let qaManagedLocation = "online";
const qaReschedulePayloads = [];
const accountRequestMethods = [];
const formatQaTime = (value) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
}).format(value);
const qaStart = new Date(Date.now() + 7 * 86_400_000);
qaStart.setUTCHours(17, 0, 0, 0);
qaManagedStart = qaStart;
const qaEnd = new Date(qaStart.getTime() + 60 * 60_000);
const qaSecondStart = new Date(qaStart.getTime() + 2 * 60 * 60_000);
const qaSecondEnd = new Date(qaSecondStart.getTime() + 60 * 60_000);
const qaFreeStart = new Date(qaStart.getTime() + 24 * 60 * 60_000);
const qaFreeDate = qaFreeStart.toISOString().slice(0, 10);
const qaFreeSlots = Array.from({ length: 5 }, (_, index) => {
  const start = new Date(qaFreeStart.getTime() + index * 30 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
});
const qaPastStart = new Date(Date.now() - 7 * 24 * 60 * 60_000);
qaPastStart.setUTCHours(15, 0, 0, 0);
const qaPastEnd = new Date(qaPastStart.getTime() + 60 * 60_000);
const qaLaterStart = new Date(Date.now() + 84 * 24 * 60 * 60_000);
qaLaterStart.setUTCHours(17, 0, 0, 0);
const qaLaterEnd = new Date(qaLaterStart.getTime() + 60 * 60_000);
const qaLaterDate = qaLaterStart.toISOString().slice(0, 10);
const qaLaterOneOffStart = new Date(qaLaterStart.getTime() + 2 * 24 * 60 * 60_000);
const qaLaterOneOffEnd = new Date(qaLaterOneOffStart.getTime() + 60 * 60_000);
const qaExtraSeriesBookings = Array.from({ length: 8 }, (_, index) => {
  const start = new Date(qaLaterStart.getTime() + (index + 1) * 7 * 24 * 60 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    reference: `INES-LATER-${index + 2}`,
    status: "confirmed",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    location: "online",
    notes: "",
    lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
    isPast: false,
    sameDayFeeApplies: false,
    seriesId: "series-qa",
    manageToken: `manage-later-${index + 2}`
  };
});
let qaCreatedBookings = [];
let qaCreatedSeries = [];
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
        [qaFreeDate]: qaFreeSlots
      },
      timeZone: "Europe/Lisbon",
      minimumNoticeHours: 24,
      horizonDays: 56,
      lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
    })
  });
});
await accountPage.route("**/bookings/series/preview", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
    return;
  }
  const bookable = Array.from({ length: 4 }, (_, index) =>
    new Date(qaFreeStart.getTime() + index * 7 * 24 * 60 * 60_000).toISOString()
  );
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ weeks: 4, openEnded: false, bookable, skipped: [] })
  });
});
await accountPage.route("**/bookings", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
    return;
  }

  const payload = route.request().postDataJSON();
  const isRecurring = payload.repeat === 4;
  const starts = Array.from({ length: isRecurring ? 4 : 1 }, (_, index) =>
    new Date(qaFreeStart.getTime() + index * 7 * 24 * 60 * 60_000)
  );
  const seriesId = isRecurring ? "series-created-qa" : null;
  qaCreatedBookings = starts.map((start, index) => ({
    reference: isRecurring ? `INES-CREATED-R${index + 1}` : "INES-CREATED-ONE",
    status: "confirmed",
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
    location: payload.location,
    notes: "",
    lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
    isPast: false,
    sameDayFeeApplies: false,
    seriesId,
    manageToken: isRecurring ? `manage-created-r${index + 1}` : "manage-created-one"
  }));
  qaCreatedSeries = isRecurring
    ? [{ id: seriesId, weekday: starts[0].getUTCDay(), minuteOfDay: 1020, occurrences: 4, openEnded: false, upcoming: 4 }]
    : [];

  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        ...qaCreatedBookings[0],
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon"
      },
      manageUrl: `/book/?manage=${qaCreatedBookings[0].manageToken}`,
      manageToken: qaCreatedBookings[0].manageToken,
      ...(isRecurring
        ? {
            series: {
              id: seriesId,
              weeks: 4,
              openEnded: false,
              booked: starts.map((start) => start.toISOString()),
              skipped: []
            }
          }
        : {})
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
          seriesId: "series-qa",
          manageToken: "manage-later"
        },
        {
          reference: "INES-LATER-ONE-OFF",
          status: "confirmed",
          startAt: qaLaterOneOffStart.toISOString(),
          endAt: qaLaterOneOffEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-later-one-off"
        },
        ...qaExtraSeriesBookings,
        ...qaCreatedBookings
      ],
      series: [
        ...(repeatStopped
          ? []
          : [
            {
              id: "series-qa",
              weekday: 1,
              minuteOfDay: 1080,
              occurrences: null,
              openEnded: true,
              upcoming: 10
            }
          ]),
        ...qaCreatedSeries
      ],
      sameDayFeeCents: 500
    })
  });
});
await accountPage.route("**/bookings/manage-qa", async (route) => {
  const managedEnd = new Date(qaManagedStart.getTime() + qaManagedLessonType.durationMinutes * 60_000);
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-QA01",
        status: "confirmed",
        startAt: qaManagedStart.toISOString(),
        endAt: managedEnd.toISOString(),
        location: qaManagedLocation,
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: qaManagedLessonType
      },
      isPast: false,
      sameDayFeeApplies: false,
      changeLocked: false,
      refundOnCancel: false
    })
  });
});
await accountPage.route("**/bookings/manage-qa/reschedule", async (route) => {
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

  const payload = route.request().postDataJSON();
  qaReschedulePayloads.push(payload);
  qaManagedStart = new Date(payload.startAt);
  qaManagedLessonType = payload.lessonType === "longer-90"
    ? { id: "longer-90", name: "Longer lesson", durationMinutes: 90, priceCents: 3500 }
    : { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
  qaManagedLocation = payload.location === "porto" ? "porto" : "online";
  const managedEnd = new Date(qaManagedStart.getTime() + qaManagedLessonType.durationMinutes * 60_000);
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-QA01",
        status: "confirmed",
        startAt: qaManagedStart.toISOString(),
        endAt: managedEnd.toISOString(),
        location: qaManagedLocation,
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 1,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: qaManagedLessonType
      },
      sameDayFeeApplied: false
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
await accountPage.route("**/bookings/manage-later-*", async (route) => {
  const token = route.request().url().split("/").at(-1) ?? "";
  const booking = qaExtraSeriesBookings.find((entry) => entry.manageToken === token);
  if (!booking) {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Booking not found." }) });
    return;
  }
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: booking.reference,
        status: booking.status,
        startAt: booking.startAt,
        endAt: booking.endAt,
        location: booking.location,
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: booking.lessonType
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
  const payload = JSON.parse(route.request().postData() || "{}");
  stopRepeatPayloads.push(payload);
  repeatStopped = true;
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      ok: true,
      stopped: true,
      cancelled: payload.cancelRemaining ? 4 : 0,
      kept: 0,
      refunded: payload.cancelRemaining ? 1 : 0
    })
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
const accountMenuButton = accountPanel.getByRole("button", { name: "Menu", exact: true });
await accountMenuButton.waitFor();

async function bookQaLessonAndReturnToUpcoming({ recurring }) {
  await accountPage.getByRole("button", { name: /Book a (?:new )?lesson/, exact: true }).click();
  await accountPage
    .getByRole("button", {
      name: recurring
        ? "Recurring lessons · keep the same weekly time"
        : "One lesson · choose 60 or 90 minutes",
      exact: true
    })
    .click();
  await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).check();
  await accountPage.getByRole("button", { name: "Choose a date", exact: true }).click();
  await accountPage.getByRole("button", { name: /times free/ }).first().click();
  await accountPage.locator("#lesson-calendar .unified-calendar__availability .slot-grid button").first().click();
  await accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true }).waitFor();

  if (recurring) {
    await accountPage.getByText("4 lessons at this time", { exact: false }).waitFor();
  }

  await accountPage
    .getByRole("button", { name: recurring ? "Confirm these 4 lessons" : "Confirm this lesson", exact: true })
    .click();
  await accountPage.getByRole("heading", { name: /booked in/i }).waitFor();
  if (recurring) {
    await accountPage.getByText("4 lessons booked", { exact: false }).waitFor();
  }

  await accountPage.getByRole("button", { name: "Back to upcoming lessons", exact: true }).click();
  await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
  await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });
  const createdGroups = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group");
  if ((await createdGroups.count()) !== 4) {
    throw new Error(`A completed ${recurring ? "recurring" : "one-off"} booking should appear in Upcoming lessons.`);
  }
  const expectedKindCount = await accountPanel
    .locator(`#account-upcoming-lessons .upcoming-lesson-group--${recurring ? "series" : "single"}`)
    .count();
  if (expectedKindCount !== (recurring ? 2 : 3)) {
    throw new Error(`The new ${recurring ? "recurring sequence" : "one-off lesson"} was not grouped correctly after returning.`);
  }
  await accountPage.screenshot({
    path: path.join(outDir, recurring ? "booking-confirm-back-recurring-mobile.png" : "booking-confirm-back-once-mobile.png"),
    fullPage: true
  });

  qaCreatedBookings = [];
  qaCreatedSeries = [];
  await accountPage.reload({ waitUntil: "domcontentloaded" });
  await accountPanel.waitFor({ state: "visible" });
  await accountPage.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor();
}

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
await accountPage.getByLabel("3 upcoming lessons", { exact: true }).waitFor();
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("The calendar should not compete with the first book-or-view decision.");
}
if (await accountPage.locator(".unified-booking__lesson-picker").count()) {
  throw new Error("Lesson types should wait until the student chooses to book.");
}
for (const hiddenUntilViewing of [/View lessons/, /Stop repeating/, /Cancel all booked lessons/]) {
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

await accountMenuButton.click();
const initialAccountMenu = accountPanel.locator("#account-menu");
await initialAccountMenu.waitFor({ state: "visible" });
if ((await initialAccountMenu.getByRole("button").count()) !== 5) {
  throw new Error("View lessons, Book a lesson, Past lessons, Edit details and Sign out should remain available from the initial account menu.");
}
if (!(await initialAccountMenu.getByRole("button", { name: /View lessons/ }).isVisible())) {
  throw new Error("View lessons should not require entering the lesson calendar first.");
}
if (!(await initialAccountMenu.getByRole("button", { name: "Book a lesson", exact: true }).isVisible())) {
  throw new Error("Booking should be a primary account-menu shortcut.");
}
if (!(await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).isVisible())) {
  throw new Error("Past lessons should not require entering the lesson calendar first.");
}
if (/\d/.test(await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).innerText())) {
  throw new Error("Past lessons should not carry an attention-grabbing count.");
}
await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("The initial Past lessons shortcut should establish the four-week lesson workspace.");
}
await accountPanel.getByRole("button", { name: "Back to start", exact: true }).click();
await accountPage.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor();
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Edit details", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const embeddedDetailsChrome = await accountPanel.locator(".my-lessons__details").evaluate((details) => {
  const styles = window.getComputedStyle(details);
  return {
    backgroundColor: styles.backgroundColor,
    borderBottomWidth: styles.borderBottomWidth,
    borderLeftWidth: styles.borderLeftWidth,
    borderRightWidth: styles.borderRightWidth,
    borderRadius: styles.borderRadius,
  };
});
if (
  embeddedDetailsChrome.backgroundColor !== "rgba(0, 0, 0, 0)" ||
  embeddedDetailsChrome.borderBottomWidth !== "0px" ||
  embeddedDetailsChrome.borderLeftWidth !== "0px" ||
  embeddedDetailsChrome.borderRightWidth !== "0px" ||
  embeddedDetailsChrome.borderRadius !== "0px"
) {
  throw new Error(`Embedded account fields should use the account panel instead of a nested card: ${JSON.stringify(embeddedDetailsChrome)}.`);
}
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
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Done editing", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "detached" });

await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("Viewing existing lessons should always open the four-week calendar.");
}
if (await accountPage.getByRole("button", { name: "Show 8 weeks", exact: true }).count()) {
  throw new Error("The lesson overview should keep its four-week horizon instead of exposing a calendar range toggle.");
}
if (await accountPage.getByRole("button", { name: "Stop repeating", exact: true }).count()) {
  throw new Error("Sequence controls should appear only when one recurring lesson is selected.");
}
if (await accountPage.getByRole("button", { name: "Cancel all booked lessons", exact: true }).count()) {
  throw new Error("Bulk sequence cancellation should appear only when one recurring lesson is selected.");
}
await accountMenuButton.click();
const lessonsAccountMenu = accountPanel.locator("#account-menu");
if ((await lessonsAccountMenu.getByRole("button").count()) !== 5) {
  throw new Error("View lessons, Book a lesson, Past lessons, Edit details and Sign out should live together in the account menu.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-menu-desktop.png"), fullPage: true });
const pastLessonsToggle = lessonsAccountMenu.getByRole("button", { name: /Past lessons/ });
await pastLessonsToggle.click();
await accountPanel.getByRole("heading", { name: "Past lessons", exact: true }).waitFor();
await waitForOrientation(accountPage);
if (!(await accountPanel.getByText("INES-OLD1", { exact: true }).isVisible())) {
  throw new Error("Past lessons should open from the account menu.");
}
const pastLessonPlacement = await accountPanel.evaluate((panel) => {
  const account = panel.querySelector(".unified-account-controls")?.getBoundingClientRect();
  const history = panel.querySelector("#account-past-lessons")?.getBoundingClientRect();
  return { accountBottom: account?.bottom ?? Infinity, historyTop: history?.top ?? -Infinity };
});
if (pastLessonPlacement.historyTop <= pastLessonPlacement.accountBottom + 4) {
  throw new Error(`Past lessons should live in a separate panel below the account bar: ${JSON.stringify(pastLessonPlacement)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-past-lessons-desktop.png"), fullPage: true });
await accountPanel.getByRole("button", { name: "Back to start", exact: true }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "detached" });
await accountPage.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });

await accountMenuButton.click();
const laterLessonsToggle = accountPanel.getByRole("button", { name: /View lessons/ });
if (!/3\s*$/.test((await laterLessonsToggle.innerText()).trim())) {
  throw new Error("The Upcoming lessons badge should count each repeating schedule once, plus each one-off lesson.");
}
await accountMenuButton.click();
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const calendarToolbarAlignment = await accountPage.evaluate(() => {
  const legend = document.querySelector("#lesson-calendar .unified-calendar__legend")?.getBoundingClientRect();
  const range = document.querySelector("#lesson-calendar .unified-calendar__range-actions")?.getBoundingClientRect();
  return {
    legendCenter: legend ? (legend.top + legend.bottom) / 2 : -Infinity,
    rangeCenter: range ? (range.top + range.bottom) / 2 : Infinity
  };
});
if (Math.abs(calendarToolbarAlignment.legendCenter - calendarToolbarAlignment.rangeCenter) > 1) {
  throw new Error(`The calendar key and range label should share one vertical centre: ${JSON.stringify(calendarToolbarAlignment)}.`);
}
const laterGroups = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group");
const recurringLaterGroup = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group--series");
const oneOffLaterGroup = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group--single");
if (
  (await laterGroups.count()) !== 3 ||
  (await recurringLaterGroup.count()) !== 1 ||
  (await oneOffLaterGroup.count()) !== 2
) {
  throw new Error("Upcoming lessons should show one card per repeating schedule and one per one-off lesson.");
}
if (await recurringLaterGroup.getByText(/booked dates/i).count()) {
  throw new Error("A repeating lesson should not repeat its booked-date count in the compact summary.");
}
if (!(await recurringLaterGroup.getByText("60 mins · Online", { exact: true }).isVisible())) {
  throw new Error("A booked single lesson should use its duration instead of repeating the product name.");
}
if (await recurringLaterGroup.getByText(/Single lesson/i).count()) {
  throw new Error("Upcoming booking summaries should not repeat “Single lesson”.");
}
if (!(await recurringLaterGroup.getByText("Recurring lesson", { exact: true }).isVisible())) {
  throw new Error("A repeating schedule should be visibly distinct from one-off booked lessons.");
}
if ((await oneOffLaterGroup.getByText("Booked", { exact: true }).count()) !== 2) {
  throw new Error("One-off upcoming lessons should retain the normal Booked status.");
}
if (!(await recurringLaterGroup.getByText(/Next:/).isVisible())) {
  throw new Error("A repeating schedule should lead with its next occurrence.");
}
const lessonCardSurface = async (card) => card.evaluate((element) => {
  const style = getComputedStyle(element);
  return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
});
const recurringSurfaceBefore = await lessonCardSurface(recurringLaterGroup);
await recurringLaterGroup.hover();
await accountPage.waitForTimeout(240);
const recurringSurfaceAfter = await lessonCardSurface(recurringLaterGroup);
const oneOffSurfaceBefore = await lessonCardSurface(oneOffLaterGroup.first());
await oneOffLaterGroup.first().hover();
await accountPage.waitForTimeout(240);
const oneOffSurfaceAfter = await lessonCardSurface(oneOffLaterGroup.first());
if (recurringSurfaceBefore === recurringSurfaceAfter || oneOffSurfaceBefore === oneOffSurfaceAfter) {
  throw new Error("Every upcoming lesson card should gain a subtle background treatment on hover.");
}
const modificationHint = accountPanel.getByRole("button", { name: "When individual lessons can be modified", exact: true });
const modificationTooltip = accountPanel.locator('[role="tooltip"]');
if ((await modificationTooltip.textContent())?.trim() !== "You can modify individual lessons up to four weeks in advance.") {
  throw new Error("Upcoming lessons should explain the four-week individual modification window.");
}
if (await accountPanel.getByText(/Recurring lessons appear once/i).count()) {
  throw new Error("Upcoming lessons should not repeat the recurring-lesson explanation outside the tooltip.");
}
const tooltipCardTopBefore = await recurringLaterGroup.evaluate((card) => card.getBoundingClientRect().top);
await modificationHint.focus();
await modificationTooltip.waitFor({ state: "visible" });
await accountPage.waitForFunction(
  () => getComputedStyle(document.querySelector("#upcoming-lessons-modification-tip")).opacity === "1"
);
const tooltipLayout = await accountPage.evaluate(() => {
  const section = document.querySelector("#account-upcoming-lessons");
  const heading = document.querySelector("#upcoming-lessons-heading");
  const tip = document.querySelector("#upcoming-lessons-modification-tip");
  const back = section?.querySelector(".booking-back");
  const firstCard = section?.querySelector(".upcoming-lesson-group");
  const tipStyles = tip ? getComputedStyle(tip) : null;
  const bounds = (element) => element?.getBoundingClientRect() ?? null;
  return {
    section: bounds(section),
    heading: bounds(heading),
    tip: bounds(tip),
    back: bounds(back),
    firstCard: bounds(firstCard),
    tipStyles: tipStyles
      ? { backgroundColor: tipStyles.backgroundColor, opacity: tipStyles.opacity, position: tipStyles.position }
      : null
  };
});
if (
  !tooltipLayout.section ||
  !tooltipLayout.heading ||
  !tooltipLayout.tip ||
  !tooltipLayout.back ||
  !tooltipLayout.firstCard ||
  !tooltipLayout.tipStyles ||
  tooltipLayout.tip.left < tooltipLayout.section.left - 1 ||
  tooltipLayout.tip.right > tooltipLayout.section.right + 1 ||
  Math.abs(tooltipLayout.firstCard.top - tooltipCardTopBefore) > 1 ||
  tooltipLayout.tip.bottom <= tooltipLayout.firstCard.top ||
  tooltipLayout.tip.top >= tooltipLayout.firstCard.bottom ||
  tooltipLayout.tipStyles.position !== "absolute" ||
  tooltipLayout.tipStyles.opacity !== "1" ||
  tooltipLayout.tipStyles.backgroundColor !== "rgba(26, 49, 105, 0.97)"
) {
  throw new Error(`The upcoming-lessons tooltip should float over the list on its dark surface without moving a card: ${JSON.stringify({ tooltipCardTopBefore, ...tooltipLayout })}.`);
}
if (Math.abs(tooltipLayout.back.top - tooltipLayout.heading.top) > 18) {
  throw new Error(`Back to start should sit at the upper right of the upcoming-lessons heading: ${JSON.stringify(tooltipLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-tooltip-desktop.png"), fullPage: true });
await accountMenuButton.focus();
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("The four-week calendar should remain as a visual beneath upcoming lessons.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-desktop.png"), fullPage: true });

await recurringLaterGroup.getByRole("button", { name: "View next 4 lessons", exact: true }).click();
const nextRecurringLessons = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-occurrence");
await nextRecurringLessons.first().waitFor({ state: "visible" });
if ((await nextRecurringLessons.count()) !== 4) {
  throw new Error("A repeating lesson should reveal only its next four booked occurrences.");
}
if ((await nextRecurringLessons.getByText("60 mins · Online", { exact: true }).count()) !== 4) {
  throw new Error("Every expanded occurrence should retain the compact duration and location.");
}
await nextRecurringLessons.first().click();
const upcomingManageDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
await upcomingManageDialog.waitFor({ state: "visible", timeout: 10_000 });
await upcomingManageDialog.getByText("Recurring lesson", { exact: true }).waitFor();
await upcomingManageDialog.getByText("60 mins · Online", { exact: true }).waitFor();
await upcomingManageDialog.getByText("Part of a recurring sequence", { exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Change", exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Cancel", exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Manage sequence", exact: true }).waitFor();
if (!(await accountPanel.locator("#account-upcoming-lessons").isVisible())) {
  throw new Error("Opening a recurring occurrence should keep the upcoming list in the same workspace.");
}
if (await accountPage.locator("#lesson-calendar.unified-calendar--managed").count()) {
  throw new Error("A compact lesson choice should not rearrange the calendar into a separate management layout.");
}
const managedDialogLayout = await upcomingManageDialog.evaluate((dialog) => {
  const rectangle = dialog.getBoundingClientRect();
  return {
    width: rectangle.width,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    top: rectangle.top,
    bottom: rectangle.bottom
  };
});
if (
  managedDialogLayout.width > 460 ||
  managedDialogLayout.width > managedDialogLayout.viewportWidth - 24 ||
  managedDialogLayout.top < 0 ||
  managedDialogLayout.bottom > managedDialogLayout.viewportHeight + 1
) {
  throw new Error(`Lesson management should be a small, contained overlay: ${JSON.stringify(managedDialogLayout)}.`);
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-overlay-desktop.png"), fullPage: true });
await upcomingManageDialog.getByRole("button", { name: "Cancel", exact: true }).click();
await accountPage.getByRole("dialog", { name: "Cancel this lesson?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Keep lesson", exact: true }).click();
await upcomingManageDialog.waitFor({ state: "visible" });
await upcomingManageDialog.getByRole("button", { name: "Change", exact: true }).evaluate((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.qaUpcomingChangeScrollBefore = String(window.scrollY);
  }, { capture: true, once: true });
});
await upcomingManageDialog.getByRole("button", { name: "Change", exact: true }).click();
await upcomingManageDialog.waitFor({ state: "detached" });
const upcomingChangeDialog = accountPage.getByRole("dialog", { name: "Choose a new date and time", exact: true });
await upcomingChangeDialog.waitFor({ state: "visible" });
const upcomingManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
await upcomingManagePanel.getByRole("heading", { name: "Choose a new date and time", exact: true }).waitFor();
if (!(await accountPanel.locator("#account-upcoming-lessons").isVisible())) {
  throw new Error("Changing a lesson should use the existing calendar without dismissing Upcoming lessons.");
}
const upcomingOverlayLayout = await accountPage.evaluate(() => {
  const workspace = document.querySelector("#lesson-calendar")?.getBoundingClientRect();
  return {
    overlay: Boolean(document.querySelector(".lesson-manage-overlay--reschedule")),
    position: document.querySelector("#lesson-calendar") ? getComputedStyle(document.querySelector("#lesson-calendar")).position : "",
    scrollBefore: Number(document.documentElement.dataset.qaUpcomingChangeScrollBefore),
    scrollY: window.scrollY,
    top: workspace?.top ?? -Infinity,
    bottom: workspace?.bottom ?? Infinity,
    viewportHeight: window.innerHeight
  };
});
if (
  !upcomingOverlayLayout.overlay ||
  upcomingOverlayLayout.position !== "fixed" ||
  Math.abs(upcomingOverlayLayout.scrollY - upcomingOverlayLayout.scrollBefore) > 1 ||
  upcomingOverlayLayout.top < 8 ||
  upcomingOverlayLayout.bottom > upcomingOverlayLayout.viewportHeight - 8
) {
  throw new Error(`Changing a lesson should keep its calendar in the darkened overlay without moving the page: ${JSON.stringify(upcomingOverlayLayout)}.`);
}
await upcomingManagePanel.getByRole("button", { name: "Back", exact: true }).click();
await upcomingManageDialog.waitFor({ state: "visible" });
await upcomingManageDialog.getByRole("button", { name: "Close lesson management", exact: true }).click();
await upcomingManageDialog.waitFor({ state: "detached" });
await accountMenuButton.click();
const managedAccountMenu = accountPanel.locator("#account-menu");
await managedAccountMenu.getByRole("button", { name: /Past lessons/ }).waitFor();
await managedAccountMenu.getByRole("button", { name: /Past lessons/ }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "visible" });
await accountPanel.getByRole("button", { name: "Back to start", exact: true }).click();
await accountPage.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
const laterDatesToggle = accountPanel.locator(".upcoming-lesson-group--series").getByRole("button", { name: "View next 4 lessons", exact: true });
await laterDatesToggle.click();
const laterLessonButton = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-occurrence");
await laterLessonButton.first().waitFor({ state: "visible" });
await waitForOrientation(accountPage);
if ((await laterLessonButton.count()) !== 4) {
  throw new Error("A repeating lesson should expose its next four occurrences and no more.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-expanded-desktop.png"), fullPage: true });
await laterLessonButton.first().click();
try {
  await upcomingManageDialog.waitFor({ state: "visible", timeout: 10_000 });
} catch {
  const dialogText = (await accountPage.locator(".lesson-manage-dialog").innerText().catch(() => "missing dialog")).replace(/\s+/g, " ").trim();
  throw new Error(`An upcoming lesson did not open in the compact management dialog. Dialog: ${dialogText}`);
}
await upcomingManageDialog.getByText("Recurring lesson", { exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Close lesson management", exact: true }).click();
await accountPage.locator("#lesson-calendar.unified-calendar--overview").waitFor({ state: "visible" });
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
if (await accountPage.locator(".booking-workflow-context, #lesson-calendar .unified-calendar__panel").count()) {
  throw new Error("The lesson overview should not repeat its context or selected-day panel beneath Upcoming lessons.");
}
if ((await accountMenuButton.getAttribute("aria-expanded")) !== "false") {
  throw new Error("Managing an upcoming occurrence should leave the account menu neatly closed when returning to the lesson list.");
}
await waitForOrientation(accountPage);
if (await accountPage.locator(`#lesson-calendar [data-date-key="${qaLaterDate}"]`).count()) {
  throw new Error("A future recurring lesson stretched the visible calendar beyond eight weeks.");
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
    calendar: bounds("#lesson-calendar")
  };
});
if (
  !desktopAccountLayout.composition ||
  !desktopAccountLayout.intro ||
  !desktopAccountLayout.provider ||
  !desktopAccountLayout.panel ||
  !desktopAccountLayout.calendar ||
  desktopAccountLayout.panel.bottom > desktopAccountLayout.calendar.top + 1 ||
  Math.abs(desktopAccountLayout.panel.left - desktopAccountLayout.calendar.left) > 2 ||
  Math.abs(desktopAccountLayout.panel.right - desktopAccountLayout.calendar.right) > 2
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
await desktopBookedDay.click();
const desktopCalendarTarget = accountPanel.locator("#upcoming-booking-INES-QA01");
await desktopCalendarTarget.waitFor({ state: "visible" });
await accountPage.waitForFunction(() => document.activeElement?.id === "upcoming-booking-INES-QA01");
await waitForOrientation(accountPage);
const desktopTargetPlacement = await desktopCalendarTarget.evaluate((target) => {
  const rectangle = target.getBoundingClientRect();
  return { top: rectangle.top, bottom: rectangle.bottom, viewportHeight: window.innerHeight };
});
if (
  desktopTargetPlacement.top < 0 ||
  desktopTargetPlacement.bottom > desktopTargetPlacement.viewportHeight ||
  (await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4 ||
  (await accountPage.locator("#lesson-calendar .unified-calendar__panel").count())
) {
  throw new Error(`A calendar booking should guide the viewport to its lesson while leaving the four-week overview intact: ${JSON.stringify(desktopTargetPlacement)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-guided-desktop.png"), fullPage: true });
await desktopCalendarTarget.click();
const desktopManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
const desktopManageDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
await desktopManageDialog.waitFor({ state: "visible" });
await desktopManageDialog.locator(".lesson-calendar__status").waitFor();
await waitForOrientation(accountPage);
const desktopManageControls = await desktopManageDialog.evaluate((dialog) => {
  const bounds = [...dialog.querySelectorAll(".lesson-manage-dialog__actions .button")].map((button) => {
    const rectangle = button.getBoundingClientRect();
    return { left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height };
  });
  const rectangle = dialog.getBoundingClientRect();
  return {
    bounds,
    panelLeft: rectangle.left,
    panelRight: rectangle.right,
    panelWidth: rectangle.width
  };
});
if (
  desktopManageControls.bounds.length !== 2 ||
  Math.abs(desktopManageControls.bounds[0].height - desktopManageControls.bounds[1].height) > 2 ||
  desktopManageControls.bounds.some((button) => button.width >= desktopManageControls.panelWidth * 0.75) ||
  desktopManageControls.bounds[0].left < desktopManageControls.panelLeft - 1 ||
  desktopManageControls.panelRight - desktopManageControls.bounds.at(-1).right > 40
) {
  throw new Error(
    `Lesson management should use one compact, aligned control system: ${JSON.stringify(desktopManageControls)}.`
  );
}
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-desktop.png"), fullPage: true });
await desktopManageDialog.getByRole("button", { name: "Change", exact: true }).evaluate((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.qaDesktopChangeScrollBefore = String(window.scrollY);
  }, { capture: true, once: true });
});
await desktopManageDialog.getByRole("button", { name: "Change", exact: true }).click();
const desktopChangeDialog = accountPage.getByRole("dialog", { name: "Choose a new date and time", exact: true });
await desktopChangeDialog.waitFor({ state: "visible" });
await desktopManagePanel.getByRole("heading", { name: "Choose a new date and time", exact: true }).waitFor();
await desktopManagePanel.getByRole("radio", { name: "60 minutes", exact: true }).waitFor();
const ninetyMinuteChoice = desktopManagePanel.getByRole("radio", { name: "90 minutes", exact: true });
await ninetyMinuteChoice.waitFor();
await desktopManagePanel.getByRole("radio", { name: "Online", exact: true }).waitFor();
const currentManagedTime = desktopManagePanel.locator(".slot-grid button.is-selected");
await currentManagedTime.waitFor();
if ((await currentManagedTime.innerText()).trim() !== formatQaTime(qaManagedStart)) {
  throw new Error("The lesson's current time should appear selected when the change workflow opens.");
}
const desktopChangeLayout = await accountPage.evaluate(() => {
  const workspace = document.querySelector("#lesson-calendar")?.getBoundingClientRect();
  const calendar = document.querySelector("#lesson-calendar .unified-calendar__grid")?.getBoundingClientRect();
  const panel = document.querySelector("#lesson-calendar .unified-calendar__panel")?.getBoundingClientRect();
  const calendarElement = document.querySelector("#lesson-calendar .unified-calendar__grid");
  const panelElement = document.querySelector("#lesson-calendar .unified-calendar__panel");
  const move = document.querySelector("#lesson-calendar .unified-calendar__move");
  const current = document.querySelector("#lesson-calendar .managed-lesson__current-time");
  return {
    calendarTop: calendar?.top ?? Infinity,
    panelTop: panel?.top ?? -Infinity,
    overlay: Boolean(document.querySelector(".lesson-manage-overlay--reschedule")),
    position: document.querySelector("#lesson-calendar") ? getComputedStyle(document.querySelector("#lesson-calendar")).position : "",
    scrollBefore: Number(document.documentElement.dataset.qaDesktopChangeScrollBefore),
    scrollY: window.scrollY,
    workspaceTop: workspace?.top ?? -Infinity,
    workspaceBottom: workspace?.bottom ?? Infinity,
    viewportHeight: window.innerHeight,
    moveBorderTopWidth: move ? getComputedStyle(move).borderTopWidth : "missing",
    currentBorderBottomWidth: current ? getComputedStyle(current).borderBottomWidth : "missing",
    calendarBorderWidth: calendarElement ? getComputedStyle(calendarElement).borderTopWidth : "missing",
    panelBorderWidth: panelElement ? getComputedStyle(panelElement).borderTopWidth : "missing",
    durationSegmented: Boolean(document.querySelector("#lesson-calendar .managed-lesson__duration .segmented")),
    locationSegmented: Boolean(document.querySelector("#lesson-calendar input[name='managed-lesson-location']"))
  };
});
if (
  Math.abs(desktopChangeLayout.calendarTop - desktopChangeLayout.panelTop) > 2 ||
  !desktopChangeLayout.overlay ||
  desktopChangeLayout.position !== "fixed" ||
  Math.abs(desktopChangeLayout.scrollY - desktopChangeLayout.scrollBefore) > 1 ||
  desktopChangeLayout.workspaceTop < 8 ||
  desktopChangeLayout.workspaceBottom > desktopChangeLayout.viewportHeight - 8 ||
  desktopChangeLayout.moveBorderTopWidth !== "0px" ||
  desktopChangeLayout.currentBorderBottomWidth !== "0px" ||
  desktopChangeLayout.calendarBorderWidth !== "0px" ||
  desktopChangeLayout.panelBorderWidth !== "0px" ||
  !desktopChangeLayout.durationSegmented ||
  !desktopChangeLayout.locationSegmented
) {
  throw new Error(`Changing a lesson should stay inside the aligned calendar interface, without decorative rules and with the shared segmented control: ${JSON.stringify(desktopChangeLayout)}.`);
}
await ninetyMinuteChoice.check();
await desktopManagePanel.getByRole("radio", { name: "In Porto", exact: true }).check();
await accountPage.locator(`#lesson-calendar [data-date-key="${qaFreeDate}"]`).click();
await desktopManagePanel.locator(".slot-grid button").first().click();
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-change-workflow-desktop.png"), fullPage: false });
await desktopManagePanel.getByRole("button", { name: /^Change to / }).click();
const changedDurationDialog = accountPage.getByRole("dialog", { name: "All sorted", exact: true });
await changedDurationDialog.waitFor({ state: "visible" });
await changedDurationDialog.getByText(/now 90 mins/i).waitFor();
if (qaReschedulePayloads.at(-1)?.lessonType !== "longer-90" || qaReschedulePayloads.at(-1)?.location !== "porto") {
  throw new Error(`Changing duration and location sent the wrong choices: ${JSON.stringify(qaReschedulePayloads.at(-1))}.`);
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-change-duration-desktop.png"), fullPage: true });
await changedDurationDialog.getByRole("button", { name: "Done", exact: true }).click();
await changedDurationDialog.waitFor({ state: "detached" });
qaManagedStart = qaStart;
qaManagedLessonType = { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
qaManagedLocation = "online";
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("Finishing lesson management should restore the four-week visual overview.");
}
await waitForOrientation(accountPage);

await accountPage.setViewportSize({ width: 390, height: 844 });
await accountPage.waitForTimeout(300);
const mobileAccountName = await accountPanel.locator(".my-lessons__account-name strong").evaluate((name) => ({
  clientWidth: name.clientWidth,
  scrollWidth: name.scrollWidth
}));
if (mobileAccountName.scrollWidth > mobileAccountName.clientWidth + 1) {
  throw new Error("The account name should remain readable beside the compact mobile menu.");
}
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: /Past lessons/ }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "visible" });
await accountPanel.locator("#account-menu").waitFor({ state: "detached" });
await waitForOrientation(accountPage);
const mobilePastLessonsLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth
}));
if (mobilePastLessonsLayout.scrollWidth > mobilePastLessonsLayout.clientWidth + 1) {
  throw new Error("The separate past-lessons panel overflows on a phone.");
}
await accountPanel.screenshot({ path: path.join(outDir, "booking-past-lessons-mobile.png") });
await accountPanel.getByRole("button", { name: "Back to start", exact: true }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "detached" });
await accountPage.getByRole("heading", { name: "What would you like to do?", exact: true }).waitFor();
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Edit details", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const mobileDetailsLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
if (mobileDetailsLayout.scrollWidth > mobileDetailsLayout.clientWidth + 1) {
  throw new Error(`The embedded account editor overflows on a phone: ${JSON.stringify(mobileDetailsLayout)}.`);
}
await accountPanel.screenshot({ path: path.join(outDir, "booking-account-edit-mobile.png") });
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Done editing", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "detached" });
await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const mobileTooltipCardTopBefore = await accountPanel
  .locator("#account-upcoming-lessons .upcoming-lesson-group")
  .first()
  .evaluate((card) => card.getBoundingClientRect().top);
await accountPanel.getByRole("button", { name: "When individual lessons can be modified", exact: true }).focus();
await accountPanel.locator('[role="tooltip"]').waitFor({ state: "visible" });
await accountPage.waitForFunction(
  () => getComputedStyle(document.querySelector("#upcoming-lessons-modification-tip")).opacity === "1"
);
const mobileTooltipLayout = await accountPage.evaluate(() => {
  const section = document.querySelector("#account-upcoming-lessons");
  const tip = document.querySelector("#upcoming-lessons-modification-tip");
  const firstCard = section?.querySelector(".upcoming-lesson-group");
  const tipStyles = tip ? getComputedStyle(tip) : null;
  const bounds = (element) => element?.getBoundingClientRect() ?? null;
  return {
    section: bounds(section),
    tip: bounds(tip),
    firstCard: bounds(firstCard),
    tipStyles: tipStyles
      ? { backgroundColor: tipStyles.backgroundColor, opacity: tipStyles.opacity, position: tipStyles.position }
      : null
  };
});
if (
  !mobileTooltipLayout.section ||
  !mobileTooltipLayout.tip ||
  !mobileTooltipLayout.firstCard ||
  !mobileTooltipLayout.tipStyles ||
  mobileTooltipLayout.tip.left < mobileTooltipLayout.section.left - 1 ||
  mobileTooltipLayout.tip.right > mobileTooltipLayout.section.right + 1 ||
  Math.abs(mobileTooltipLayout.firstCard.top - mobileTooltipCardTopBefore) > 1 ||
  mobileTooltipLayout.tip.bottom <= mobileTooltipLayout.firstCard.top ||
  mobileTooltipLayout.tip.top >= mobileTooltipLayout.firstCard.bottom ||
  mobileTooltipLayout.tipStyles.position !== "absolute" ||
  mobileTooltipLayout.tipStyles.opacity !== "1" ||
  mobileTooltipLayout.tipStyles.backgroundColor !== "rgba(26, 49, 105, 0.97)"
) {
  throw new Error(`The upcoming-lessons tooltip should float over the mobile list without moving a card: ${JSON.stringify({ mobileTooltipCardTopBefore, ...mobileTooltipLayout })}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-tooltip-mobile.png"), fullPage: true });
await accountMenuButton.focus();
await accountPanel.locator(".upcoming-lesson-group--series").getByRole("button", { name: "View next 4 lessons", exact: true }).click();
await accountPanel.locator(".upcoming-lesson-occurrence").first().waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const mobileRecurringSummaryLayout = await accountPanel.locator(".upcoming-lesson-group--series").evaluate((card) => {
  const bounds = (selector) => card.querySelector(selector)?.getBoundingClientRect() ?? null;
  return {
    card: card.getBoundingClientRect(),
    mark: bounds(".lesson-calendar__mark"),
    copy: bounds(".lesson-calendar__lesson-copy"),
    actions: bounds(".upcoming-lesson-group__actions")
  };
});
if (
  !mobileRecurringSummaryLayout.mark ||
  !mobileRecurringSummaryLayout.copy ||
  !mobileRecurringSummaryLayout.actions ||
  mobileRecurringSummaryLayout.mark.left < mobileRecurringSummaryLayout.card.left + 6 ||
  mobileRecurringSummaryLayout.copy.left < mobileRecurringSummaryLayout.mark.right - 2 ||
  mobileRecurringSummaryLayout.copy.right > mobileRecurringSummaryLayout.card.right - 6 ||
  mobileRecurringSummaryLayout.actions.left < mobileRecurringSummaryLayout.card.left + 6 ||
  mobileRecurringSummaryLayout.actions.right > mobileRecurringSummaryLayout.card.right - 6
) {
  throw new Error(`The mobile recurring summary should keep its mark, copy, and actions inside one clean card: ${JSON.stringify(mobileRecurringSummaryLayout)}.`);
}
const mobileLaterLessonsLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth
}));
if (mobileLaterLessonsLayout.scrollWidth > mobileLaterLessonsLayout.clientWidth + 1) {
  throw new Error(`The grouped upcoming lessons overflow on a phone: ${JSON.stringify(mobileLaterLessonsLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-mobile.png"), fullPage: true });
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: /View lessons/ }).click();
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "detached" });
const mobileAccountLayout = await accountPage.evaluate(() => {
  const calendar = document.querySelector("#lesson-calendar .unified-calendar__grid");
  const calendarBounds = calendar?.getBoundingClientRect();
  const firstWeekday = calendar?.querySelector(".calendar-weekdays span:first-child")?.getBoundingClientRect();
  const lastWeekday = calendar?.querySelector(".calendar-weekdays span:last-child")?.getBoundingClientRect();
  const legend = calendar?.querySelector(".unified-calendar__legend")?.getBoundingClientRect();
  return {
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

const defaultCalendarWeekCount = await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count();
if (defaultCalendarWeekCount !== 4) {
  throw new Error(`The default upcoming-lessons calendar rendered ${defaultCalendarWeekCount} rows instead of four.`);
}
if (await accountPage.getByRole("button", { name: "Show all", exact: true }).count()) {
  throw new Error("The upcoming-lessons calendar should show four weeks by default, without an expansion control.");
}
const bookingTimes = accountPage.locator("#lesson-calendar .calendar-booking-times span");
if ((await bookingTimes.count()) !== 2) {
  throw new Error("The mobile booked day should show both lesson times.");
}
const bookedDay = accountPage.getByRole("button", { name: /2 lessons/ }).first();
await bookedDay.click();
const mobileCalendarTarget = accountPanel.locator("#upcoming-booking-INES-QA01");
await mobileCalendarTarget.waitFor({ state: "visible" });
await accountPage.waitForFunction(() => document.activeElement?.id === "upcoming-booking-INES-QA01");
await waitForOrientation(accountPage);
const bookedDayOrientation = await mobileCalendarTarget.evaluate((target) => {
  const rectangle = target.getBoundingClientRect();
  return { top: rectangle.top, bottom: rectangle.bottom, viewportHeight: window.innerHeight };
});
if (bookedDayOrientation.top < 0 || bookedDayOrientation.bottom > bookedDayOrientation.viewportHeight) {
  throw new Error(`Choosing a booked date should guide a phone directly to its matching lesson: ${JSON.stringify(bookedDayOrientation)}.`);
}
const bookingTransitionSeen = await accountPage.evaluate(
  () => document.documentElement.dataset.qaBookingTransitionSeen === "true"
);
if (!bookingTransitionSeen) {
  throw new Error("Booking decisions should use the short local surface transition.");
}
const compactCalendarWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (compactCalendarWeekCount !== 4) {
  throw new Error(`Selecting a booked day should keep the aesthetic four-week overview; found ${compactCalendarWeekCount}.`);
}
if (await accountPage.locator("#lesson-calendar .unified-calendar__panel").count()) {
  throw new Error("The lesson-view calendar should not add a second selected-day box on mobile.");
}
await mobileCalendarTarget.click();
const mobileManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
const mobileManageDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
await mobileManageDialog.waitFor({ state: "visible" });
await mobileManageDialog.locator(".lesson-calendar__status").waitFor();
await waitForOrientation(accountPage);
const mobileManagedPlacement = await accountPage.evaluate(() => {
  const dialog = document.querySelector(".lesson-manage-dialog")?.getBoundingClientRect();
  return {
    dialogLeft: dialog?.left ?? -Infinity,
    dialogRight: dialog?.right ?? Infinity,
    dialogTop: dialog?.top ?? -Infinity,
    dialogBottom: dialog?.bottom ?? Infinity,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
});
if (
  mobileManagedPlacement.dialogLeft < 8 ||
  mobileManagedPlacement.dialogRight > mobileManagedPlacement.viewportWidth - 8 ||
  mobileManagedPlacement.dialogTop < 0 ||
  mobileManagedPlacement.dialogBottom > mobileManagedPlacement.viewportHeight + 1
) {
  throw new Error(`Mobile lesson management should remain a contained overlay: ${JSON.stringify(mobileManagedPlacement)}.`);
}
const mobileManageControls = await mobileManageDialog.evaluate((dialog) => {
  const bounds = [...dialog.querySelectorAll(".lesson-manage-dialog__actions .button")].map((button) => {
    const rectangle = button.getBoundingClientRect();
    return { left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height };
  });
  const rectangle = dialog.getBoundingClientRect();
  return { bounds, panelLeft: rectangle.left, panelRight: rectangle.right, panelWidth: rectangle.width };
});
if (
  mobileManageControls.bounds.length !== 2 ||
  Math.abs(mobileManageControls.bounds[0].height - mobileManageControls.bounds[1].height) > 2 ||
  mobileManageControls.bounds.some((button) => button.width >= mobileManageControls.panelWidth * 0.75) ||
  mobileManageControls.bounds[0].left < mobileManageControls.panelLeft - 1 ||
  mobileManageControls.panelRight - mobileManageControls.bounds.at(-1).right > 40
) {
  throw new Error(
    `Mobile lesson actions should stay compact and right-aligned: ${JSON.stringify(mobileManageControls)}.`
  );
}
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-mobile.png"), fullPage: true });
await mobileManageDialog.getByRole("button", { name: "Cancel", exact: true }).click();
await accountPage.getByRole("dialog", { name: "Cancel this lesson?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Keep lesson", exact: true }).click();
await mobileManageDialog.getByRole("button", { name: "Change", exact: true }).evaluate((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.qaMobileChangeScrollBefore = String(window.scrollY);
  }, { capture: true, once: true });
});
await mobileManageDialog.getByRole("button", { name: "Change", exact: true }).click();
const mobileChangeDialog = accountPage.getByRole("dialog", { name: "Choose a new date and time", exact: true });
await mobileChangeDialog.waitFor({ state: "visible" });
await mobileManagePanel.getByRole("heading", { name: "Choose a new date and time", exact: true }).waitFor();
await mobileManagePanel.getByRole("radio", { name: "60 minutes", exact: true }).waitFor();
await mobileManagePanel.getByRole("radio", { name: "90 minutes", exact: true }).waitFor();
await waitForOrientation(accountPage);
const mobileChangeLayout = await accountPage.evaluate(() => {
  const workspace = document.querySelector("#lesson-calendar")?.getBoundingClientRect();
  return {
    overlay: Boolean(document.querySelector(".lesson-manage-overlay--reschedule")),
    position: document.querySelector("#lesson-calendar") ? getComputedStyle(document.querySelector("#lesson-calendar")).position : "",
    scrollBefore: Number(document.documentElement.dataset.qaMobileChangeScrollBefore),
    scrollY: window.scrollY,
    left: workspace?.left ?? -Infinity,
    right: workspace?.right ?? Infinity,
    top: workspace?.top ?? -Infinity,
    bottom: workspace?.bottom ?? Infinity,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
});
if (
  !mobileChangeLayout.overlay ||
  mobileChangeLayout.position !== "fixed" ||
  Math.abs(mobileChangeLayout.scrollY - mobileChangeLayout.scrollBefore) > 1 ||
  mobileChangeLayout.left < 8 ||
  mobileChangeLayout.right > mobileChangeLayout.viewportWidth - 8 ||
  mobileChangeLayout.top < 8 ||
  mobileChangeLayout.bottom > mobileChangeLayout.viewportHeight - 8
) {
  throw new Error(`Mobile lesson changing should remain above the dimmed page: ${JSON.stringify(mobileChangeLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-change-workflow-mobile.png"), fullPage: false });
await mobileManagePanel.getByRole("button", { name: "Back", exact: true }).click();
await mobileManageDialog.waitFor({ state: "visible" });
await mobileManageDialog.getByRole("button", { name: "Close lesson management", exact: true }).click();
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
if (await accountPage.locator("#lesson-calendar .unified-calendar__panel").count()) {
  throw new Error("Closing lesson management should return to the visual calendar without a selected-day panel.");
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-overview-mobile.png"), fullPage: true });
const restoredCalendarWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (restoredCalendarWeekCount !== defaultCalendarWeekCount) {
  throw new Error(
    `Returning from lesson management changed the four-week calendar to ${restoredCalendarWeekCount} rows.`
  );
}

await accountPanel.getByRole("button", { name: "Book a lesson", exact: true }).click();
await accountPage.getByRole("heading", { name: "How would you like to book?", exact: true }).waitFor();
await accountPage.screenshot({ path: path.join(outDir, "booking-pattern-mobile.png"), fullPage: true });
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("The calendar should wait until the booking pattern and lesson length have been chosen.");
}
if (await accountPage.getByRole("button", { name: /Trial lesson/ }).count()) {
  throw new Error("A student with any non-cancelled booking should not be offered the trial.");
}
if (await accountPage.getByText(/The trial is for a first lesson/i).count()) {
  throw new Error("Trial ineligibility should restore the valid choices without a warning banner.");
}
const lessonCardCount = await accountPage.locator(".unified-booking__lesson-picker .lesson-card").count();
if (lessonCardCount !== 2) throw new Error(`Expected one-off and recurring choices; found ${lessonCardCount}.`);
await accountPage.getByRole("button", { name: "Recurring lessons · keep the same weekly time", exact: true }).click();
await accountPage.getByRole("heading", { name: "Choose your lesson", exact: true }).waitFor();
if ((await accountPage.locator(".booking-setup .segmented").count()) !== 0) {
  throw new Error("Initial booking choices should use cards, not the compact change-booking slider.");
}
if ((await accountPage.locator(".booking-option-card").count()) !== 7) {
  throw new Error("Recurring booking should keep location, lesson length, and 4/6/8-week choices on one screen.");
}
await accountPage.getByRole("radio", { name: "In Porto", exact: true }).check();
if ((await accountPage.locator("input[name='booking-repeat']").count()) !== 3) {
  throw new Error("Recurring booking should offer 4, 6, or 8 weeks.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-repeat-length-mobile.png"), fullPage: true });
await accountPage.getByRole("button", { name: "Back", exact: true }).click();
await accountPage.getByRole("heading", { name: "How would you like to book?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "One lesson · choose 60 or 90 minutes", exact: true }).click();
await accountPage.getByRole("heading", { name: "Choose your lesson", exact: true }).waitFor();
await accountPage.getByRole("radio", { name: "Online", exact: true }).check();
if ((await accountPage.locator(".booking-option-card input[name='booking-duration']").count()) !== 2) {
  throw new Error("One-off booking should offer 60 and 90 minutes as visible cards.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-duration-mobile.png"), fullPage: true });
await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).check();
await accountPage.getByRole("button", { name: "Choose a date", exact: true }).click();
const lessonSummary = accountPage.locator(".booking-choice-summary");
await lessonSummary.waitFor({ state: "visible" });
if (await accountPage.locator(".unified-booking__lesson-picker .lesson-card").count()) {
  throw new Error("Choosing a lesson type should collapse the large lesson cards.");
}
const changeLesson = accountPage.getByRole("button", { name: "Change choices", exact: true });
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
  throw new Error(`Change choices should stay aligned on the right: ${JSON.stringify(lessonSummaryLayout)}.`);
}
await changeLesson.click();
await accountPage.getByRole("button", { name: "One lesson · choose 60 or 90 minutes", exact: true }).click();
await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).waitFor();
await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).check();
await accountPage.getByRole("button", { name: "Choose a date", exact: true }).click();
await lessonSummary.waitFor({ state: "visible" });
const freeDay = accountPage.getByRole("button", { name: /5 times free/ }).first();
await freeDay.waitFor({ state: "visible" });
await freeDay.click();
const showAllEightWeeks = accountPage.getByRole("button", { name: "Show all", exact: true });
await showAllEightWeeks.waitFor({ state: "visible" });
await waitForOrientation(accountPage);
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
if (availableTimeCount !== 5) {
  throw new Error(`The free-day details should appear below the compact calendar; found ${availableTimeCount} times.`);
}
const compactTimeGrid = await accountPage
  .locator("#lesson-calendar .unified-calendar__availability .slot-grid")
  .evaluate((grid) => {
    const buttons = [...grid.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
    return {
      buttonHeight: buttons[0]?.height ?? 0,
      firstRowTops: buttons.slice(0, 3).map((button) => button.top),
      fourthTop: buttons[3]?.top ?? 0,
      headingCount: grid.parentElement?.querySelectorAll("h3, h4").length ?? -1
    };
  });
if (
  compactTimeGrid.headingCount !== 0 ||
  compactTimeGrid.buttonHeight < 44 ||
  compactTimeGrid.buttonHeight > 54 ||
  compactTimeGrid.firstRowTops.some((top) => Math.abs(top - compactTimeGrid.firstRowTops[0]) > 1) ||
  compactTimeGrid.fourthTop <= compactTimeGrid.firstRowTops[0] + 1
) {
  throw new Error(`Available times should use a compact, three-across mobile grid: ${JSON.stringify(compactTimeGrid)}.`);
}
if (
  (await accountPage.getByText("No lesson booked on this day.", { exact: true }).count()) ||
  (await accountPage.getByText(/Free for a single lesson/i).count())
) {
  throw new Error("A free day should go straight to its available times without redundant booking-status copy.");
}
const nextStepOrientation = await accountPage.evaluate(() => {
  const panel = document.querySelector("#booking-next-step")?.getBoundingClientRect();
  return { top: panel?.top ?? Infinity, bottom: panel?.bottom ?? -Infinity, viewportHeight: window.innerHeight };
});
if (
  nextStepOrientation.top < 0 ||
  nextStepOrientation.top > nextStepOrientation.viewportHeight * 0.35 ||
  nextStepOrientation.bottom <= 0
) {
  throw new Error(`Choosing a day should guide a phone directly to the available times: ${JSON.stringify(nextStepOrientation)}.`);
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-free-day-mobile.png"), fullPage: true });

await accountPage
  .locator("#lesson-calendar .unified-calendar__availability .slot-grid button")
  .first()
  .click();
const confirmHeading = accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true });
await confirmHeading.waitFor({ state: "visible" });
await accountPage.waitForFunction(
  () => {
    const heading = document.querySelector("#booking-step-heading")?.getBoundingClientRect();
    return Boolean(heading && heading.top < window.innerHeight && heading.bottom > 0);
  },
  null,
  { timeout: 2_000 }
);
const confirmOrientation = await confirmHeading.evaluate((heading) => {
  const rectangle = heading.getBoundingClientRect();
  return { top: rectangle.top, bottom: rectangle.bottom, viewportHeight: window.innerHeight };
});
await accountMenuButton.waitFor({ state: "visible" });
await accountMenuButton.click();
const confirmationAccountMenu = accountPanel.locator("#account-menu");
await confirmationAccountMenu.getByRole("button", { name: /Past lessons/ }).waitFor();
await accountMenuButton.click();
await confirmationAccountMenu.waitFor({ state: "detached" });
for (const duplicateIdentity of ["Signed in as", "Booking as", "Not you?"]) {
  if (await accountPage.getByText(duplicateIdentity, { exact: false }).count()) {
    throw new Error(`Confirmation still repeats the account identity as “${duplicateIdentity}”.`);
  }
}
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("Choosing a time should collapse the calendar before the confirmation step.");
}
if (await accountPage.locator(".unified-booking__lesson-picker").count()) {
  throw new Error("Choosing a time should collapse the earlier lesson choice before confirmation.");
}
if (confirmOrientation.top >= confirmOrientation.viewportHeight || confirmOrientation.bottom <= 0) {
  throw new Error("Choosing a time did not bring the confirmation step into the mobile viewport.");
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-confirm-mobile.png"), fullPage: true });
const recapTitle = (await accountPage.locator(".booking-recap h3").innerText()).trim();
if (/single lesson/i.test(recapTitle) || !recapTitle.includes("2026")) {
  throw new Error(`The confirmation card should lead with the chosen date and time, not “Single lesson”: ${recapTitle}.`);
}

if (await accountPage.locator(".booking-location-choice").count()) {
  throw new Error("Confirmation should not repeat the location selector beneath the recap.");
}
await accountPage.getByRole("button", { name: "Change details", exact: true }).click();
await accountPage.getByRole("heading", { name: "Choose your lesson", exact: true }).waitFor();
if (!(await accountPage.getByRole("radio", { name: "Online", exact: true }).isChecked())) {
  throw new Error("Change details should retain the current location choice.");
}
if (!(await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).isChecked())) {
  throw new Error("Change details should retain the current lesson length.");
}
await accountPage.getByRole("button", { name: "Choose a date", exact: true }).click();
await lessonSummary.waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count()) !== 8) {
  throw new Error("Returning from Change details should show the full date calendar.");
}

await changeLesson.click();
await accountPage.getByRole("heading", { name: "How would you like to book?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Back", exact: true }).click();
await bookQaLessonAndReturnToUpcoming({ recurring: false });
await bookQaLessonAndReturnToUpcoming({ recurring: true });
await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPage.locator("#lesson-calendar").waitFor({ state: "visible" });
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
const recurringLaterLesson = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group--series");
await recurringLaterLesson.getByRole("button", { name: "Manage recurrence", exact: true }).click();
const sequenceDialog = accountPage.locator(".lesson-manage-dialog");
await sequenceDialog.getByRole("heading", { name: "Manage recurring lesson", exact: true }).waitFor();
if (await sequenceDialog.getByText(/Choose whether to keep/i).count()) {
  throw new Error("The recurrence actions should not repeat what their button labels already explain.");
}
const moveRecurrence = sequenceDialog.getByRole("button", { name: "Move recurrence", exact: true });
const stopRepeating = sequenceDialog.getByRole("button", { name: "Stop repeating", exact: true });
const cancelAllBooked = sequenceDialog.getByRole("button", { name: "Cancel all booked lessons", exact: true });
await cancelAllBooked.waitFor();
await moveRecurrence.click();
const moveRecurrenceDialog = accountPage.getByRole("dialog", { name: "Choose a new weekly day and time", exact: true });
await moveRecurrenceDialog.waitFor({ state: "visible" });
if ((await moveRecurrenceDialog.locator(".segmented").count()) !== 2) {
  throw new Error("Moving a recurrence should retain the compact length and location sliders.");
}
await moveRecurrenceDialog.getByText(/Currently repeats from/i).waitFor();
await moveRecurrenceDialog.getByRole("button", { name: "Back", exact: true }).click();
await sequenceDialog.getByRole("heading", { name: "Manage recurring lesson", exact: true }).waitFor();
await stopRepeating.click();
if (stopRepeatPayloads.length !== 0) throw new Error("Opening the repeat confirmation called the stop endpoint.");
await sequenceDialog.getByText("Your booked lessons will stay.", { exact: false }).waitFor();
await sequenceDialog.getByRole("button", { name: "Keep repeating", exact: true }).click();
if (stopRepeatPayloads.length !== 0) throw new Error("Keeping the repeat called the stop endpoint.");

await stopRepeating.click();
await sequenceDialog.getByRole("button", { name: "Yes, stop repeating", exact: true }).click();
await sequenceDialog.getByText("This sequence has stopped. The lessons already booked stay in your calendar.", { exact: true }).waitFor();
if (stopRepeatPayloads.length !== 1 || stopRepeatPayloads[0].cancelRemaining !== false) {
  throw new Error(`Expected one confirmed stop-and-keep request; received ${JSON.stringify(stopRepeatPayloads)}.`);
}
await sequenceDialog.getByRole("button", { name: "Done", exact: true }).click();
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
await accountPage.waitForFunction(
  () =>
    document.querySelectorAll("#account-upcoming-lessons .upcoming-lesson-group--series").length === 0 &&
    document.querySelectorAll("#account-upcoming-lessons .upcoming-lesson-group--single").length === 12,
  null,
  { timeout: 10_000 }
);
if ((await accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group--series").count()) !== 0) {
  throw new Error("A stopped sequence should no longer appear as a recurring group.");
}
if ((await accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group--single").count()) !== 12) {
  throw new Error("Every retained date from a stopped sequence should return as an individual upcoming lesson.");
}
if (await accountPanel.getByText(/Booked sequence|Sequence ended/i).count()) {
  throw new Error("Stopped repeats should not leave a grouped sequence label behind.");
}

// Restore the synthetic active series so the separate bulk-cancellation path
// can still be exercised without creating a second mock student.
repeatStopped = false;
stopRepeatPayloads.length = 0;
await accountPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
await accountPanel.waitFor({ state: "visible" });
await accountPage.getByRole("button", { name: /View your lessons/ }).click();
await accountPanel.locator("#account-upcoming-lessons").waitFor({ state: "visible" });
const restoredRecurringLesson = accountPanel.locator("#account-upcoming-lessons .upcoming-lesson-group--series");
await restoredRecurringLesson.getByRole("button", { name: "Manage recurrence", exact: true }).click();
await sequenceDialog.getByRole("heading", { name: "Manage recurring lesson", exact: true }).waitFor();
const restoredCancelAllBooked = sequenceDialog.getByRole("button", { name: "Cancel all booked lessons", exact: true });

await restoredCancelAllBooked.click();
if (stopRepeatPayloads.length !== 0) throw new Error("Opening the bulk cancellation confirmation called the stop endpoint.");
await sequenceDialog.getByText("Any paid lesson that can still be cancelled is refunded automatically.", { exact: false }).waitFor();
await waitForOrientation(accountPage);
await accountPage.screenshot({
  path: path.join(outDir, "booking-sequence-cancel-confirm-mobile.png"),
  fullPage: true
});
const sequenceConfirmationLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  panelWidth: document.querySelector(".lesson-manage-dialog")?.getBoundingClientRect().width ?? 0,
  contentWidth: document.querySelector(".lesson-manage-dialog")?.scrollWidth ?? Infinity
}));
if (
  sequenceConfirmationLayout.scrollWidth > sequenceConfirmationLayout.clientWidth + 1 ||
  sequenceConfirmationLayout.contentWidth > sequenceConfirmationLayout.panelWidth + 1
) {
  throw new Error(`Recurring sequence cancellation should not clip or overflow: ${JSON.stringify(sequenceConfirmationLayout)}.`);
}
await sequenceDialog.getByRole("button", { name: "Keep booked lessons", exact: true }).click();
if (stopRepeatPayloads.length !== 0) throw new Error("Keeping booked lessons called the stop endpoint.");
await restoredCancelAllBooked.click();
await sequenceDialog.getByRole("button", { name: "Yes, cancel all", exact: true }).click();
await restoredCancelAllBooked.waitFor({ state: "hidden" });
if (stopRepeatPayloads.length !== 1 || stopRepeatPayloads[0].cancelRemaining !== true) {
  throw new Error(`Expected one confirmed bulk cancellation request; received ${JSON.stringify(stopRepeatPayloads)}.`);
}
await sequenceDialog.getByText("4 lessons were cancelled.", { exact: false }).waitFor();
await sequenceDialog.getByRole("button", { name: "Done", exact: true }).click();

await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Sign out", exact: true }).click();
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
        calendarRange: {
          defaultWeekCount: defaultCalendarWeekCount,
          overviewWeekCountAfterSelection: compactCalendarWeekCount,
          guidedLessonPlacement: bookedDayOrientation,
          freeCompactWeekCount,
          availableTimeCount
        },
        stopRepeatCalls: stopRepeatPayloads.length,
        stopRepeatPayloads,
        accountRequestMethods,
        signedOut: true
      },
      mobileNavigation,
      reducedRouteMotion,
      localBookingMotion,
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
    () =>
      !document.documentElement.classList.contains("booking-transitioning"),
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

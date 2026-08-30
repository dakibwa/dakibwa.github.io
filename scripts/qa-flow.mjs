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
  assertIncludes(bookingText, "your lesson calendar", "unified booking heading");
  assertIncludes(bookingText, "what would you like to book?", "lesson choice heading");
  assertIncludes(bookingText, "porto time", "booking timezone note");
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

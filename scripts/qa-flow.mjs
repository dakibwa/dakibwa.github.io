import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "tmp/qa");
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const expectedBookingMode = normalizeBookingMode(process.env.NEXT_PUBLIC_BOOKING_MODE ?? "");
const expectCustomBooking = expectedBookingMode === "custom-square";
const routes = [
  { id: "home", path: "/", heading: "Português" },
  { id: "approach", path: "/approach", heading: "A calm," },
  { id: "lessons", path: "/lessons", heading: "Private lessons" },
  { id: "faq", path: "/faq", heading: "Questions" },
  { id: "booking", path: "/book", heading: "Book your" }
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
const customBookingConfigured = (await page.locator(".custom-booking-calendar").count()) > 0;
const bookingEmbedConfigured = (await page.locator(".booking-embed-frame iframe").count()) > 0;
const directBookingHref = await page.locator(".booking-provider__direct").getAttribute("href").catch(() => null);
const bookingText = await page.locator(".booking-composition").innerText();

assertIncludes(bookingText.toLowerCase(), "live availability", "booking live-availability label");
assertIncludes(bookingText.toLowerCase(), "square", "booking provider");

if (!directBookingHref?.includes("book.squareup.com")) {
  throw new Error("The public Square fallback link is missing or invalid.");
}

if (expectCustomBooking && !customBookingConfigured) {
  throw new Error("Expected the custom Square booking calendar in custom-square mode.");
}

if (!expectCustomBooking && !bookingEmbedConfigured) {
  throw new Error("Expected the hosted booking embed in square-hosted mode.");
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
      bookingEmbedConfigured,
      customBookingConfigured,
      directBookingHref,
      externalResourceWarnings: logs.filter((entry) => entry.includes("Failed to load resource")),
      screenshots: outDir
    },
    null,
    2
  )
);

function normalizeBookingMode(value) {
  if (value === "auto" || value === "custom-square") return value;
  return "square-hosted";
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`Missing ${label}: ${expected}`);
  }
}

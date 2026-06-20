import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "tmp/qa");
const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
const expectedBookingMode = normalizeBookingMode(process.env.NEXT_PUBLIC_BOOKING_MODE ?? "");
const expectCustomBooking = expectedBookingMode === "custom-square";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 864, height: 1200 } });
const logs = [];

page.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});

await page.goto(base, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(outDir, "landing-desktop.png"), fullPage: true });
const heroText = await page.locator("h1").first().textContent();
const homeNavText = await page.locator(".site-header").innerText();

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(base, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(outDir, "landing-mobile.png"), fullPage: true });

await page.setViewportSize({ width: 864, height: 950 });
await page.goto(`${base}/faq`, { waitUntil: "networkidle" });
await page.waitForSelector(".faq-content-shell", { timeout: 10_000 });
await page.screenshot({ path: path.join(outDir, "faq-desktop.png"), fullPage: true });
const faqHeading = await page.locator("h1").first().textContent();
const faqText = await page.locator(".faq-content-shell").innerText();

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${base}/faq`, { waitUntil: "networkidle" });
await page.waitForSelector(".faq-content-shell", { timeout: 10_000 });
await page.screenshot({ path: path.join(outDir, "faq-mobile.png"), fullPage: true });

await page.setViewportSize({ width: 864, height: 650 });
await page.goto(`${base}/book`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".booking-calendar-panel", { timeout: 10_000 });
await page.waitForSelector(".custom-booking-calendar, .booking-embed-frame iframe, .booking-placeholder", { timeout: 10_000 });
if ((await page.locator(".custom-booking-calendar").count()) > 0) {
  const firstSlot = page.locator(".slot-grid button").first();
  if ((await firstSlot.count()) > 0) {
    await firstSlot.click();
    await page.waitForSelector(".slot-grid button.is-selected", { timeout: 5_000 });
  }
}
await page.waitForTimeout(2_000);
await page.screenshot({ path: path.join(outDir, "booking-desktop.png"), fullPage: true });
const bookingHeading = await page.locator("h1").first().textContent();
const bookingEmbedConfigured = (await page.locator(".booking-embed-frame").count()) > 0;
const customBookingConfigured = (await page.locator(".custom-booking-calendar").count()) > 0;
const bookingText = await page.locator(".booking-shell").innerText();

if (expectCustomBooking && !customBookingConfigured) {
  throw new Error("Expected the custom Square booking calendar in custom-square mode.");
}

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${base}/book`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".booking-calendar-panel", { timeout: 10_000 });
await page.waitForSelector(".custom-booking-calendar, .booking-embed-frame iframe, .booking-placeholder", { timeout: 10_000 });
if (expectCustomBooking && (await page.locator(".custom-booking-calendar").count()) === 0) {
  throw new Error("Expected the custom Square booking calendar on mobile in custom-square mode.");
}
await page.waitForTimeout(2_000);
await page.screenshot({ path: path.join(outDir, "booking-mobile.png"), fullPage: true });

await browser.close();

console.log(
  JSON.stringify(
    {
      heroText,
      homeNavText,
      faqHeading,
      faqText: faqText.slice(0, 180),
      bookingHeading,
      bookingEmbedConfigured,
      customBookingConfigured,
      bookingText: bookingText.slice(0, 180),
      logs,
      screenshots: outDir
    },
    null,
    2
  )
);

function normalizeBookingMode(value) {
  if (value === "auto" || value === "square-hosted") return value;
  return "custom-square";
}

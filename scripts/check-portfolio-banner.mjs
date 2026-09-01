import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const outDir = fileURLToPath(new URL("../out", import.meta.url));
const failures = [];

const check = (condition, message) => {
  process.stdout.write(`  ${condition ? "ok" : "FAIL"} ${message}\n`);
  if (!condition) failures.push(message);
};

const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const candidates = [
    join(outDir, pathname),
    join(outDir, pathname, "index.html"),
    join(outDir, `${pathname.replace(/\/$/, "")}.html`)
  ];

  for (const file of candidates) {
    if (!existsSync(file) || file.endsWith("/") || file.endsWith("out")) continue;
    try {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mime[extname(file)] ?? "application/octet-stream"
      });
      response.end(readFileSync(file));
      return;
    } catch {
      /* A directory candidate is not a file; try the next static-export form. */
    }
  }

  response.writeHead(404);
  response.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const state = () => page.evaluate(() => {
  const rect = (selector) => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return {
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
      top: box.top,
      width: box.width
    };
  };

  return {
    backHref: document.querySelector(".akibwa-project-banner__back")?.href,
    backText: document.querySelector(".akibwa-project-banner__back")?.textContent.trim(),
    banner: rect(".akibwa-project-banner"),
    bannerDisplay: getComputedStyle(document.querySelector(".akibwa-project-banner")).display,
    flag: document.documentElement.getAttribute("data-akibwa-project"),
    identity: document.querySelector(".akibwa-project-banner__identity")?.textContent.trim(),
    lede: document.querySelector(".akibwa-project-banner__lede")?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    siteHeader: rect(".site-header")
  };
});

try {
  process.stdout.write("\n■ standalone site\n");
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-header");
  let current = await state();
  check(current.bannerDisplay === "none", "a direct visit does not show the Akibwa masthead");
  check(current.siteHeader.top === 0, "the Portuguese header retains its normal top edge");

  process.stdout.write("\n■ portfolio entry\n");
  await page.goto(`${origin}/?from=akibwa`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('html[data-akibwa-project="true"] .akibwa-project-banner');
  current = await state();
  check(current.flag === "true", "the Akibwa entry flag activates before the page settles");
  check(current.identity === "I’m Daniel", `the masthead identity is concise [${current.identity}]`);
  check(current.lede === "Building in the age of AI.", "the masthead keeps the portfolio proposition");
  check(current.backText === "Back to projects", "the return action uses plain text");
  check(
    current.backHref === "https://akibwa.com/#projects",
    `the return action targets Akibwa's Projects section [${current.backHref}]`
  );
  check(
    Math.abs(current.banner.bottom - current.siteHeader.top) <= 1,
    "the real Portuguese site begins immediately below the green boundary"
  );
  check(current.overflow <= 1, `the desktop entry has no horizontal overflow [${current.overflow}px]`);

  process.stdout.write("\n■ internal navigation\n");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Lessons", exact: true })
    .click();
  await page.waitForURL(`${origin}/lessons/`);
  current = await state();
  check(current.bannerDisplay === "block", "the masthead persists through Portuguese navigation");
  check(current.siteHeader.top === current.banner.bottom, "the destination still begins below the masthead");

  await page.evaluate(() => {
    document.querySelector(".akibwa-project-banner__back").addEventListener(
      "click",
      (event) => event.preventDefault(),
      { once: true }
    );
  });
  await page.locator(".akibwa-project-banner__back").click();
  const stored = await page.evaluate(() => sessionStorage.getItem("akibwa-project-view"));
  check(stored === null, "the explicit return clears the tab's portfolio state");

  process.stdout.write("\n■ phone composition\n");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?from=akibwa`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('html[data-akibwa-project="true"] .akibwa-project-banner');
  current = await state();
  check(current.banner.height <= 88, `the phone masthead stays compact [${current.banner.height.toFixed(1)}px]`);
  check(current.siteHeader.top === current.banner.bottom, "the phone site starts below the green boundary");
  check(current.overflow <= 1, `the phone entry has no horizontal overflow [${current.overflow}px]`);

  if (process.env.PORTFOLIO_SCREENSHOT) {
    await page.screenshot({ path: process.env.PORTFOLIO_SCREENSHOT, fullPage: false });
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} portfolio banner check(s) failed.`);
  process.exit(1);
}

console.log("\nPortuguese portfolio banner checks passed.");

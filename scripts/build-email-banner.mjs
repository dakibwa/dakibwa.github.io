/**
 * Renders the banner used at the top of every transactional email.
 *
 * A PNG, not the site's own assets referenced directly: the wordmark ships as
 * an alpha-only WebP applied as a CSS mask, which no email client will do, and
 * the splats are SVG, which several still refuse. Flattening both to one PNG at
 * 2x is the only version that renders the same in Gmail, Apple Mail and Outlook.
 *
 * Re-run with `npm run build:email-banner` after any change to the wordmark or
 * the brand colours. The output is committed, because the emails reference it
 * by absolute URL from the live site.
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const WIDTH = 560;
const HEIGHT = 132;

const asDataUri = (file, mime) =>
  `data:${mime};base64,${readFileSync(path.join(root, "public", file)).toString("base64")}`;

const wordmark = asDataUri("visuals/wordmark-cream.webp", "image/webp");
const splat = asDataUri("visuals/v2-splats/built-around-you-splat-v2.svg", "image/svg+xml");

const html = `<!doctype html><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  .banner {
    position: relative;
    display: flex;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    align-items: center;
    background: #203e82;
    padding-left: 34px;
  }
  /* The wordmark carries no colour of its own — it is an alpha mask, exactly as
     the site uses it, so it stays a true cream rather than an approximation. */
  .wordmark {
    width: 232px;
    height: 74px;
    background: #f5ecd9;
    -webkit-mask: url("${wordmark}") no-repeat center / contain;
    mask: url("${wordmark}") no-repeat center / contain;
  }
  .splat {
    position: absolute;
    top: -34px;
    right: -26px;
    width: 190px;
    height: 190px;
    opacity: 0.9;
  }
</style>
<div class="banner">
  <div class="wordmark"></div>
  <img class="splat" src="${splat}" alt="">
</div>`;

const browser = await chromium.launch({ headless: true });
// deviceScaleFactor 2 so the banner stays sharp on the retina screens most
// email is now read on; the email renders it at its CSS width of 560.
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(root, "public/email/banner.png"), omitBackground: false });
await browser.close();

console.log(`public/email/banner.png written at ${WIDTH * 2}x${HEIGHT * 2}`);

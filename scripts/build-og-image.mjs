/**
 * Renders the Open Graph / social-share card served at /og.png.
 *
 * This is the brand's first impression *off* the site: the preview that appears
 * when Inês's link is shared on WhatsApp, Instagram or messaged around, which is
 * how a one-to-one teacher actually finds students. It reuses the site's own
 * hero rhythm — lavender eyebrow, cream wordmark, coral rule, tagline — over the
 * deep-blue ground, with the home-page radiant burst bleeding off the right.
 *
 * Like the email banner, the wordmark is drawn as a cream fill behind its own
 * alpha mask rather than referenced as a raw asset, so the cream is exactly
 * --paper (#f5ecd9) and not an approximation from the WebP. The burst carries
 * its own transparency, so it composites straight onto the gradient.
 *
 * Rendered at 2x and downsampled to the canonical 1200x630 with sharp, which
 * keeps the script face and the type crisp. Re-run with `npm run build:og-image`
 * after any change to the wordmark, the tagline or the brand colours. The output
 * is committed, because social scrapers fetch it by absolute URL from the live
 * site (see `metadataBase` in src/app/layout.tsx).
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const WIDTH = 1200;
const HEIGHT = 630;

const asDataUri = (file, mime) =>
  `data:${mime};base64,${readFileSync(path.join(root, "public", file)).toString("base64")}`;

const wordmark = asDataUri("visuals/wordmark-cream.webp", "image/webp");
const burst = asDataUri("visuals/generated-splats/business-card-splat-generated-v2.webp", "image/webp");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  .card {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    /* --blue lifting to --blue-deep, the same blue-on-blue as the hero band. */
    background: radial-gradient(120% 130% at 22% 28%, #2c54aa 0%, #244690 46%, #1d3b7c 100%);
    font-family: "Montserrat", system-ui, sans-serif;
  }
  /*
   * The site's own hero composition: the burst lives in its own deep panel on
   * the right, bleeding off the top, right and bottom of the card, and the
   * panel's hard left edge keeps every streak away from the words. Overlaying
   * the burst directly on the card put streak tips under "Inês" and "lessons".
   */
  .art {
    position: absolute;
    top: 0;
    right: 0;
    width: 470px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #203e82; /* --blue-deep, as the home hero's art panel */
  }
  .burst {
    position: absolute;
    top: -45px;
    left: -383px;
    width: 1085px;
    height: auto;
    opacity: 0.96;
  }
  .content {
    position: absolute;
    left: 84px;
    top: 0;
    height: ${HEIGHT}px;
    width: 660px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 30px;
  }
  .eyebrow {
    font-weight: 700;
    font-size: 22px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #dcd8f5; /* --lavender-soft */
  }
  /* Cream fill behind the wordmark's alpha mask — exact --paper, as the site. */
  .wordmark {
    width: 560px;
    height: ${Math.round((560 * 236) / 760)}px;
    background: #f5ecd9;
    -webkit-mask: url("${wordmark}") no-repeat center / contain;
    mask: url("${wordmark}") no-repeat center / contain;
  }
  .rule {
    width: 132px;
    height: 7px;
    background: #ef5d3c; /* --coral */
    border-radius: 9px 4px 8px 5px / 5px 8px 4px 7px; /* the brand squiggle */
  }
  .tagline {
    font-weight: 600;
    font-size: 39px;
    line-height: 1.24;
    color: #f5ecd9;
    max-width: 600px;
  }
  .tagline b { color: #fbf4e5; } /* --paper-light */
</style></head>
<body>
  <div class="card">
    <div class="art"><img class="burst" src="${burst}" alt=""></div>
    <div class="content">
      <div class="eyebrow">One&nbsp;to&nbsp;one&nbsp;&middot;&nbsp;Any&nbsp;level</div>
      <div class="wordmark" role="img" aria-label="Português com a Inês"></div>
      <div class="rule"></div>
      <div class="tagline">European Portuguese lessons<br>in&nbsp;Porto. <b>Or online,<br>wherever&nbsp;you&nbsp;are.</b></div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
// deviceScaleFactor 2, then downsample: crisp type at the canonical 1200x630.
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();

await sharp(buffer)
  .resize(WIDTH, HEIGHT, { fit: "fill", kernel: "lanczos3" })
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(path.join(root, "public/og.png"));

console.log(`public/og.png written at ${WIDTH}x${HEIGHT}`);

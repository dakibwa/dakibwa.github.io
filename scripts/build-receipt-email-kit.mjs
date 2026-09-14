import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { renderEmail } from "../workers/booking/email.mjs";

const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Supply an absolute output directory.");
await mkdir(output, { recursive: true });

const fields = ["first_name", "document_label", "document_number", "document_date", "total"];
const placeholders = Object.fromEntries(fields.map(field => [field, `{{${field}}}`]));
const example = {
  first_name: "Alex",
  document_label: "receipt",
  document_number: "EXAMPLE-ONLY",
  document_date: "14 September 2026",
  total: "€25.00",
};

function content(values, preview = false) {
  return {
    heading: `Your ${values.document_label}`,
    preheader: `Your Portuguese lesson ${values.document_label} is attached.`,
    intro: `Olá ${values.first_name},\nYour Portuguese lesson ${values.document_label} is attached.`,
    rows: [
      { label: "Document", value: values.document_number },
      { label: "Issued", value: values.document_date },
      { label: "Total", value: values.total },
    ],
    callout: preview ? "Design example only — fictional details. The automation will attach the customer's official PDF." : "",
    action: null,
    footer: "Obrigada,\nInês",
  };
}

const template = renderEmail(content(placeholders));
const sample = renderEmail(content(example, true));
await writeFile(path.join(output, "receipt-template.html"), template.html);
await writeFile(path.join(output, "receipt-template.txt"), template.text);
await writeFile(path.join(output, "fields-example.json"), JSON.stringify(example, null, 2) + "\n");
await copyFile("public/email/banner.png", path.join(output, "banner.png"));
await copyFile("email/receipt-kit/README.md", path.join(output, "README.md"));
await writeFile(path.join(output, "example.html"), sample.html.replace("https://portuguesewithines.com/email/banner.png", "banner.png"));

// The previews use the exact email HTML and supplied PNG, with no live services.
const banner = await readFile("public/email/banner.png");
const preview = sample.html.replace("https://portuguesewithines.com/email/banner.png", `data:image/png;base64,${banner.toString("base64")}`);
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width] of [["desktop", 680], ["mobile", 375]]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent(preview, { waitUntil: "load" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: no horizontal overflow`);
    assert.equal(await page.locator("img").evaluate(img => img.complete && img.naturalWidth === 1120), true);
    await page.screenshot({ path: path.join(output, `example-${name}.png`), fullPage: true });
    await page.locator("img").evaluate(img => img.remove());
    assert.match(await page.locator("body").innerText(), /Your receipt/);
    assert.match(await page.locator("body").innerText(), /€25.00/);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Receipt email kit created and checked at ${output}`);

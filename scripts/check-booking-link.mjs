/**
 * Release gate for booking.
 *
 * Booking is served by the `ines-booking` Worker (workers/booking/). Publishing
 * a build whose booking API is missing or unhealthy would put a dead calendar in
 * front of students, so this fails loudly rather than warning.
 *
 * ALLOW_BOOKING_PREVIEW=1 permits a build with no API configured — the booking
 * page then renders its setup placeholder. That is for local design previews
 * only, and the deploy workflow does not set it.
 */

import { existsSync, readFileSync } from "node:fs";

loadDotEnv(".env.development.local");
loadDotEnv(".env.local");
loadDotEnv(".env");

const rawApiBaseUrl = process.env.NEXT_PUBLIC_BOOKING_API_BASE_URL ?? "";
const apiBaseUrl = normalizePublicHttpUrl(rawApiBaseUrl);
const allowPreview = process.env.ALLOW_BOOKING_PREVIEW === "1";
const expectedStripeMode = (process.env.NEXT_PUBLIC_STRIPE_EXPECTED_MODE ?? "").trim().toLowerCase();
const stripePublishableMode = keyMode(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

if (expectedStripeMode && !["test", "live"].includes(expectedStripeMode)) {
  console.error("NEXT_PUBLIC_STRIPE_EXPECTED_MODE must be either test or live.");
  process.exit(1);
}

if (rawApiBaseUrl.trim() && !apiBaseUrl) {
  console.error("NEXT_PUBLIC_BOOKING_API_BASE_URL is set but is not a valid http(s) URL.");
  process.exit(1);
}

if (!apiBaseUrl) {
  if (allowPreview) {
    console.log("No booking API configured; the booking page will show its setup placeholder.");
    process.exit(0);
  }

  console.error(
    "NEXT_PUBLIC_BOOKING_API_BASE_URL is required. Deploy workers/booking and set the variable to its URL, " +
      "or set ALLOW_BOOKING_PREVIEW=1 for a local preview build."
  );
  process.exit(1);
}

let response;
try {
  response = await fetch(`${apiBaseUrl}/health`, { redirect: "follow" });
} catch (error) {
  console.error(`Could not reach the booking API at ${apiBaseUrl}/health — ${error.message}`);
  process.exit(1);
}

const body = await response.json().catch(() => ({}));
const healthy = response.ok && body.ok === true;

console.log(
  JSON.stringify(
    {
      api: `${apiBaseUrl}/health`,
      status: response.status,
      ok: healthy,
      lessonTypes: body.lessonTypes ?? 0,
      emailMode: body.emailMode ?? "unknown",
      paymentMode: body.paymentMode ?? "unknown",
      stripe: body.stripe ?? "unknown",
      stripeReady: body.stripeReady ?? false,
      publishableKey: stripePublishableMode,
      missing: body.missing ?? []
    },
    null,
    2
  )
);

if (!healthy) {
  console.error(
    `The booking API is not healthy. Missing configuration: ${(body.missing ?? []).join(", ") || "unknown"}. ` +
      "Set the Worker's secrets and apply the schema before publishing."
  );
  process.exit(1);
}

if (!body.lessonTypes) {
  console.error("The booking API is up but has no active lesson types, so nothing can be booked. Apply seed.sql.");
  process.exit(1);
}

// A live site sending nothing is worse than an obvious outage: the student sees
// a confirmed booking and never receives the link they need to change it.
if (body.emailMode !== "live") {
  console.error(
    "The booking API is in dry-run email mode, so confirmations would not be sent. " +
      "Set RESEND_API_KEY and EMAIL_DRY_RUN=0 on the Worker before publishing."
  );
  process.exit(1);
}

// Payment activation is a two-deployable switch. The Worker is deployed first,
// then this build ships the matching publishable key and customer-facing copy.
// Refuse to publish a mixed test/live pair: Stripe otherwise fails only after a
// student has given us their details and tried to pay.
if (body.paymentMode === "prepay") {
  if (body.stripeReady !== true) {
    console.error("Prepayment is on but the Worker reports that Stripe is not ready.");
    process.exit(1);
  }
  if (expectedStripeMode && body.stripe !== expectedStripeMode) {
    console.error(`The Worker uses Stripe ${body.stripe}, but this site expects ${expectedStripeMode}.`);
    process.exit(1);
  }
  if (!stripePublishableMode || (expectedStripeMode && stripePublishableMode !== expectedStripeMode)) {
    console.error(
      `Prepayment is on but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is ${stripePublishableMode || "missing/invalid"}; ` +
        `the site expects ${expectedStripeMode || body.stripe}.`
    );
    process.exit(1);
  }
}

function normalizePublicHttpUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function keyMode(value) {
  const key = value.trim();
  if (/^pk_test_/.test(key)) return "test";
  if (/^pk_live_/.test(key)) return "live";
  return "";
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    process.env[key] ??= value;
  }
}

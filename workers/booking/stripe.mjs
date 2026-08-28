/**
 * Stripe: Checkout Sessions and webhook verification.
 *
 * Stripe is used rather than Square because Square does not onboard sellers in
 * Portugal, and because Stripe carries MB WAY and Multibanco natively — between
 * them the majority of Portuguese online payments.
 *
 * Only the REST API is used, no SDK: the official library is heavy for a Worker
 * and this needs two endpoints.
 */

const API = "https://api.stripe.com/v1";
const encoder = new TextEncoder();

/** Stripe's API is form-encoded, including nested keys like line_items[0][price_data][currency]. */
function formEncode(values, prefix = "") {
  const parts = [];

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;

    if (typeof value === "object") {
      parts.push(formEncode(value, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.filter(Boolean).join("&");
}

async function stripeRequest(env, path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formEncode(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}`);
  }
  return payload;
}

/**
 * A Checkout Session for one lesson.
 *
 * `client_reference_id` carries the booking id back on the webhook. It is the
 * opaque id only — never a name, email or NIF — because Stripe's own guidance
 * warns that payment links turn up in unexpected places.
 */
export function createCheckoutSession(env, { booking, lessonType, successUrl, cancelUrl, customerEmail }) {
  return stripeRequest(env, "/checkout/sessions", {
    mode: "payment",
    client_reference_id: booking.id,
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Stripe expires the session itself, which is the backstop for a student
    // who opens checkout and wanders off.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: lessonType.price_cents,
          product_data: {
            name: lessonType.name,
            description: `Portuguese lesson with Inês · ${lessonType.duration_minutes} minutes`
          }
        }
      }
    },
    metadata: { booking_reference: booking.reference, lesson_type: lessonType.id }
  });
}

/**
 * Refund a payment, wholly or partly.
 *
 * `amountCents` matters for series: one payment intent covers the whole run,
 * so cancelling a single lesson refunds that lesson's amount against the
 * shared intent. Omitting it refunds whatever remains refundable.
 */
export function refundPayment(env, paymentIntent, amountCents) {
  return stripeRequest(env, "/refunds", {
    payment_intent: paymentIntent,
    ...(amountCents ? { amount: amountCents } : {})
  });
}

/**
 * One Checkout Session for a whole fixed run of lessons.
 *
 * Priced per lesson with a quantity, so her student's receipt reads
 * "Single lesson × 4" rather than an unexplained total. The webhook finds the
 * run again via metadata.series_id and confirms every held occurrence at once.
 */
export function createSeriesCheckoutSession(env, { seriesId, firstBooking, lessonType, count, successUrl, cancelUrl, customerEmail, skippedStartAts = [] }) {
  // The webhook rebuilds the confirmation email, and the "these weeks were not
  // free" note only survives to it through here. Metadata values cap at 500
  // characters; a run that somehow skips more weeks than fits just drops the note.
  const skipped = JSON.stringify(skippedStartAts);
  return stripeRequest(env, "/checkout/sessions", {
    mode: "payment",
    client_reference_id: firstBooking.id,
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: {
      0: {
        quantity: count,
        price_data: {
          currency: "eur",
          unit_amount: lessonType.price_cents,
          product_data: {
            name: lessonType.name,
            description: `Weekly Portuguese lessons with Inês · ${lessonType.duration_minutes} minutes each`
          }
        }
      }
    },
    metadata: {
      series_id: seriesId,
      booking_reference: firstBooking.reference,
      lesson_type: lessonType.id,
      ...(skippedStartAts.length && skipped.length <= 480 ? { skipped } : {})
    }
  });
}

/**
 * Verifies the `Stripe-Signature` header.
 *
 * Without this anyone who finds the endpoint could mark bookings as paid, so it
 * is checked before the payload is trusted for anything at all. The timestamp
 * tolerance is what stops a captured request being replayed later.
 */
export async function verifyWebhook(payload, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(
    String(header ?? "")
      .split(",")
      .map((piece) => piece.split("=").map((value) => value.trim()))
      .filter((pair) => pair.length === 2)
  );

  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!timestamp || !provided) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

/** True when a live Stripe key is configured. Test keys work identically. */
export function stripeConfigured(env) {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function isTestMode(env) {
  return String(env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

# Booking Launch Plan

Use Square as the source of truth for live availability, booking, client
records, calendar sync, checkout, and student changes. Production currently
uses Square’s hosted route, embedded with a visible direct fallback.

## Provider Order

1. Hosted Square booking: set `NEXT_PUBLIC_BOOKING_MODE=square-hosted` and
   `NEXT_PUBLIC_SQUARE_BOOKING_URL`.
2. Future custom Square calendar: only after a deployed, healthy Worker is
   configured with `NEXT_PUBLIC_BOOKING_API_BASE_URL`.
3. Acuity fallback: set `NEXT_PUBLIC_ACUITY_SCHEDULER_URL`.
4. Cal.com fallback: set `NEXT_PUBLIC_CALCOM_LINK`.

Square takes precedence when more than one provider is configured.

## Square Setup

1. In Square Dashboard, go to **Appointments > Online booking > Channels**.
2. Finish the required setup first: location, business hours, and at least one bookable service.
3. Under **Add your booking flow to an existing site**, click **Get Started**.
4. Use **Get URL** or **Get embed code**.
5. Set the copied URL or one-line snippet as:

```bash
NEXT_PUBLIC_BOOKING_MODE=square-hosted
NEXT_PUBLIC_BOOKING_API_BASE_URL=
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://squareup.com/appointments/book/...
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=45
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual
```

## Flexible Rescheduling Contract

Use `Europe/Lisbon` as the policy clock. A change is free when it is requested on any calendar day before the lesson date. A EUR 5 fee applies only when the request date and original lesson date are the same in Porto time. This is not the same as a rolling 24-hour cutoff.

The website exposes the rule consistently on `/book` and `/faq`. Existing
students use the change link in their Square confirmation email; the site also
links directly to Square. Use one of these reviewed operating modes:

- `manual`: Inês validates the date and collects the EUR 5 fee in Square for same-day changes.
- `square-policy`: Square Appointments Plus or Premium has card-on-file cancellation protection and a flat EUR 5 fee configured. Native enforcement is cutoff-based and discretionary, so only apply it when the exact Porto calendar-day rule is met.

Do not approximate the promise with a 24-hour cutoff. Exact automatic self-service enforcement is a later architecture phase because it needs authenticated booking access, verified payment state, and a Bookings API update. Square documents cancellation policy and fees as a Plus/Premium feature, and seller-level `UpdateBooking` calls also require Plus or Premium.

## Square API Adapter

Keep this Next app as a static export for GitHub Pages. Do not add `src/app/api` routes for Square while `next.config.ts` uses `output: "export"`.

The Worker is not part of the current production path. If the custom calendar
is resumed, deploy `workers/square-booking-worker.mjs` separately, store
`SQUARE_ACCESS_TOKEN` as a Worker secret, and test `/health`, availability, and
real booking creation before changing the public mode. See
[docs-square-custom-booking.md](./docs-square-custom-booking.md).

## Account Connection Boundary

Calendar, confirmation emails, the existing-booking link, and client account behavior belong inside Square. The website should not host its own Stripe OAuth flow, store Stripe API keys, store Square access tokens, store booking/payment state, or receive booking/payment webhooks until there is a deliberate backend data model.

In-site prepayment is a separate phase. Square bookings and Square payments are not one atomic API call, so payment would need Square Web Payments SDK plus a Worker endpoint that authorizes payment, creates the booking, then captures or voids the payment depending on booking success.

## Optional Later

- Add WhatsApp reminders through Zapier/Make/Twilio if Ines really needs them.
- Add packages or subscriptions inside the chosen booking platform if recurring lessons become the normal model.
- Add a custom student portal only if the external platform's client account area becomes the bottleneck.

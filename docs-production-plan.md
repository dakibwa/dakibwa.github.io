# Booking Launch Plan

Use Square as the source of truth for booking, client records, calendar sync, and student changes. The site can render a custom calendar UI, but all private Square API work must run through a separate backend adapter.

## Provider Order

1. Custom Square calendar: set `NEXT_PUBLIC_BOOKING_MODE=custom-square` and `NEXT_PUBLIC_BOOKING_API_BASE_URL`.
2. Hosted Square fallback/manage link: set `NEXT_PUBLIC_SQUARE_BOOKING_URL`.
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
NEXT_PUBLIC_BOOKING_MODE=custom-square
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-api.dakibwa.workers.dev
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://squareup.com/appointments/book/...
LESSON_PRICE_CENTS=1500
LESSON_CURRENCY=eur
```

## Square API Adapter

Keep this Next app as a static export for GitHub Pages. Do not add `src/app/api` routes for Square while `next.config.ts` uses `output: "export"`.

Deploy `workers/square-booking-worker.mjs` as a separate Cloudflare Worker. Store `SQUARE_ACCESS_TOKEN` as a Worker secret, and keep location, service variation, and optional team member IDs in Worker config. See [docs-square-custom-booking.md](./docs-square-custom-booking.md).

## Account Connection Boundary

Calendar, confirmation emails, reschedule/cancel rules, and client account behavior belong inside Square. The website should not host its own Stripe OAuth flow, store Stripe API keys, store Square access tokens, store booking/payment state, or receive booking/payment webhooks until there is a deliberate backend data model.

In-site prepayment is a separate phase. Square bookings and Square payments are not one atomic API call, so payment would need Square Web Payments SDK plus a Worker endpoint that authorizes payment, creates the booking, then captures or voids the payment depending on booking success.

## Optional Later

- Add WhatsApp reminders through Zapier/Make/Twilio if Ines really needs them.
- Add packages or subscriptions inside the chosen booking platform if recurring lessons become the normal model.
- Add a custom student portal only if the external platform's client account area becomes the bottleneck.

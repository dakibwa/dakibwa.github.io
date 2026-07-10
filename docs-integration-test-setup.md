# Integration Test Setup

Use this when testing the booking flow before connecting Ines's production Square, Acuity, or Stripe setup.

## What This Site Needs

For the custom Square flow, the site needs a public Square API adapter URL plus a hosted Square fallback/manage link:

```bash
NEXT_PUBLIC_BOOKING_MODE=custom-square
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-api.dakibwa.workers.dev
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://squareup.com/appointments/book/...
LESSON_PRICE_CENTS=1500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=45
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
NEXT_PUBLIC_RESCHEDULE_FEE_MODE=policy-only
```

The site does not need Stripe keys or Square access tokens. Square owns booking confirmation, customer records, reschedule/cancel rules, and calendar sync. The Worker owns private Square API calls.

This test plan covers in-site appointment booking. In-site payment needs a separate Square Web Payments SDK pass; Square does not provide one atomic book-and-pay API call.

## Square Test Setup

1. Sign in to Square Dashboard.
2. Go to **Appointments > Online booking > Channels**.
3. Under **Add your booking flow to an existing site**, click **Get Started**.
4. Use **Get URL** for a direct booking link, or **Get embed code** for Square's embed/button snippet.
5. Paste the booking URL, or the one-line snippet containing `src="..."` or `href="..."`, into `NEXT_PUBLIC_SQUARE_BOOKING_URL`.
6. Make sure Square has at least one location, one bookable service, and visible availability.
7. Collect the location ID, service variation ID, and team member ID for the Worker config. The service variation version comes back from live availability; only set it manually if creating bookings without selecting a live slot first.
8. Deploy `workers/square-booking-worker.mjs` with `SQUARE_ACCESS_TOKEN` stored as a Worker secret.

`NEXT_PUBLIC_ACUITY_SCHEDULER_URL` and `NEXT_PUBLIC_CALCOM_LINK` are still supported as temporary fallbacks while Square is being set up.

## Worker Sandbox Test

Before pointing production at the adapter, test:

1. `GET /health` returns `"ok": true`.
2. `GET /availability?start=YYYY-MM-DD&end=YYYY-MM-DD` returns live Square slots.
3. `POST /bookings` creates a test booking in Square.
4. A blocked origin gets a CORS/403 response.
5. Browser network responses do not expose `SQUARE_ACCESS_TOKEN`.
6. The homepage, booking page, and FAQ all say that earlier-day changes are free and same-day changes cost EUR 5 in Porto time.
7. Before production, choose and test `manual` or `square-policy` enforcement; `policy-only` must fail `npm run check:booking` unless preview mode is explicitly enabled.

## Acuity Test Setup

1. Create or sign in to an Acuity account.
2. Create an appointment type named `First Portuguese Lesson`.
3. Set duration to 75 minutes and timezone to Europe/Lisbon.
4. Set the price to EUR 15.
5. Add a small availability window so the booking widget has visible slots.
6. Add intake questions for:
   - Portuguese level
   - Lesson focus
   - Phone or WhatsApp
   - Online/cafe preference if needed
   - Any notes for the lesson
7. Enable client accounts if students should log in to see upcoming and past lessons.
8. Set scheduling limits for how late students can reschedule or cancel.
9. Connect Stripe in Acuity payment settings when you are ready to test payment.
10. Copy the scheduler URL from **Scheduling Page > Link**.

## Payment Testing

Acuity's official testing guidance is different from Stripe test-card testing: if payment is required, create a private 100% test coupon to book free test appointments. If you need to test the connected payment processor itself, Acuity recommends making a real small charge and then refunding it; processor fees may not be refunded.

Suggested QA path:

1. Create a private test coupon in Acuity that discounts the appointment by 100%.
2. Book through the embedded scheduler using that coupon.
3. Confirm the appointment appears in Acuity.
4. Confirm the student email arrives and contains account/change links.
5. Confirm client account login shows the appointment when client accounts are enabled.
6. Cancel the test appointment and delete the test coupon when done.
7. Only if needed, run one small real payment test and refund it from the connected payment processor.

## Local Site Test

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Then edit:

```bash
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://squareup.com/appointments/book/...
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000/book` and check:

1. The custom calendar renders.
2. A bookable date and time can be selected.
3. Name, email, phone, and notes fields are visible.
4. With no API URL, the confirm button stays disabled and the hosted Square fallback remains available.
5. With the Worker URL set, a confirmed test booking appears in Square.
6. Square sends the expected confirmation/change links.

## Production Swap

After the test pass, keep:

```bash
NEXT_PUBLIC_BOOKING_MODE=custom-square
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-api.dakibwa.workers.dev
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://squareup.com/appointments/book/...
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual
```

Remove unused fallback provider variables once the production booking flow is confirmed live. Do not add Stripe secret keys or Square access tokens to this app unless the architecture changes to a real backend-owned checkout flow.

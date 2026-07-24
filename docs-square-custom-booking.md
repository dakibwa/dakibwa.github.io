# Square Custom Booking — Future Architecture

This flow is not deployed and is not the production booking route. Production
uses `square-hosted`. Do not enable this design until the Worker is deployed,
healthy, and tested against Square.

The custom Square booking flow keeps this Next.js site as a static GitHub Pages frontend and uses a separate Square API adapter for live availability and booking creation.

## Architecture

- The website renders the custom calendar UI at `/book`.
- The website calls only `NEXT_PUBLIC_BOOKING_API_BASE_URL`.
- The Square access token stays in the backend adapter, never in `NEXT_PUBLIC_*` env vars.
- The hosted Square booking URL remains the fallback and manage-booking link.
- Square remains the source of truth for confirmed appointments, customer records, reschedule/cancel rules, and emails.
- Appointment prepayment is not covered by this adapter. If prepayment must also happen inside the site, add Square Web Payments SDK plus a Payments API endpoint as a separate phase and test how the payment record is reconciled with the booking.

## Same-day rescheduling

The public contract uses Porto calendar days, not a rolling number of hours: rescheduling is free before the lesson date and costs EUR 5 when requested on the lesson date itself. The site links students back to Square to choose another available time.

Set `NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual` when Inês will validate and collect same-day fees in Square, or `square-policy` only after Square Appointments Plus/Premium cancellation protection is configured. Keep `policy-only` for local previews; the production booking check rejects it.

Square's native cancellation policy is cutoff-based and discretionary rather than an exact automatic calendar-day rescheduling charge. A truly automatic version needs authenticated booking access, verified payment completion, and an `UpdateBooking` call; seller-level updates require Square Appointments Plus or Premium. Do not add an unauthenticated public reschedule endpoint to this Worker.

## Frontend Env

Set these in `.env.local` for development and GitHub Pages repository variables for production:

```bash
NEXT_PUBLIC_BOOKING_MODE=custom-square
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-api.dakibwa.workers.dev
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://book.squareup.com/appointments/...
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=60
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual
```

If `NEXT_PUBLIC_BOOKING_API_BASE_URL` is blank, the custom calendar renders sample slots and disables confirmation. Students can still use the Square hosted link when `NEXT_PUBLIC_SQUARE_BOOKING_URL` is set.

## Worker Env

Use `workers/square-booking-worker.mjs` as the Cloudflare Worker entrypoint. `workers/wrangler.jsonc` contains the current public production location/service IDs inferred from the Square booking URLs. Use `workers/wrangler.example.jsonc` as the template if these change.

Set non-secret vars:

```bash
ALLOWED_ORIGIN=http://localhost:3000,https://dakibwa.github.io,https://akibwa.com
SQUARE_ENVIRONMENT=production
SQUARE_API_VERSION=2026-05-20
SQUARE_LOCATION_ID=LM9S606EKRB6D
SQUARE_SERVICE_VARIATION_ID=4XRWERRUTRGQYKBX24HPXGKT
SQUARE_SERVICE_VARIATION_VERSION=optional-if-you-create-bookings-without-searching-live-availability-first
SQUARE_TEAM_MEMBER_ID=optional-if-you-want-to-force-one-bookable-team-member
```

Set the private token as a Cloudflare secret:

```bash
wrangler secret put SQUARE_ACCESS_TOKEN
```

Do not commit `SQUARE_ACCESS_TOKEN`, production tokens, webhook signature keys, or account secrets.

## Square IDs To Collect

Use the Square Dashboard or API to collect:

- Location ID.
- Service variation ID for the bookable Portuguese lesson.
- Team member ID if bookings should always assign to one teacher.
- Service variation version only if the frontend creates bookings without first selecting a live availability slot.

The service variation must be bookable online in Square, and Square must have valid availability/business hours.

## Adapter Endpoints

- `GET /health`: confirms required Worker config is present.
- `GET /availability?start=YYYY-MM-DD&end=YYYY-MM-DD`: returns normalized slots for the calendar.
- `POST /bookings`: creates or reuses a Square customer, then creates the booking.
- `GET /bookings/:id`: retrieves a booking.
- `POST /bookings/:id/cancel`: cancels a booking using the current booking version.

The frontend currently posts:

```json
{
  "customer": {
    "name": "Student Name",
    "email": "student@example.com",
    "phone": "+351..."
  },
  "customerNote": "Optional lesson notes",
  "slot": {
    "startAt": "2026-07-01T10:00:00Z",
    "locationId": "...",
    "appointmentSegments": []
  }
}
```

## Validation

Run:

```bash
npm run lint
npm run typecheck
NEXT_PUBLIC_BOOKING_MODE=custom-square npm run build
NEXT_PUBLIC_BOOKING_MODE=custom-square QA_BASE_URL=http://127.0.0.1:3000 npm run test:flow
npx wrangler deploy --config workers/wrangler.jsonc --dry-run
```

For local layout preview before the Worker is live, run `ALLOW_BOOKING_PREVIEW=1 npm run check:booking`. Do not use the preview flag for production deployment.

Before production, also test the Worker in Square sandbox:

1. `GET /health` returns `"ok": true`.
2. `/availability` returns live Square slots.
3. A test booking appears in Square.
4. Non-allowed origins are rejected by CORS.
5. No Square token appears in browser source, JavaScript bundles, or network responses.

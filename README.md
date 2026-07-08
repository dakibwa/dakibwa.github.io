# Portuguese with Inês

A simple, friendly site for Inês Dias Baía, a Portuguese teacher in Porto. The home page introduces her teaching style, then points students to either booking or the FAQ.

The current implementation keeps Square as the booking source of truth, but the preferred booking surface is a custom calendar-style screen inside `/book` backed by a separate Cloudflare Worker/Square API adapter. The hosted Square page remains the fallback and manage-booking route.

For the project history and design/product decisions from the Codex conversation, see [conversation-brief.md](./conversation-brief.md). For the latest design reset and future rebuild brief, start with [docs-design-reset-audit-2026-07-07.md](./docs-design-reset-audit-2026-07-07.md), [docs-future-perfect-site-brief.md](./docs-future-perfect-site-brief.md), and [design/README.md](./design/README.md).

## What is included

- Public landing page with a short teacher intro, teaching style notes, and one clear book/manage CTA.
- `/faq` page with the practical questions students need before booking.
- `/book` page with a custom calendar booking flow, hosted Square fallback, and account/change guidance in one integrated flow.
- Friendly booking fallback if the real scheduler link has not been added yet.
- Playwright smoke test for the landing, FAQ, and booking surfaces.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Configure Booking

Create `.env.local`:

```bash
NEXT_PUBLIC_BOOKING_MODE=custom-square
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-api.dakibwa.workers.dev
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://squareup.com/appointments/book/...
LESSON_PRICE_CENTS=1500
LESSON_CURRENCY=eur
```

Then restart the dev server.

`NEXT_PUBLIC_BOOKING_MODE=custom-square` turns on the custom calendar. `NEXT_PUBLIC_BOOKING_API_BASE_URL` points to the separate Square adapter; if it is blank, the calendar renders preview slots and the confirm button stays disabled. `NEXT_PUBLIC_SQUARE_BOOKING_URL` remains the safe hosted fallback and manage-booking link.

For local layout preview before the Worker is live, use `ALLOW_BOOKING_PREVIEW=1 npm run check:booking`. Production checks intentionally fail if the custom Square API URL is missing or unhealthy.

Use `NEXT_PUBLIC_BOOKING_MODE=square-hosted` only if you want to temporarily return `/book` to the hosted Square iframe while the adapter is not ready.

In Square, go to **Appointments > Online booking > Channels > Add your booking flow to an existing site > Get Started**, then copy either the booking flow URL or the one-line embed/button code. Paste it into `NEXT_PUBLIC_SQUARE_BOOKING_URL`.

For the custom Square API adapter, see [docs-square-custom-booking.md](./docs-square-custom-booking.md). Do not add Square access tokens or Stripe secret keys to this static site. In-site prepayment would need a separate Square Web Payments SDK phase.

If staying with Acuity instead, set:

```bash
NEXT_PUBLIC_ACUITY_SCHEDULER_URL=https://portuguese-with-ines.as.me/first-portuguese-lesson
```

In Acuity, configure the appointment type with:

- 75-minute first Portuguese lesson.
- Current payment price set to EUR 15, charged on booking.
- Location copy for Epoca Cafe, without implying an official partnership unless confirmed.
- Calendar connected for conflict checking and event creation.
- Stripe connected through Acuity payment settings and required for payment before booking.
- Client accounts enabled if students should log in to review upcoming and past lessons.
- Intake questions for level, lesson focus, phone/WhatsApp, and any meeting notes.
- Scheduling limits set so students can reschedule/cancel only inside the intended window.
- Confirmation/reminder emails that include the right account, reschedule, and cancel links.

The site accepts Square `squareup.com` or `square.site` links, plus Acuity `acuityscheduling.com`, `squarespacescheduling.com`, and `as.me` links. It can extract a URL from `src="..."` or `href="..."` if you paste a one-line embed/button snippet.

For a safe pre-production pass with throwaway/test accounts, see [docs-integration-test-setup.md](./docs-integration-test-setup.md).

# Portuguese with Inês

A simple, friendly site for Inês Dias Baía, a Portuguese teacher in Porto. The home page introduces her teaching style, then points students to either booking or the FAQ.

The current implementation is ready for **Acuity Scheduling as the booking system**. The site is the friendly front door; Acuity handles live availability, client accounts, Stripe payment, calendar sync, confirmation emails, and reschedule/cancel rules. The existing Cal.com event remains as a temporary fallback until the Acuity scheduler URL is configured.

For the project history and design/product decisions from the Codex conversation, see [conversation-brief.md](./conversation-brief.md).

## What is included

- Public landing page with a short teacher intro, teaching style notes, and one clear book/manage CTA.
- `/faq` page with the practical questions students need before booking.
- `/book` page with the active booking-system embed, payment/calendar explanation, and account/change guidance in one integrated flow.
- Friendly booking fallback if the real scheduler link has not been added yet.
- Playwright smoke test for the landing, FAQ, and booking surfaces.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Configure Acuity

Create `.env.local`:

```bash
NEXT_PUBLIC_ACUITY_SCHEDULER_URL=https://portuguese-with-ines.as.me/first-portuguese-lesson
LESSON_PRICE_CENTS=1500
LESSON_CURRENCY=eur
```

Then restart the dev server.

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

Copy the scheduler URL from **Scheduling Page > Link** in Acuity and set it as `NEXT_PUBLIC_ACUITY_SCHEDULER_URL`. The site accepts `acuityscheduling.com`, `squarespacescheduling.com`, and `as.me` scheduler links. It can also extract the `src` URL if you paste Acuity's iframe embed code.

For a safe pre-production pass with throwaway/test accounts, see [docs-integration-test-setup.md](./docs-integration-test-setup.md).

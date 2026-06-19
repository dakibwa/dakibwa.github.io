# Portuguese with Inês

A simple, friendly site for Inês Dias Baía, a Portuguese teacher in Porto. The home page introduces her teaching style, then points students to either booking or the FAQ.

The current implementation uses **Cal.com as the booking system**. The site is the friendly front door; Cal.com handles live availability, Stripe payment, calendar sync, confirmation emails, and reschedule/cancel links.

For the project history and design/product decisions from the Codex conversation, see [conversation-brief.md](./conversation-brief.md).

## What is included

- Public landing page with a short teacher intro, teaching style notes, and one clear book/manage CTA.
- `/faq` page with the practical questions students need before booking.
- `/book` page with the Cal.com inline embed, payment/calendar explanation, and reschedule guidance in one integrated flow.
- Friendly booking fallback if the real Cal.com event link has not been added yet.
- Playwright smoke test for the landing, FAQ, and booking surfaces.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Configure Cal.com

Create `.env.local`:

```bash
NEXT_PUBLIC_CALCOM_LINK=ines/first-portuguese-lesson
LESSON_PRICE_CENTS=4500
LESSON_CURRENCY=eur
```

Then restart the dev server.

In Cal.com, configure the event type with:

- 75-minute first Portuguese lesson.
- Location copy for Epoca Cafe, without implying an official partnership unless confirmed.
- Calendar connected for conflict checking and event creation.
- Stripe connected through the Cal.com app store and required for payment before booking.
- Invitee questions for level, lesson focus, phone/WhatsApp, and any meeting notes.
- Confirmation/reminder emails that include Cal.com reschedule and cancel links.

For a safe pre-production pass with throwaway/test accounts, see [docs-integration-test-setup.md](./docs-integration-test-setup.md).

# Integration Test Setup

Use this when testing the booking flow before connecting Ines's production Cal.com and Stripe setup.

## What This Site Needs

The site only needs a Cal.com event slug:

```bash
NEXT_PUBLIC_CALCOM_LINK=your-test-user/first-portuguese-lesson-test
LESSON_PRICE_CENTS=4500
LESSON_CURRENCY=eur
```

The site does not need Stripe keys. Cal.com owns the payment step, booking confirmation, reschedule/cancel links, and calendar sync.

## Stripe Test Setup

1. Create or sign in to a user-owned Stripe account.
2. Keep Stripe in test mode or create/open a sandbox from the Stripe Dashboard.
3. Do not activate live payments or enter real card details for this test pass.
4. Use Stripe's test card values inside the Cal.com checkout step.

Useful cards for manual testing:

| Case | Card | Expiry | CVC |
| --- | --- | --- | --- |
| Successful Visa payment | `4242 4242 4242 4242` | Any future date | Any 3 digits |
| Portuguese Visa payment | `4000 0062 0000 0007` | Any future date | Any 3 digits |
| 3D Secure challenge | `4000 0025 0000 3155` | Any future date | Any 3 digits |
| Generic decline | `4000 0000 0000 0002` | Any future date | Any 3 digits |

## Cal.com Test Setup

1. Create or sign in to a test Cal.com account.
2. Create a test event type with a slug like `first-portuguese-lesson-test`.
3. Set duration to 75 minutes and timezone to Europe/Lisbon.
4. Add a small availability window so the booking widget has visible slots.
5. Add the invitee questions needed for a first lesson:
   - Portuguese level
   - Lesson focus
   - Phone or WhatsApp
   - Online/cafe preference if needed
   - Any notes for the lesson
6. Connect Stripe in the event type payment settings.
7. Set price to EUR 45 and require payment before confirmation.
8. Confirm the event link works directly at `https://cal.com/<user>/<event-slug>`.

## Local Site Test

Create `.env.local` from `.env.example` and set the test event slug:

```bash
cp .env.example .env.local
```

Then edit:

```bash
NEXT_PUBLIC_CALCOM_LINK=your-test-user/first-portuguese-lesson-test
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000/book` and check:

1. The Cal.com embed loads inline, not the fallback placeholder.
2. A bookable slot appears.
3. The invitee questions appear before confirmation.
4. The payment step appears and accepts a Stripe test card.
5. A confirmation email arrives.
6. The confirmation email includes reschedule and cancel links.
7. The Stripe Dashboard shows a test/sandbox payment, not a live payment.

## Production Swap

After the test pass, replace only:

```bash
NEXT_PUBLIC_CALCOM_LINK=ines/first-portuguese-lesson
```

Do not add Stripe secret keys to this app unless the architecture changes to a custom checkout flow.

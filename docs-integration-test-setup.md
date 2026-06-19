# Integration Test Setup

Use this when testing the booking flow before connecting Ines's production Acuity and Stripe setup.

## What This Site Needs

The site only needs an Acuity scheduler URL:

```bash
NEXT_PUBLIC_ACUITY_SCHEDULER_URL=https://portuguese-with-ines.as.me/first-portuguese-lesson
LESSON_PRICE_CENTS=1500
LESSON_CURRENCY=eur
```

The site does not need Stripe keys. Acuity owns the payment step, booking confirmation, client account, reschedule/cancel rules, and calendar sync.

`NEXT_PUBLIC_CALCOM_LINK` is still supported as a temporary fallback while Acuity is being set up, but Acuity takes precedence when both values are present.

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
NEXT_PUBLIC_ACUITY_SCHEDULER_URL=https://your-scheduler.as.me/first-portuguese-lesson
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000/book` and check:

1. The Acuity scheduler loads inline, not the fallback placeholder.
2. A bookable slot appears.
3. The intake questions appear before confirmation.
4. Client account sign-up or login is visible in the scheduler if enabled.
5. The payment step appears when no test coupon is applied.
6. A confirmation email arrives.
7. The confirmation email includes the intended reschedule and cancel links.

## Production Swap

After the test pass, keep:

```bash
NEXT_PUBLIC_ACUITY_SCHEDULER_URL=https://your-production-scheduler.as.me/first-portuguese-lesson
```

Remove `NEXT_PUBLIC_CALCOM_LINK` once the Acuity setup is confirmed live. Do not add Stripe secret keys to this app unless the architecture changes to a custom checkout flow.

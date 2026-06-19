# Cal.com Launch Plan

Use Cal.com as the source of truth for booking, payment, calendar sync, and student changes.

## Cal.com Setup

1. Create one event type for the first Portuguese lesson.
2. Set duration to 75 minutes and default timezone to Europe/Lisbon.
3. Add location copy for Epoca Cafe. Avoid implying an official cafe partnership unless Inês confirms it.
4. Connect Inês's calendar so Cal.com checks conflicts and adds confirmed lessons automatically.
5. Connect Stripe in Cal.com and require payment on the lesson event type.
6. Add invitee questions: level, lesson focus, phone/WhatsApp, online/cafe preference if needed, and accessibility or meeting notes.
7. Keep Cal.com reschedule/cancel links in confirmation and reminder emails.

## Site Setup

Set:

```bash
NEXT_PUBLIC_CALCOM_LINK=ines/first-portuguese-lesson
LESSON_PRICE_CENTS=4500
LESSON_CURRENCY=eur
```

The custom site should not store bookings, payment state, or student records in v1. That keeps maintenance low and avoids building auth, Stripe webhooks, calendar OAuth, cancellation/refund handling, and GDPR workflows before Inês needs them.

For a safe dummy-account test pass before production, use [docs-integration-test-setup.md](./docs-integration-test-setup.md). Keep Stripe in test mode or sandbox mode, and point `NEXT_PUBLIC_CALCOM_LINK` at the test Cal.com event slug.

## Optional Later

- Add WhatsApp reminders through Zapier/Make/Twilio if Inês really needs them.
- Add a private notes or lesson-materials area only after there is a clear recurring workflow.
- Add custom booking backend only if Cal.com becomes the bottleneck.

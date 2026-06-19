# Acuity Launch Plan

Use Acuity as the source of truth for booking, client accounts, payment, calendar sync, and student changes.

## Acuity Setup

1. Create one appointment type for the first Portuguese lesson.
2. Set duration to 75 minutes and default timezone to Europe/Lisbon.
3. Add location copy for Epoca Cafe. Avoid implying an official cafe partnership unless Ines confirms it.
4. Connect Ines's calendar so Acuity checks conflicts and adds confirmed lessons automatically.
5. Connect Stripe in Acuity's payment settings and require payment for the appointment type.
6. Enable client accounts if students should log in to review upcoming and past appointments.
7. Add intake questions: level, lesson focus, phone/WhatsApp, online/cafe preference if needed, and accessibility or meeting notes.
8. Configure scheduling limits for how far ahead students can book, reschedule, and cancel.
9. Keep confirmation/reminder emails clear, with the right client-account, reschedule, and cancel links.

## Account Connection Boundary

The Stripe connection is an account-level setup inside Acuity: log in to Ines's Acuity account, choose Stripe as the payment processor, and authorize the Stripe account through Acuity's connection flow. The website should not host its own Stripe OAuth flow, store Stripe API keys, store booking/payment state, or receive booking/payment webhooks in v1.

## Site Setup

Set:

```bash
NEXT_PUBLIC_ACUITY_SCHEDULER_URL=https://your-production-scheduler.as.me/first-portuguese-lesson
LESSON_PRICE_CENTS=1500
LESSON_CURRENCY=eur
```

`NEXT_PUBLIC_CALCOM_LINK` is supported only as a temporary fallback during the migration. Remove it once the Acuity booking flow is confirmed live.

The custom site should not store bookings, payment state, or student records in v1. That keeps maintenance low and avoids building auth, Stripe webhooks, calendar OAuth, cancellation/refund handling, and GDPR workflows before Ines needs them.

For a safe pre-production pass, use [docs-integration-test-setup.md](./docs-integration-test-setup.md). Acuity's recommended scheduler test path is a private test coupon; payment-processor testing requires a real small charge and refund if you choose to test it end to end.

## Optional Later

- Add WhatsApp reminders through Zapier/Make/Twilio if Ines really needs them.
- Add packages or subscriptions in Acuity if recurring lessons become the normal model.
- Add a custom student portal only if Acuity client accounts become the bottleneck.

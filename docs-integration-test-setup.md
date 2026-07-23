# Booking Integration Test Setup

Use this checklist before changing the production Square booking route.

## Current hosted Square mode

The static site needs only public configuration:

```bash
NEXT_PUBLIC_BOOKING_MODE=square-hosted
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://book.squareup.com/appointments/...
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=45
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual
```

No Square token or Stripe key belongs in the website.

## Provider checklist

1. In Square Dashboard, confirm the location, bookable service, business hours,
   timezone, and public booking channel.
2. Copy the public booking URL from **Appointments > Online booking > Channels**.
3. Confirm the public URL returns a successful page before building.
4. Open `/book`, accept or reject Square’s own cookie prompt, and confirm live
   availability appears.
5. Confirm “Open secure booking” reaches the same Square route in a new tab.
6. Complete a controlled test booking only when a test appointment is safe to
   create, then confirm the email and change-booking link.
7. Remove or cancel the controlled test booking in Square after verification.

The site’s automated smoke test confirms all five routes, responsive overflow,
FAQ disclosure behaviour, the embedded provider, and the direct Square link.
It does not create an appointment.

## Future custom calendar

The repository retains a custom-calendar frontend and Cloudflare Worker source,
but no production Worker is currently deployed. Before setting
`NEXT_PUBLIC_BOOKING_MODE=custom-square`:

1. Deploy the Worker with `SQUARE_ACCESS_TOKEN` stored as a secret.
2. Allow localhost, `https://dakibwa.github.io`, and `https://akibwa.com`.
3. Confirm `/health` returns `ok: true`.
4. Confirm live availability, booking creation, origin rejection, and that no
   secret appears in browser source or network responses.
5. Keep the hosted Square URL as the recovery and management route.
6. Run the production build and smoke test in custom mode.

See [docs-square-custom-booking.md](./docs-square-custom-booking.md) for the
future adapter contract.

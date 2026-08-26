# Booking system

Booking is owned by this repository. There is no third-party scheduler: the
site renders the calendar, and `workers/booking/` (Cloudflare Worker + D1) is
the source of truth for availability, bookings, and changes.

## Why not Square, Cal.com, or Acuity

**Square cannot be the rail.** Square does not onboard sellers in Portugal —
its seller countries are Australia, Canada, France, Ireland, Japan, Spain, the
United Kingdom and the United States. The account this site pointed at until
August 2026 was Dan's UK account, set up as a test. It could never have taken
money for a Porto-based business, and its booking URL is now removed.

**The Google Calendar API was avoided deliberately.** Reading her calendar needs
a *sensitive* OAuth scope, which requires Google verification (2–6 weeks). Until
that clears the app sits in Testing mode, where refresh tokens expire after 7
days — the integration would break weekly and silently. Instead the Worker emails
her a real calendar invitation per booking (see below). Two-way sync can be added
later without students noticing.

## Shape

```
Student on /book
  → GET  /lesson-types, GET /availability          (public)
  → POST /bookings                                  → D1 row, emails, ICS invite
Student on /booking/?token=…                        (link from their email)
  → GET  /bookings/:token                           HMAC-signed, not guessable
  → POST /bookings/:token/reschedule | /cancel      → sequence++, updated ICS
Inês on /schedule                                    (bearer token, noindex)
  → GET/POST /admin/availability, /admin/exceptions, GET /admin/bookings
```

### How her calendar stays current

Each lifecycle event emails an iCalendar attachment. Gmail adds the event on
arrival and applies later updates to the same entry. Three things make an update
land on the existing event rather than duplicating it, and all three are easy to
get wrong:

- `UID` is stable for the life of the booking.
- `SEQUENCE` increments on every change. Clients ignore an update that does not.
- `METHOD` is `REQUEST` for a booking or change, `CANCEL` for a cancellation.

### Time

Instants are stored as ISO-8601 UTC. Weekly teaching hours are stored as
minutes-from-midnight in Porto time and resolved against `Europe/Lisbon` at query
time, so the rules survive DST instead of drifting an hour twice a year. The
25-hour and 23-hour transition days are covered by tests in `workers/booking/`.

### Same-day changes

Students may move or cancel right up to the lesson start. A change made on the
lesson's own Porto date sets `same_day_change`, which:

- warns the student on `/booking/` *before* they act,
- marks the confirmation they receive,
- sends Inês a mail subjected **"Same-day change"** so she knows to collect the
  €5 fee at the lesson.

The fee is collected by her in person, not enforced by software. That is
deliberate: there is no payment rail yet to charge against.

## Deploying the Worker

```bash
npx wrangler d1 create ines-booking          # put the id in wrangler.jsonc
npx wrangler d1 execute ines-booking --remote --config workers/booking/wrangler.jsonc --file workers/booking/schema.sql
npx wrangler d1 execute ines-booking --remote --config workers/booking/wrangler.jsonc --file workers/booking/seed.sql
npx wrangler deploy --config workers/booking/wrangler.jsonc
```

Secrets, each via `npx wrangler secret put <NAME> --config workers/booking/wrangler.jsonc`:

| Secret | What it is |
|---|---|
| `BOOKING_TOKEN_SECRET` | Signs manage links. Any long random string. **Changing it invalidates every link already emailed.** |
| `ADMIN_TOKEN` | What Inês pastes into `/schedule`. |
| `RESEND_API_KEY` | Transactional email. |
| `TEACHER_EMAIL` | Where her booking notifications go. |

Then set `EMAIL_DRY_RUN=0` in `wrangler.jsonc` and redeploy. Until that happens
the Worker records every message in `email_log` and sends nothing — and
`npm run check:booking` refuses to pass, because a site that confirms bookings
while silently sending no confirmations is worse than one that is visibly down.

`.dev.vars` overrides **secrets only**, not `vars`. For local development against
a different origin, pass `--var ALLOWED_ORIGIN:… --var SITE_URL:…` to
`wrangler dev`.

## Site configuration

```bash
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking.<subdomain>.workers.dev
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=60
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
```

With no API URL the booking page degrades to its setup placeholder and points
students at WhatsApp, rather than rendering a calendar that cannot work.

## Not yet built

- **Payment.** Stripe supports Portugal (Square does not) and carries MB WAY and
  Multibanco natively. It needs her own account: NIF and a Portuguese bank
  account. Until then students pay her directly, as they already do.
- **Fiscal documents.** She must issue a fatura-recibo per lesson, and CIVA art.
  36.º gives 5 working days from the lesson. See
  `Documents/Work/Português com a Inês/Billing and Booking - Operating Context
  and Options.md` for the full position, including the unresolved IVA exemption
  code.
- **Reminders** before a lesson.
- **Two-way Google Calendar sync**, once OAuth verification is worth doing.

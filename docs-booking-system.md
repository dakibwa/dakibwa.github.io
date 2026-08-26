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
Student on /book                                     (browse without an account)
  → GET  /lesson-types, GET /availability            public
  → POST /auth/register | /auth/login | /auth/google → session token
  → POST /bookings                    (Bearer)       → D1 row, emails, ICS invite
Student on /my-lessons                (Bearer)       → every lesson they have
Student on /booking/?token=…          (email link)
  → GET  /bookings/:token                            HMAC-signed, not guessable
  → POST /bookings/:token/reschedule | /cancel       → sequence++, updated ICS
Inês on /schedule                     (admin token, noindex)
  → GET/POST /admin/availability, /admin/exceptions, GET /admin/bookings
Stripe → POST /stripe/webhook                        signature-verified
```

## Accounts

Booking requires an account, so a student's lessons persist together rather than
depending on them having kept the right confirmation email.

- **Email and password.** Hashed with PBKDF2-HMAC-SHA256 at the OWASP iteration
  count — bcrypt and argon2 do not exist in the Workers runtime. The stored
  record carries its own algorithm, cost and salt, so the cost can be raised
  later without invalidating anyone.
- **Google Sign-In**, optional. Only non-sensitive scopes (name, email), so no
  Google verification review — unlike the Calendar API. Absent a client id the
  button simply does not render. Matching is by *verified* email, so someone who
  registered with a password and later uses Google lands on the same account.
- Sign-in answers identically for a wrong password and an unknown address, so
  the endpoint cannot be used to discover who has an account. Repeated failures
  are throttled for 15 minutes — which does also hold off the real student, the
  accepted trade against guessing.
- Reset links are single-use and last an hour. A Google-only account has no
  password; using "forgot password" is how such a student sets one.
- Sessions are stateless bearer tokens in `localStorage`, not cookies: the site
  and the API are different origins, so a cookie would need `SameSite=None` and
  would be dropped by any browser blocking third-party cookies. Signing out
  cannot revoke a token server-side, and changing a password does not invalidate
  existing ones — worth knowing before this is reused for anything more
  sensitive than a lesson calendar.
- The emailed manage link still works on its own, so a forgotten password never
  blocks someone from changing a lesson.

### How her calendar stays current

Each lifecycle event emails an iCalendar attachment. Gmail adds the event on
arrival and applies later updates to the same entry. Three things make an update
land on the existing event rather than duplicating it, and all three are easy to
get wrong:

- `UID` is stable for the life of the booking.
- `SEQUENCE` increments on every change. Clients ignore an update that does not.
- `METHOD` is `REQUEST` for a booking or change, `CANCEL` for a cancellation.

### Time and availability

Instants are stored as ISO-8601 UTC. Weekly teaching hours are stored as
minutes-from-midnight in Porto time and resolved against `Europe/Lisbon` at query
time, so the rules survive DST instead of drifting an hour twice a year. The
25-hour and 23-hour transition days are covered by tests.

`availability_rules.last_start_minute` is the latest a lesson may **begin**, not
when she finishes. That distinction matters: treating it as a finishing time
silently shortened the 90-minute format to an 18:30 last start while the
60-minute one kept 19:00.

Blocked exceptions are real spans of time, so a lesson is withheld when it would
**overlap** one rather than only when it starts inside it — which correctly
withholds a 90-minute lesson earlier than a 60-minute one.

### Payment

Off by default. `payment_mode` is `off`, every booking confirms on creation, and
none of the Stripe columns are read. With it set to `prepay` and Stripe
configured:

- the slot is held as `pending_payment`, not confirmed, and nothing is emailed
  until the webhook arrives — confirming first and reconciling later is how a
  student ends up with a lesson they never paid for;
- the webhook signature is verified before the payload is trusted for anything,
  and events are recorded so each is handled exactly once;
- an abandoned checkout releases its slot when the hold expires.

Stripe is used because Square does not serve Portugal, and because Stripe carries
MB WAY and Multibanco natively — between them the majority of Portuguese online
payments. `sk_test_` keys work identically, which is how this is exercised
before Inês has her own account.

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
| `STRIPE_SECRET_KEY` | Optional. Only read when `payment_mode` is `prepay`. |
| `STRIPE_WEBHOOK_SECRET` | Optional, and required alongside the key. |

Non-secret vars in `wrangler.jsonc`: `GOOGLE_CLIENT_ID` enables Google Sign-In
(it is public by design — the Worker verifies every token against it).

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

- **Her own Stripe account.** The payment path is built and can be exercised with
  test keys, but taking real money needs an account in her name: NIF and a
  Portuguese bank account. Until then `payment_mode` stays `off` and students pay
  her directly, as they already do.
- **Fiscal documents.** She must issue a fatura-recibo per lesson, and CIVA art.
  36.º gives 5 working days from the lesson. See
  `Documents/Work/Português com a Inês/Billing and Booking - Operating Context
  and Options.md` for the full position, including the unresolved IVA exemption
  code.
- **Reminders** before a lesson.
- **Two-way Google Calendar sync**, once OAuth verification is worth doing.

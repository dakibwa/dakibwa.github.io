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
Inês on /schedule                     (her own account, role=teacher)
  → GET/POST /admin/availability, /admin/exceptions
  → GET  /admin/bookings, /admin/students
  → POST /admin/bookings                             add a lesson for someone
  → POST /admin/bookings/:id/reschedule | /cancel
Stripe → POST /stripe/webhook                        signature-verified
```

## Who can do what

Booking, and managing your own lessons, needs an ordinary account. The admin
endpoints additionally need either `role = 'teacher'` on that account or the
shared `ADMIN_TOKEN`.

Inês signs in as herself — there is no second password to remember, and what she
does is attributable rather than anonymous. The token stays as the way back in
if she is ever locked out. Granting the role is a deliberate manual step:

```sql
UPDATE students SET role = 'teacher' WHERE email = '...';
```

Her own bookings are checked for clashes only, not against her published hours
or the notice window. Those exist to shape what students may choose; she is the
one deciding, and fitting a lesson in outside them is a normal thing for her to
do. A double booking is never intended, so that is still refused.

Adding a lesson for someone who booked another way creates their account if it
does not exist, with no password — they set one through "forgot password" when
they first want to manage the lesson themselves. They receive the same
confirmation, calendar invitation and manage link as if they had booked it.

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
  Google renders that button itself and will not be styled, so the coral button
  a student sees is ours and Google's own is stretched over it at zero opacity.
  The click, the ID token and the Worker's verification are all still Google's;
  only the paint is hers. It means the button's hit area has to be checked
  whenever its size changes — Google sizes its own to 40px and its own width,
  and anything it does not cover is coral that looks like a button and is not.
- **Only one JavaScript origin is registered**: `https://portuguesewithines.com`.
  Google's ID-token flow consults that list and ignores the redirect URIs, so the
  button renders anywhere but can only complete there. Local development and the
  `dakibwa.github.io` preview both ship the client id and both fail on click
  until their origins are added to the OAuth client.
- **Which tab leads follows who is likely to be there.** At the end of a booking
  the panel opens on *Create an account*, because almost nobody reaching that
  step has booked before; `/my-lessons` and `/schedule` open on *I have an
  account*, because nothing but a returning student arrives there. The two tabs
  sit in the same order everywhere — creating first — so only the selection
  moves, never the layout.
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
- **Booking confirmation leads to `/my-lessons`, not to the inbox.** Every lesson
  a student has booked is already in their own area, and they are signed in by
  the time they get there — telling them to keep an email was the older, thinner
  story. The emailed link is still offered beside it for that one lesson, because
  it is the route that survives a forgotten password.

### Repeating bookings

A student can hold the same slot every week: 4, 8 or 12 weeks, or open-ended
until they stop it.

- **The occurrences are ordinary rows in `bookings`.** A series is only the
  recipe that made them. That is what puts the time in Ines's calendar for real,
  and it means every per-lesson behaviour already built keeps working without
  knowing series exist — the manage link, the iCalendar `UID` and `SEQUENCE`,
  the same-day fee, moving one week for a dentist appointment.
- **The slot is stored as a Porto weekday and minute-of-day, not a UTC time.**
  A run booked in October crosses the change to winter time; holding the UTC
  instant would move every later lesson an hour earlier than the student agreed
  to. Occurrences are stepped by date, so 18:00 stays 18:00.
- **A week that is not free is skipped, not fatal**, and the student is shown
  which weeks before they confirm rather than after. One holiday in week six
  must not stop someone booking the other eleven.
- **Series occurrences ignore `booking_horizon_days`.** That horizon stops a
  stranger reaching in and taking a slot months out; a student keeping their own
  standing time is the case it is meant to allow. At the current 30 days, a
  twelve-week booking would otherwise have quietly become a four-week one.
- **One email each way, carrying every lesson in one calendar file**, each event
  under its own booking's UID so a later change to one week still matches the
  entry already in her calendar. Twelve lessons must not mean twelve emails.
- **Open-ended series are topped up by a nightly cron**, not on a page view: her
  calendar has to be right whether or not anyone has opened the site, and a read
  path that quietly writes bookings is impossible to reason about later.
- **Stopping a repeat keeps the lessons already booked.** Someone who stops
  repeating almost always still means to attend the ones in their calendar;
  cancelling those silently would be the worse of the two mistakes. Passing
  `cancelRemaining` cancels them too. The lessons page asks for confirmation
  before it calls the stop endpoint, and states this distinction while the
  student can still choose to keep the repeat.
- **A run under prepayment charges its first lesson now and the rest charge
  themselves.** The first checkout saves the card (`setup_future_usage`, with
  Stripe's own consent wording on the form); the whole run is held until that
  payment lands, then the webhook confirms it — first lesson `paid`, the rest
  `scheduled`. Each scheduled lesson is charged to the saved card by the cron
  on the morning of its own day. Open-ended runs work the same way: every
  topped-up occurrence of a `prepaid` series is born `scheduled`. A declined
  charge marks the row `payment_due`, emails the student a hosted pay-now
  link, and tells Inês — the lesson stands either way.

### Changing your name or email

- **Name changes straight away; the address you sign in with does not.** A new
  address is mailed a single-use, one-hour link and nothing moves until that link
  comes back — an address change that takes effect on assertion alone is a way to
  point your account at someone else's inbox. The address on file is told a
  change was requested, because it is the one that would notice a request nobody
  made.
- **The answer is the same whether or not the new address is already in use.**
  Saying "that one exists" would make this a way to test who has an account,
  which sign-in and forgotten-password already go out of their way not to reveal.
  Nothing is written and nothing is sent when it is taken.
- **Google sign-in matches on the Google account id, not the address.** Matching
  on email alone and overwriting `google_sub` was an account takeover: point your
  own row at an address someone else uses with Google, and their next sign-in
  hands you their account with your password still on it. Email is kept only as a
  fallback for someone who registered with a password first, and never claims a
  row already linked to a different Google account.
- On a confirmed change, outstanding password resets are deleted — a live reset
  link sitting in the old mailbox would otherwise stay valid for its hour — and
  future lessons are re-addressed. Past and cancelled lessons keep the address
  they were taken under, which is the record of what happened.

### How far ahead you can book

`booking_horizon_days` is **90**. She reserves the right to move a lesson, so a
student booking three months out costs her a conversation rather than a lost slot.

- The front end asks for a window wider than the horizon and lets the Worker
  clamp it. It used to ask for a fixed 62 days while sizing the grid from whatever
  horizon the API reported, so raising the horizon past 62 would have drawn weeks
  of empty cells saying "no times free" — a lie rather than a gap.
- **When she moves a lesson, the emails now say so.** They used to go out in the
  student's own voice — "that's done" — and tell her the student had moved it. A
  longer horizon means more lessons she may need to move, so this had to be right
  before the horizon was widened, not after.

### What stops two people booking one lesson

The availability check and the insert used to be two statements with nothing
between them, which is a race, and not a theoretical one — under load, four
different students were confirmed into the same lesson in testing.

- **The decision and the write are one statement.** A booking row is inserted
  only if nothing overlapping exists, and zero rows affected is the 409. The
  same guard is on rescheduling and on every occurrence of a series.
- **Overlap, not equality.** Lessons are 60 and 90 minutes on a 30-minute grid,
  so a 90-minute lesson at 17:00 and a 60-minute one at 17:30 collide while
  starting at different times. A unique index on the start time would miss that.
- A series occurrence that loses the race becomes a skipped week rather than a
  failed booking: the rest of the run is still worth having.

### Notes on the email and calendar output

- **Everything a student typed is escaped.** Four fields reached the HTML raw so
  that callers could pass `<br>` — meaning a name, an address or a lesson note
  arrived in Inês's inbox as markup, and she is the one person who reads every
  one of these. Callers now send `\n` and the template turns it into a break.
- **`CN=` is a parameter, not a text value.** iCalendar text escaping is wrong
  there — a semicolon starts the next parameter and a colon ends the list — so a
  student's own name could forge calendar properties or cut the address off the
  ATTENDEE line. Parameter values are quoted per RFC 5545 §3.1 instead.

### When email fails

Email is best-effort, but "best effort" used to mean "one attempt, and silence".

- **A failed send is retryable.** The log row was written before the send and left
  behind on failure, so the unique key made every later attempt return "already
  sent" without sending. A message Resend rate-limited was lost for good, and the
  caller was told it succeeded.
- **There is now a sweep.** The nightly cron re-sends failed rows older than five
  minutes. Only a booking's own confirmation can be rebuilt — the body is not
  stored — so anything else stays in the log for a person to look at.
- **A cancelled run is one email, not one per lesson.** Stopping a twelve-week
  series fired twenty-four requests at the provider in the same instant; behind a
  2/second limit, twenty-two were dropped and never retried.
- **A database error is not a duplicate.** Any write failure used to be reported
  as "already sent"; only a unique-constraint violation means that now.

### The no-show policy

For a prepaid lesson: not coming forfeits it — the lesson was paid for and the
slot was held, so there is nothing to charge and nothing to do. For a booking
made before prepayment (`payment_status = 'not_required'`), nothing: the €10
no-show fee was retired on 28 August 2026. The €5 same-day change fee remains
the one fee that exists, stated wherever changes are offered.

- **Nothing in the system charges it.** `payment_mode` is off and payment is
  made on the day, in person with Inês, so this is stated policy she applies or
  waives — not something the site collects. There is no no-show flag on a
  booking and no handler that sets one.
- **It is a flat €10.** It was "half the lesson" until 27 August 2026 — a share,
  because the three lessons are €20, €25 and €35 and one figure would have been
  wrong for two of them — but Dan set it to a flat €10, which is simpler to say
  and simpler to apply. The copy states the euro number everywhere; if the
  policy changes again, the places to update are the booking page's policy band,
  the confirm-form note, the confirmation screen, the two Worker email footers,
  and the FAQ.
- **It is said before booking, not only after.** A charge someone first learns
  about by being charged is the kind that costs a relationship. It appears on the
  booking page's policy band, directly above the confirm button, on the
  confirmation screen, in the confirmation email, and in the FAQ.

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
- an abandoned checkout releases its slot when the hold expires, and a series
  whose checkout was abandoned loses its orphaned `booking_series` row in the
  same sweep.

**The prepaid change policy** (Dan, 28 August 2026, `policy.mjs` is the single
home): commitment locks the lesson's own Porto day. A single lesson is paid at
booking; a run pays its first lesson at booking and each later lesson goes to
the saved card on the morning of its own day. Until that day any lesson moves
freely; cancelling ahead refunds a paid lesson in full — the refund is issued
*before* the row is cancelled, and Stripe's "already refunded" answer is
treated as success so a retried cancel completes rather than double-paying —
and a not-yet-charged lesson is simply never charged. On the day itself a
student can neither move nor cancel: paid or scheduled, the lesson happens or
the money goes out regardless. No same-day fee, no no-show fee, nothing to
collect. Inês is never locked — her cancellation refunds the student in full
at any hour, and the emails tell both sides what the money did. Bookings from
before the switch carry `payment_status = 'not_required'` and keep the fee
terms they were booked under until they wash through. The card itself never
touches the database — Stripe keeps it; `students` holds only the opaque
customer and payment-method ids (migration 0009).

**Trial lessons are first lessons.** Anyone with a booking that wasn't
cancelled is refused the trial at creation, kindly, and pointed at a single
lesson. This is live now, independent of payment mode.

Stripe is used because Square does not serve Portugal, and because Stripe carries
MB WAY and Multibanco natively — between them the majority of Portuguese online
payments. `sk_test_` keys work identically, which is how this is exercised
before Inês has her own account.

**The account structure** (Dan, 28 August 2026, settled after costing both
routes): **Inês's own Stripe account, with Dan as Administrator** — cheapest
fees (no Connect platform surcharges), EUR settlement on a Portuguese account,
her name on statements natively, and Dan runs everything day-to-day through
the Administrator role and the account's API keys. The signup is ~10 minutes
together: her name, email, ID and IBAN; then she invites Dan as Administrator
and he takes it from there. Scheduled for 29 August 2026.

The Connect routing built into `stripe.mjs` (destination charges via
`STRIPE_CONNECTED_ACCOUNT`) stays dormant as the documented alternative — it
would route money from a platform account to hers automatically, at ~€2/month
plus 0.25% + €0.10 per payout and a UK→PT cross-border wrinkle. Leave its
config field empty on the chosen route.

**Payment methods**: enable **cards** and **MB WAY** (instant confirmation, so
the existing `checkout.session.completed` flow just works; Stripe only offers
it on single lessons because MB WAY cannot save payment details, which is
exactly right — weekly runs must be card-only for the automatic charges).
Leave **Multibanco OFF**: it is a voucher paid later at an ATM or bank,
confirmation can take days, which fights the 35-minute slot hold, and its
money arrives on `checkout.session.async_payment_succeeded`, which this
webhook deliberately does not handle. Enabling it is a real follow-up build,
not a dashboard toggle.

**Go-live checklist**:

1. ~~Apply migration 0009 to the live database~~ — done, 28 August 2026.
2. Open Inês's Stripe account together (her identity, her IBAN); she invites
   Dan as **Administrator**. In its dashboard: enable MB WAY in payment-method
   settings; leave Multibanco off (above). `STRIPE_CONNECTED_ACCOUNT` stays
   empty.
3. Put `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in as Worker secrets
   (test keys first). `STRIPE_UI_MODE` is already `embedded` in wrangler vars.
4. Set the repository variable `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for the
   Pages build, so the embedded form can mount.
5. Register the webhook for `checkout.session.completed` at `/stripe/webhook`.
6. Run the full test-mode journey: book a single (embedded form mounts on the
   page), pay with a test card, watch the webhook confirm; cancel ahead of the
   day and watch the refund. Book a weekly run: first lesson charges, the rest
   go `scheduled`; run the cron by hand (`wrangler dev --test-scheduled`) on a
   lesson's day and watch the saved card charge; kill the saved card in the
   Stripe dashboard and watch the decline turn into a pay-now email.
7. Set the `payment_mode` settings row to `prepay`, and in the same breath ship
   the static-copy commit (FAQ, policy band, lessons note, and the README payment bullets) that states the
   prepaid terms — the page's dynamic copy follows the API on its own, the
   static prose does not.
8. Swap to live keys and repeat the single-lesson journey with a real card
   before telling anyone.

### Same-day changes

Two regimes, keyed on the booking's own payment status so promises made at
booking time are kept:

- **Paid**: there are no same-day changes. `changePolicy` locks the lesson's
  Porto day — the manage page and /my-lessons say so instead of offering the
  buttons, and the endpoints refuse with the same words for anyone who kept an
  old tab open. `same_day_change` is never set on a paid row.
- **Booked before prepayment**: students may move or cancel right up to the
  lesson start. A change on the lesson's own Porto date sets `same_day_change`,
  warns the student on `/booking/` before they act, marks their confirmation,
  and subjects Inês's mail **"Same-day change"** so she collects the €5 at the
  lesson — by her in person, because those bookings have no payment to charge
  against.

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
| `ADMIN_TOKEN` | Fallback way into `/schedule` if she is locked out of her account. |
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

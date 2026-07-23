# Português com a Inês

The production website for Inês Dias Baía’s one-to-one European Portuguese
lessons, online or in Porto.

The approved editorial direction is implemented as five responsive routes:

- `/` — Home
- `/approach` — teaching approach and confirmed credentials
- `/lessons` — lesson formats and prices
- `/faq` — booking, lesson, location, payment, rescheduling, and level answers
- `/book` — live Square-hosted booking with a direct secure fallback

The canonical reference images, editable Figma link, and full implementation
plan live in
[design/canonical-site-direction](./design/canonical-site-direction/README.md).
The PNGs define visual intent; the production interface is code-native.

## Sources of truth

- Git owns the website, route behaviour, release history, and production assets.
- Square owns live availability, appointment confirmation, checkout, and
  booking-management state.
- The approved product display is trial lesson €25 / 45 minutes, single lesson
  €45 / 60 minutes, and five lessons €210 / 60 minutes each. Square shows the
  final appointment details and total before confirmation.
- The current rescheduling rule is free before the lesson day, with a €5 fee for
  a change made on the lesson day in Porto time. Production uses manual
  enforcement until a provider-backed exact rule exists.

## Run and verify

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Smallest relevant checks:

```bash
npm run typecheck
npm run lint
npm run check:booking
npm run test:flow
npm run build
```

`test:flow` expects a running static or development server. Set
`QA_BASE_URL` when it is not `http://localhost:3000`.

## Booking configuration

Copy `.env.example` to `.env.local` and provide the production Square URL:

```bash
NEXT_PUBLIC_BOOKING_MODE=square-hosted
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://book.squareup.com/appointments/...
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=45
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
NEXT_PUBLIC_RESCHEDULE_FEE_MODE=manual
```

Hosted mode renders the Square booking route inside `/book` and always exposes
an “Open secure booking” link so students can recover if third-party embedding
or cookie controls prevent the calendar from appearing.

The dormant custom calendar remains in the repository for a future
secret-backed Worker. Do not set `custom-square` in production until the Worker
is deployed, its `/health` endpoint returns `ok: true`, and booking completion
has been tested against Square. Never put Square access tokens in this static
site. See [docs-square-custom-booking.md](./docs-square-custom-booking.md).

## Publication

The repository’s GitHub Pages workflow publishes `main` to
`https://dakibwa.github.io/`.

The branded public route `https://akibwa.com/portugal/` is a base-path build
copied into the Akibwa website repository at `public/portugal/`:

```bash
NEXT_PUBLIC_SITE_BASE_PATH=portugal \
SITE_BASE_PATH=portugal \
NEXT_PUBLIC_BOOKING_MODE=square-hosted \
npm run build
```

Sync the resulting `out/` directory into a clean Akibwa worktree, run the
Akibwa publication checks, publish that repository, and verify all five nested
routes on the real custom domain. GitHub and the live destinations, not a local
build, are the publication proof.

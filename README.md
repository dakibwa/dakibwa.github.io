# Português com a Inês

The production website for Inês Dias Baía’s one-to-one European Portuguese
lessons, online or in Porto.

The approved dark-blue, lilac, cream, and splatty direction is implemented as
five responsive routes:

- `/` — Home
- `/approach` — teaching approach and confirmed credentials
- `/lessons` — lesson formats and prices
- `/faq` — booking, lesson, location, payment, rescheduling, and level answers
- `/book` — the booking calendar
- `/booking` — where a student moves or cancels one lesson (noindex, reached from
  the link in their confirmation email)
- `/my-lessons` — every lesson a signed-in student has (noindex)
- `/reset-password` — reached from a reset email (noindex)
- `/schedule` — Inês's own view: teaching hours, days off, and what is booked
  (noindex, access key required)

Every route carries a booking action within reach of its closing content, not
only in the header: the home page closes on one, and the FAQ ends with a route
to booking alongside the WhatsApp option.

The canonical editable design is the
[Português com a Inês Figma file](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y).
[design/README.md](./design/README.md) records the current visual rules,
retained business-card references, production-asset boundary, and location of
superseded work. The production interface is code-native.

## Asset weight

`public/visuals/` assets are sized to the slot they render into, not to their
source resolution. Two worth knowing about:

- The wordmark is only ever a CSS `mask-image` over `currentColor`, so the
  browser discards its RGB channels. It ships as an alpha-only WebP at 760px
  (the header renders 380px) rather than a 900px RGBA PNG — 45KB to 22KB.
- The hero splat renders 720x660 under `object-fit: cover`, so the desktop
  source is 1100px wide rather than 1540px — 174KB to 95KB. Do not re-encode
  the mobile variant: it is already at its floor and a second lossy pass makes
  it larger.

## Delivery

Two settings look incidental and are not. Both were wrong at some point and
cost real bytes:

- `public/_headers` marks `/_next/static/*` immutable for a year. Without the
  file Cloudflare Pages falls back to `max-age=14400, must-revalidate`, so the
  fonts, stylesheet and JS chunks revalidate on any visit more than four hours
  after the last one — round trips that can only return 304, since every one of
  those filenames already carries a content hash.
- The wordmark preload in `src/app/layout.tsx` must keep its `crossOrigin`.
  Because the wordmark arrives as a CSS `mask-image`, and CSS fetches images in
  CORS mode, a preload without it is discarded rather than reused and the file
  downloads twice. Chrome reports this as "a preload ... is not used because the
  request credentials mode does not match". Verify with a single `wordmark-cream`
  entry in `performance.getEntriesByType('resource')`, initiated by `link`
  rather than `css`.

The paper grain is deliberately not preloaded: it is 480 bytes, so an early
request only competes with the fonts for no gain.

## Sources of truth

- Git owns the website, route behaviour, release history, and production assets.
- **Her print and business material is not in this repository.** Branding,
  business cards, Square booking tiles, visual concepts and the superseded-work
  archive live in `/Users/danatkinson/Documents/Work/Português com a Inês`,
  which has a `README.md` pointing back here. That folder is backed up by
  Google Drive; this repository is backed up by GitHub. The split exists
  because a `.git` directory inside the Drive-synced `Documents` tree risks
  corruption, not because the work is separate.
- The canonical editable design is the Figma file linked from
  [design/README.md](./design/README.md). Read that before changing anything
  visual.
- **Booking is owned by this repository**, not by a third-party scheduler. The
  `ines-booking` Worker in `workers/booking/` and its D1 database are the source
  of truth for availability, bookings, reschedules and cancellations. See
  [docs-booking-system.md](./docs-booking-system.md).
- Square was removed in August 2026. Square does not onboard sellers in
  Portugal, so the account this site pointed at — Dan's UK account, set up as a
  test — could never have been hers.
- There is no payment rail yet. Students pay Inês directly, as they already did.
  Stripe supports Portugal and is the intended route; it needs her own account.
- The approved product display is trial lesson €20 / 60 minutes, single lessons
  at €25 / 60 minutes or €35 / 1 hour 30 minutes. Bundles are not part of the
  public launch offer. Existing students retain their individually agreed
  legacy €20 / €30 pricing, which is not advertised publicly.
  The Worker's `lesson_types` table decides what is actually bookable; the
  lessons page is the copy a visitor reads. Keep the two in step.
- The rescheduling rule is free before the lesson day, with a €5 fee for a change
  made on the lesson day in Porto time. The Worker detects a same-day change,
  warns the student before they confirm it, and emails Inês a notice subjected
  "Same-day change" — she collects the fee at the lesson. Nothing charges it
  automatically, because there is no payment rail to charge against.

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
npm run test:booking   # Worker logic: DST, iCalendar, manage-link signing
npm run check:booking  # release gate — the booking API must be healthy
npm run test:flow
npm run build
```

`test:booking` needs neither a server nor a network. It covers the parts that
are genuinely easy to get wrong: the 23- and 25-hour DST days, iCalendar folding
of accented text at 75 octets, and rejection of tampered manage links.

`test:flow` expects a running static or development server. Set
`QA_BASE_URL` when it is not `http://localhost:3000`.

## Accessibility

Every route renders the site header and footer outside `<main>`, so `banner`,
`main`, and `contentinfo` are real landmarks, and each header opens with a
`Skip to content` link targeting `#main-content`.

The focus ring is a cream, deep-blue, and coral stack rather than a single
coral outline. A coral-only ring measures 2.2:1 on the blue hero and 1.5:1 on
the lavender panels; the layered ring keeps at least one band above 3:1 on
every surface colour the site uses.

Text colours are held to WCAG AA at 390, 768, and 1440 px. `--ink` is a shade
deeper than the `--blue-deep` fill because the fill colour measured 4.42:1 as
body text on lavender.

## Motion and loading

The entrance fade — opacity only, 170 ms on mobile, 220 ms on wider screens —
runs once, on first arrival. Internal navigation is instant: the old
click-interception that held every route change for 80–110 ms to play an exit
fade was removed in August 2026 as felt lag, and `RouteMotion` now only marks
the first in-app navigation so the CSS can skip the entrance animation from
then on. There is no overlay, movement, scale, or staggered hero animation.
`prefers-reduced-motion: reduce` removes the entrance animation, smooth
scrolling, and the button and navigation hover transforms, keeping colour
changes so states stay distinguishable.

Hero artwork is served as AVIF with a WebP fallback — the painterly splats
cost less than half as much in AVIF as they did in WebP — and fetched
eagerly, with dedicated
800 px sources for screens up to 720 px and preload links for the priority
hero on each page; non-critical marks load lazily. The display font is
preloaded because every page's largest text is a Beth Ellen headline. The
booking calendar renders from this site's own JavaScript against the booking
Worker, so there is no third-party iframe to wait on.

## Booking configuration

Copy `.env.example` to `.env.local` and point the site at the deployed Worker:

```bash
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking.<subdomain>.workers.dev
NEXT_PUBLIC_GOOGLE_CLIENT_ID=          # optional; absent hides the Google button
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=    # optional; needed for the embedded payment form once prepay is on
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=60
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
```

With no API URL the booking page degrades to its setup placeholder and sends
students to WhatsApp, rather than rendering a calendar that cannot work.

`npm run check:booking` is the release gate. It fails the build when the API is
unreachable, has no lesson types, or is still in dry-run email mode — because a
site that confirms bookings while silently sending no confirmations is worse
than one that is visibly down. No secret belongs in this static site or in any
`NEXT_PUBLIC_` variable: the Worker holds them all.

Full architecture, the reasoning behind not using the Google Calendar API, and
the deployment steps are in [docs-booking-system.md](./docs-booking-system.md).

## Publication

The canonical production site is deployed to Cloudflare Pages at
`https://portuguesewithines.com/`. The Portuguese-spelling domain
`https://portuguescomaines.com/` redirects to the canonical domain while
preserving the requested path and query string.

**Merging to `main` publishes the site.** `.github/workflows/deploy-pages.yml`
builds once and deploys that build to Cloudflare Pages, which is what the live
domains serve. The same build also goes to GitHub Pages at `dakibwa.github.io`
as a preview, so the two cannot drift.

This needs two repository secrets, under Settings → Secrets and variables →
Actions. Without them the publish job fails loudly rather than skipping, because
a silent skip is indistinguishable from a completed release:

- `CLOUDFLARE_API_TOKEN` — a token with the **Cloudflare Pages: Edit**
  permission on this account.
- `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard URL, or
  `npx wrangler whoami`.

To publish by hand — a local check, or CI being unavailable:

```bash
npm run deploy:cloudflare
```

Until August 2026 that manual command was the *only* way to publish, and it is
worth knowing the failure it caused. Pushing to `main` updated only the preview,
so a release could look complete from every angle that is normally checked —
commit on `main`, Actions green, `dakibwa.github.io` showing the change — while
visitors were still served the previous build. If you are ever verifying a
release here, check `https://portuguesewithines.com/` itself, not the workflow
result and not the preview.

The alias is a separate Pages redirect project so it cannot accidentally serve
a duplicate copy of the site. It is not part of the workflow, since its
configuration changes only rarely; deploy it with
`npm run deploy:cloudflare:redirect`.

The Akibwa website does not contain a copy of this build. Its Portuguese with
Inês project card and former `/portugal/` route point to the canonical site.

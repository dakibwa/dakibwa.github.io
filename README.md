# Português com a Inês

The production website for Inês Dias Baía’s one-to-one European Portuguese
lessons, online or in Porto.

The approved dark-blue, lilac, cream, and splatty direction is implemented as
five responsive routes:

- `/` — Home
- `/approach` — teaching approach and confirmed credentials
- `/lessons` — lesson formats and prices
- `/faq` — booking, lesson, location, payment, rescheduling, and level answers
- `/book` — live Square-hosted booking with a direct secure fallback

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
- Square owns live availability, appointment confirmation, checkout, and
  booking-management state.
- The current Akibwa Square account requires full prepayment for fixed-price
  appointment services. Reconfirm that policy when the Portuguese Square
  account replaces it.
- The approved product display is trial lesson €20 / 60 minutes, single lessons
  at €25 / 60 minutes or €35 / 1 hour 30 minutes. Bundles are not part of the
  public launch offer. Existing students retain their individually agreed
  legacy €20 / €30 pricing, which is not advertised publicly.
  Square shows the final appointment details and total before confirmation.
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

Internal route changes use opacity only: an 80 ms exit and 170 ms entrance on
mobile, or a 110 ms exit and 220 ms entrance on wider screens. There is no
overlay, movement, scale, or staggered hero animation. Base-path deployments
strip their prefix before handing a route to Next.js so navigation never
duplicates `/portugal`. `prefers-reduced-motion: reduce` removes the route
animation, smooth scrolling, and the button and navigation hover transforms,
keeping colour changes so states stay distinguishable.

Hero artwork is served as compressed WebP and fetched eagerly, with dedicated
800 px sources for screens up to 720 px; non-critical marks load lazily. On the
booking page, the third-party hosted calendar is lazy on narrow screens and
the dormant custom Square calendar is fetched only when `custom-square` mode
is actually enabled.

## Booking configuration

Copy `.env.example` to `.env.local` and provide the production Square URL:

```bash
NEXT_PUBLIC_BOOKING_MODE=square-hosted
NEXT_PUBLIC_SQUARE_BOOKING_URL=https://book.squareup.com/appointments/...
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=60
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

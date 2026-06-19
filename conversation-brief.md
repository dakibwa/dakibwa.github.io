# Conversation Brief

This project began in the wrong scratch folder:

`/Users/danatkinson/Documents/Akibwa/projects/ines-portuguese-lessons`

The app was then moved into the correct repository:

`/Users/danatkinson/Documents/Inês Dias Baía`

## Original Goal

Build a friendly, colourful website for Inês Dias Baía, a Portuguese teacher in Porto who teaches from the premises of Epoca Cafe.

The site should communicate her teaching style and make booking easy for students.

## Product Direction

Keep the public product simple:

- One landing page at `/`.
- One booking page at `/book`.
- No separate teacher portal in v1.
- No custom student login or booking backend in v1.
- No detached "go manage this somewhere else" workflow in the student experience.

The booking page should feel integrated into the website, not like a separate tool bolted on afterwards.

## Booking Decision

Use Cal.com as the booking source of truth because it is simpler to maintain than a custom booking system and avoids a monthly subscription for this v1.

Cal.com should handle:

- Live availability.
- Student rescheduling and cancellation links.
- Stripe payment during booking.
- Calendar sync.
- Confirmation and reminder emails.

The site should embed Cal.com inline when `NEXT_PUBLIC_CALCOM_LINK` is configured. If it is not configured, the fallback should be friendly and non-technical.

## Design Feedback

The first version felt too "AI slop coded": too many boxed panels, visible setup language, and detached workflows. The desired direction is more polished, integrated, and beautiful.

Use Dan's Akibwa site as a useful design reference: more editorial confidence, stronger typography, calmer composition, less obvious template scaffolding.

Keep the colourful personality, but avoid letting the page become a generic playful SaaS layout.

## Current Implementation

The moved app currently includes:

- Next.js App Router.
- `src/app/page.tsx` for the landing page.
- `src/app/book/page.tsx` for the booking route.
- `src/components/BookingFlow.tsx` for the integrated booking page.
- `src/app/globals.css` for the visual system.
- `scripts/qa-flow.mjs` for smoke testing the two-page flow.

Expected routes:

- `/` returns `200`.
- `/book` returns `200`.
- `/portal` returns `404`.

## Next Useful Pass

Redesign the visual system inside this repo, not the old scratch folder.

Primary target:

- Make `/book` feel like an elegant continuation of the landing page.
- Use fewer heavy card blocks.
- Use better typography and spacing.
- Keep the Cal.com embed central and integrated.
- Preserve the two-page structure unless the product direction changes.

## Validation So Far

From `/Users/danatkinson/Documents/Inês Dias Baía`:

- `npm install`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:flow`

The local dev server was last run from the correct repo at:

`http://localhost:3000`

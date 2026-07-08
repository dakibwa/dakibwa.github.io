# Future Perfect Site Brief

Use this brief when starting the next serious rebuild of the Inês Portuguese lessons website.

## First Instruction

Before writing UI code, inspect:

- `design/README.md`
- `docs-design-reset-audit-2026-07-07.md`
- `docs-future-perfect-site-brief.md`
- `README.md`
- `docs-production-plan.md`
- `docs-square-custom-booking.md`

Then inspect the live asset folder:

```bash
find design public -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.svg' \) | sort
```

Do not assume any old `/public/visuals` asset exists unless the file is physically present.

## Design Source Of Truth

The visual source of truth is `design/primary-brand-direction.png`.

The usable retained assets are:

- the green and blue business cards in `design/business-cards/`;
- the sticker sheet in `design/stickers/`;
- the brand board itself as a reference, not as interface artwork.

The sticker sheet is a composite JPEG from WhatsApp, not individual transparent sticker assets. If stickers are needed as production elements, make a review sheet first and get approval before cutting/exporting standalone files.

## Brand Direction

The site should feel handmade, practical, personal, and Porto-rooted. It should not feel like a generic SaaS page.

Use the board language:

- deep green structure;
- warm paper background;
- lavender brand moments;
- coral for main actions only;
- azulejo blue as a small detail, not the main theme;
- confident, simple type hierarchy;
- restrained sections with strong composition rather than many decorative cards.

Avoid:

- stock-like generated photos;
- one-note blue or purple pages;
- over-boxed layouts;
- decorative clutter;
- visible setup/explainer text inside the UI;
- rebuilding booking/payment architecture during a design pass.

## Content Shape

Preserve the simple product:

- `/` landing page;
- `/book` booking page;
- `/faq` practical questions.

The first viewport should quickly communicate:

- Portuguese lessons in Porto and online;
- one-to-one, practical, personal lessons;
- native speaker / local Porto context;
- clear booking action.

Do not turn the homepage into a marketing landing page with abstract hero art. Build the actual useful student-facing site.

## Booking Boundary

The current repo docs and code describe Square/custom Square as the active implementation direction, with hosted Square and Acuity/Cal.com fallback support. Older history and memory may mention Cal.com or Acuity decisions.

Before changing booking behavior, verify the current provider decision with Dan/Inês. Do not add custom Stripe, Square, or booking secrets to this static Next.js app. Private booking API work belongs in the separate Worker described in `docs-square-custom-booking.md`.

For a design-only pass, keep the booking architecture intact and improve only the presentation.

## Asset Workflow

Use this sequence:

1. Start from the six retained files under `design/`.
2. Decide which assets the page actually needs.
3. Export/copy only those approved production assets into `public/visuals/`.
4. Update code references to match real files.
5. Keep source files in `design/` and browser-served files in `public/visuals/` distinct.
6. Generate new bitmap assets only after explicit approval and a contact-sheet review.

## Verification

Before calling the next rebuild done, run:

```bash
npm run lint
npm run typecheck
npm run build
```

Then verify in browser at desktop and mobile widths:

- no missing images;
- no horizontal overflow;
- no overlapping text;
- booking route renders;
- FAQ route renders;
- the visual design clearly matches the brand board.

Save screenshots for review and compare against `design/primary-brand-direction.png`.

## Handoff Prompt

When using a future model/session for the final version, start with:

```text
Read design/README.md, docs-design-reset-audit-2026-07-07.md, docs-future-perfect-site-brief.md, README.md, docs-production-plan.md, and docs-square-custom-booking.md. Use only the retained design assets unless I approve new assets. Do not revive deleted public visuals or generated photo attempts. Build a polished Porto Portuguese lessons site around the brand board, preserving the booking architecture unless I explicitly change it.
```

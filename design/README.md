# Brand and Canonical Site Direction

The brand source of truth is:

- `design/primary-brand-direction.png`
- `design/business-cards/green-card-front.png`
- `design/business-cards/green-card-back.png`

Use the source exports in `design/business-cards/` when a page needs a production asset. Export to `public/visuals/` only when a specific site implementation needs a browser-served copy.

## Canonical website direction

The five approved page images in `design/canonical-site-direction/` are the
visual target implemented by the current website:

1. `01-home.png`
2. `02-approach.png`
3. `03-lessons.png`
4. `04-faq.png`
5. `05-booking.png`

Start with `design/canonical-site-direction/index.html` for the complete set and
`design/canonical-site-direction/IMPLEMENTATION-PLAN.md` for the controlled
design-to-code route. The editable design source is
[Português com a Inês — Canonical Website](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y).

These PNGs are reference images, not production interface assets. Their
typography, grids, rules, motifs, responsive behaviour, and interaction states
are recreated in code; the screenshots are not shipped as the interface.

All generated photo-style attempts, duplicate public copies, duplicate SVG
exports, and older visual experiments remain outside the approved production
asset set. The retained brand baseline is the original business card artwork,
the full brand board reference, and the sticker sheet from Downloads.

Sticker source:

- `design/stickers/sticker-sheet-whatsapp-2026-07-06.jpeg`

Core rules:

- Keep the original wordmark from the board.
- Lead with green, paper, lavender, and a small coral action accent.
- Use blue only for azulejo detail.
- Keep UI text code-native; do not ship full board screenshots as interface.
- Do not add generated imagery back without an explicit keep/delete review.

## Exploration archive

The business-card-led comparison and three responsive homepage directions live
in `design/mockups/`. They are design studies only and do not alter the current
production routes or booking behaviour. Start with `design/mockups/index.html`.

Additional generated directions under `design/generated-concepts/` are
exploration only. They must not override the canonical five-page set without an
explicit new design decision.

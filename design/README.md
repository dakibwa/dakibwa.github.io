# Current visual direction

The canonical editable design is the
[Português com a Inês Figma file](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y).
Use its approved desktop and mobile frames as the visual specification. Git
owns the production implementation and the browser-ready assets actually used
by the site.

The current direction is:

- dark blue (`#2c54aa` and `#203e82`), lilac (`#aaa4e6`), warm cream
  (`#f5ecd9`), and a small coral accent (`#ef5d3c`);
- organic, irregular, splatty marks rather than geometric emblems;
- Beth Ellen for expressive display text;
- Montserrat for body copy, navigation, labels, and other readable UI text;
- generous spacing and strong contrast, with no horizontal lines baked into
  the artwork.

## Contrast corrections pending Figma reconciliation

Three visible colour values were corrected in code on 2026-07-24 as
accessibility fixes and still need reconciling into the canonical Figma file:

- the second half of the Approach page heading (`way to learn.`) moved from
  cream to `--blue` on the lavender panel. Cream measured 1.95:1 there, so half
  the heading was barely readable; blue on lavender holds 3.2:1, the same tonal
  relationship the home hero already uses for lilac on blue;
- body ink deepened from `#203e82` to `#1a3169`, and the eyebrow lilac from
  `#6a63aa` to `#665fa6`, so small text clears AA on the lavender and cream
  panels. Both are imperceptible on cream and neither changes a fill colour;
- the booking reassurance labels lightened from `#c8c3ef` to `#dcd8f5` to clear
  AA on the blue booking panel.

The `--blue`, `--blue-deep`, `--lavender`, `--paper`, and `--coral` fill
colours are unchanged.

## Figma reconciliation pending — 2026-08-31

Production now reflects Inês's 31 August feedback: the home hero no longer
contains the business-card artwork; the “Slow is fine” and “Talk first” marks
have generated replacements; the approved Home, Approach, Lessons, and FAQ
copy is in place; and the FAQ banner contains only its heading. The canonical
desktop and mobile frames still need the same updates because the authenticated
Figma Starter workspace had reached its MCP tool-call limit. A one-time
follow-up is scheduled for 1 September 2026. That reconciliation must also
replace every em dash in user-facing Figma copy and states with the natural
punctuation now used in production, and use “Beginners welcome.” rather than
“Nervous beginners welcome.” in the Approach callout. On desktop, the three
home principles now form a stacked soft-lavender rail in the right side of the
hero, using the space left by the removed card artwork without merging into
the surrounding cream page. At 900px and below they remain stacked after the
blue introduction so the mobile reading order stays unchanged. The browser
favicon is now a generated cream-and-lavender organic mark with a coral accent
on dark blue, replacing the flower symbol. Above 1000px, the Lessons page now
combines its closing booking prompt and payment note as one asymmetric blue and
soft-lavender composition rather than two full-width bars. At 1000px and below
they return to the simpler stacked order. Above 820px, the same soft-lavender
rail treatment separates the Approach teaching list and the FAQ index from
their cream content columns. At 820px and below those sections keep their
simpler cream stacked treatment. In the intermediate Approach layout from
821px to 999px, the teaching-list headings wrap naturally instead of being
clipped at the right edge; from 1000px upwards they remain on one line.

## References retained in this repository

`design/business-cards/` contains the original business-card exports. They are
historical brand references, not competing website specifications. The cleaned
blue business-card splat is retained for the generated social share image, but
the card artwork itself does not appear in the homepage interface.

`design/stickers/` contains the historical sticker sheet. Do not cut new
production assets from it unless a new asset is deliberately reviewed and
approved.

## Production assets

`public/visuals/` is production-only. Every file there must be referenced by
the current site:

- the social share-card splat and the approved page fields live in
  `public/visuals/generated-splats/`;
- the small splatty V2 emblems live in `public/visuals/v2-splats/` as SVGs or
  size-matched generated WebPs;
- the wordmark and paper texture support the shared site shell.

Do not keep contact sheets, rejected generations, alternate raster exports,
mockups, or unused candidates under `public/`.

## Motion direction

The editable route-motion contract is on `05 QA / 2026-07-24` in the canonical
Figma file, in the frame named
`Motion & loading QA / Fade only / Desktop + mobile / 2026-07-24`. It
specifies a short opacity-only transition, with faster mobile timings and no
overlay, transform, ambient loop, or decorative hero entrance. Reduced-motion
users navigate immediately without delay or animation.

Dan approved a production refinement on 2026-08-31: use that restrained
opacity treatment on every completed route change without delaying the click,
and let decisions inside the booking flow resize and dissolve the existing
calendar workspace rather than abruptly replacing the page. The code keeps the
rest of the page fixed and removes both effects under reduced motion. The Figma
frame still needs this refinement recorded when its Starter-plan tool-call
limit clears; until then this note and the implementation are the source for
the approved interaction behaviour.

The same Starter-plan limit blocked the approved booking-workspace refinement
on 2026-08-31, so this is the exact reconciliation contract for the next Figma
pass. Add a frame named
`Booking workspace / Unified desktop + mobile / 2026-08-31` and record these
production states:

- on desktop the blue introduction is a supporting rail, clamped between 300
  and 440 px at roughly 29% of the viewport; the cream booking workspace owns
  the remaining width;
- the signed-in identity, account controls, lesson choices, calendar, and
  selected-day workspace share the same left and right edges. Two lesson types
  divide the row evenly rather than reserving an empty third column;
- the calendar is the stable surface. A selected day reduces it to one week,
  with the day or lesson detail beside it on desktop and immediately below it
  on mobile. Collapsed history remains below the compact calendar instead of
  being pushed down by the height of the detail card;
- days with two bookings show both booked times on separate lines. Do not use a
  small `2x` count badge beside the date;
- primary coral and secondary outline actions share a 52 px height, Montserrat
  0.7 rem labels, 0.12 em tracking, and the same hand-drawn button radius.
  Tertiary text actions use the same type at 40 px minimum height. `Back to
  calendar` is tertiary; `Move this lesson` and `Cancel lesson` are the paired
  primary and secondary actions;
- transitions belong to the account, choice, calendar, detail, and confirmation
  surfaces individually. The page scrolls only when the next decision is not
  already comfortably visible. Reduced motion removes both the transitions and
  smooth scrolling;
- preserve the current mobile reading order and full-width stacked lesson
  choices. The mobile calendar must keep all seven columns and its legend inside
  the card after resize or orientation changes.

## Account interaction states

The editable confirmation shown before a student stops a repeating lesson is
on `05 QA / 2026-07-24`, in the frame named
`My lessons / Stop repeating confirmation / Desktop + mobile / 2026-08-29`.
It records the desktop and mobile arrangements, the two explicit choices, and
the promise that lessons already in the calendar stay booked.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.

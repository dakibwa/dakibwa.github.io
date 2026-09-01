# Current visual direction

This file is the canonical human-readable contract for the website's visual
direction, responsive composition, motion, and important interaction states.
Git owns the production implementation and browser-ready assets, and the
published site is the acceptance surface. When this contract and the site
diverge, reconcile them in the repository rather than maintaining a second
design system elsewhere.

The current direction is:

- dark blue (`#2c54aa` and `#203e82`), lilac (`#aaa4e6`), warm cream
  (`#f5ecd9`), and a small coral accent (`#ef5d3c`);
- organic, irregular, splatty marks rather than geometric emblems;
- Beth Ellen for expressive display text;
- Montserrat for body copy, navigation, labels, and other readable UI text;
- generous spacing and strong contrast, with no horizontal lines baked into
  the artwork.

## Contrast and accessibility

Three visible colour choices are required for accessible contrast:

- the second half of the Approach page heading (`way to learn.`) uses `--blue`
  on the lavender panel. Cream measured 1.95:1 there, while blue on lavender
  holds 3.2:1, the same tonal relationship the home hero uses for lilac on blue;
- body ink uses `#1a3169`, and the eyebrow lilac uses `#665fa6`, so small text
  clears AA on the lavender and cream panels. Both are imperceptible on cream
  and neither changes a fill colour;
- booking reassurance labels use `#dcd8f5` to clear AA on the blue booking
  panel.

The `--blue`, `--blue-deep`, `--lavender`, `--paper`, and `--coral` fill
colours are unchanged.

## Current responsive composition — 2026-08-31

The intended production state reflects Inês's 31 August feedback:

- the home hero does not contain the business-card artwork, and the “Slow is
  fine” and “Talk first” marks use their generated replacements;
- the approved Home, Approach, Lessons, and FAQ copy is in place; the FAQ banner
  contains only its heading; user-facing copy uses natural punctuation rather
  than em dashes; and the Approach callout says “Beginners welcome.” rather
  than “Nervous beginners welcome.”;
- above 900px, the three home principles form a stacked soft-lavender rail in
  the right side of the hero, using the space left by the removed card artwork
  without merging into the surrounding cream page. At 900px and below they
  remain stacked after the blue introduction so the mobile reading order stays
  unchanged;
- the browser favicon is a generated cream-and-lavender organic mark with a
  coral accent on dark blue, replacing the flower symbol;
- from 821px upwards, the Lessons page combines its closing booking prompt and
  payment note as one asymmetric blue and soft-lavender composition rather
  than two full-width bars. Between 821px and 1100px, the blue panel arranges
  its own contents vertically so the joined composition fits a narrower
  desktop window; only at 820px and below do the two panels stack;
- above 820px, the same soft-lavender rail treatment separates the Approach
  teaching list and the FAQ index from their cream content columns. At 820px
  and below those sections keep their simpler cream stacked treatment. From
  821px to 999px, the Approach teaching-list headings wrap naturally instead
  of being clipped at the right edge; from 1000px upwards they remain on one
  line;
- the booking and privacy policies use a quiet editorial cream column under a
  compact blue hero, linked from the footer rather than promoted as primary
  navigation. When prepayment is active, a weekly booking presents its
  recurring-card agreement as a distinct required lavender consent block next
  to the final action; a payment configuration failure replaces action with a
  visible inline error instead of letting an unpaid confirmation through.

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

Use a short opacity-only transition on completed route changes, with faster
mobile timings and no click delay, overlay, transform, ambient loop, or
decorative hero entrance. Decisions inside the booking flow resize and
dissolve the existing calendar workspace rather than abruptly replacing the
page. Keep the rest of the page fixed. Reduced-motion users navigate
immediately without animation or smooth scrolling.

## Booking workspace

Preserve these desktop and mobile states:

- on desktop the blue introduction is a supporting rail, clamped between 300
  and 440 px at roughly 29% of the viewport; the cream booking workspace owns
  the remaining width;
- the workspace opens with one decision: `Book a new lesson` or `View your
  lessons`. Booking then asks for the lesson type before showing the calendar;
  viewing lessons opens the upcoming-lesson list, with the same calendar kept
  beneath it as a four-week visual overview and without displaying free times.
  Completed decisions collapse into a compact row, so account tools,
  lesson cards, the calendar, and confirmation never compete at once;
- the signed-in identity appears once, inside a generously padded account bar.
  A small `Menu` contains `Upcoming lessons`, `Past lessons`, `Edit details`, and
  `Sign out`. `Past lessons` remains present even before the student chooses
  `View your lessons`, while booking, and while an individual lesson is open;
  an empty history says so instead of removing the shortcut. The Upcoming
  lessons panel contains every future commitment. Choosing either lesson shortcut
  dismisses the active booking detail, opens its own panel below
  the account bar, and establishes the four-week lesson workspace beneath it.
  Each destination panel has `Back to start`, which restores the initial
  book-or-view choice. A repeating schedule appears once in Upcoming lessons,
  led by its nearest date and distinguished from coral one-off bookings with a
  lilac recurring treatment. Its single `Manage` action reveals no more than four
  booked occurrences, each with its own `Manage` action. A small accessible
  tooltip explains that individual lessons can be modified up to four weeks in
  advance; it opens as a contained inline callout rather than covering lesson
  cards, while `Back to start` stays at the panel's upper right. In these
  already-booked summaries, ordinary lesson product names are
  replaced by their useful compact duration (`60 mins` or `90 mins`), while a
  trial stays named. The recurring line states its weekly time or `Sequence
  ended` without repeating the number of booked dates. One-off lessons remain
  individual entries.
  There is no second `My lessons` navigation destination.
  The account bar, workflow choices, calendar, and selected-day workspace share
  the same left and right edges. Profile fields open directly inside the account
  bar, without a second framed card; their actions sit beside the field whenever
  the available width permits;
- after a successful one-off or recurring booking, the confirmation's primary
  back action opens `Upcoming lessons` so the new booking is immediately visible;
- the calendar is the stable visual surface beneath the lesson-management
  content. Viewing lessons owns a fixed four-week overview; it never expands to
  absorb later booked dates because the complete list lives above it. Selecting
  a day reduces it to one week, with `Back to 4
  weeks` restoring the lesson overview. The new-booking journey still uses its
  full eight-week availability horizon and returns there from a selected week,
  with the time or lesson detail beside it on desktop and immediately below it
  on mobile. A free day shows the available times without redundant “no lesson
  booked” or lesson-summary copy. Those times form one compact grid without
  morning, afternoon, or evening subheadings; buttons keep an accessible touch
  target while fitting three across on a phone. Booked days retain their lesson
  details. The four-week lesson overview stops before later repeating dates;
  those future lessons remain in the list instead of stretching the calendar. Opening any
  lesson keeps the list and calendar in place and adds a compact overlay asking
  whether to change or cancel it. `Change` returns to the same calendar and its
  time picker; cancellation stays inside the overlay until explicitly confirmed.
  The booking overview says `Next 8
  weeks`
  explicitly and contains no more than eight Monday-to-Sunday rows; the
  inclusive 56-day API boundary must not create a ninth visible row;
- days with two bookings show both booked times on separate lines. Do not use a
  small `2x` count badge beside the date. Each selected existing lesson uses a
  coral-tinted card with an explicit `Booked` status;
- primary coral and secondary outline actions share a 52 px height, Montserrat
  0.7 rem labels, 0.12 em tracking, and the same hand-drawn button radius.
  Tertiary text actions use the same type at 40 px minimum height and align to
  the right wherever the label fits, on mobile as well as desktop. The selected
  compact lesson overlay pairs the booking status with `Change` and `Cancel`;
  it must not replace or reorder the underlying lesson workspace;
- transitions belong to the account, choice, calendar, detail, and confirmation
  surfaces individually. The page scrolls only when the next decision is not
  already comfortably visible. Reduced motion removes both the transitions and
  smooth scrolling;
- preserve the current mobile reading order and full-width stacked lesson
  choices. The mobile calendar must keep all seven columns and its legend inside
  the card after resize or orientation changes.

## Account interaction states

Selecting an occurrence from a recurring sequence identifies it in the compact
management overlay. `Change` and `Cancel` affect only that date; `Manage
sequence` owns the separate stop-repeating decision in that same overlay.
Before a student stops a repeating lesson, show a clear confirmation at desktop
and mobile sizes with two explicit choices. State that lessons already in the
calendar stay booked and can be cancelled individually.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.

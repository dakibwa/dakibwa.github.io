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

## How this contract evolves

Keep each accepted correction in the narrowest place that can enforce it:

- this file owns the reader's job, information hierarchy, composition, copy
  tone, responsive behaviour, reachable states, and named failure patterns;
- `app/globals.css`, components, and `public/visuals/` own exact reusable
  colours, type, spacing, controls, layouts, and production assets;
- focused scripts and tests own failures that can be detected mechanically.

Add or change a rule here only after a deliberate product decision or when the
same accepted correction recurs. For agent-generated visual work, keep the
brief, inputs, model, and viewport stable for a matched before/after comparison,
retain the first result, and check that the correction helps both desktop and
mobile without weakening another important state. A one-off preference stays
with its change until there is evidence that it should govern later work.

## Named failure patterns

Use these names in review so recurring problems are easy to recognise:

- **Business-card transplant:** treating historical print artwork as a web
  layout or placing the business card itself in the hero.
- **Panel pile-up:** giving every piece of content its own framed region until
  no single task or reading path is dominant.
- **Booking pile-up:** showing account tools, choices, calendar, lesson detail,
  and confirmation at equal prominence instead of letting completed decisions
  collapse.
- **Intermediate-width squeeze:** preserving a wide desktop composition after
  headings, controls, or the seven-column calendar have started to clip or
  wrap unnaturally.
- **Decorative motion:** adding ambient loops, entrance choreography, click
  delay, or movement that does not explain a state change.

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
- a visit launched from Akibwa with `?from=akibwa` carries a compact, neutral,
  pinned version of the portfolio masthead above this site's own header. It
  retains the original “I’m Daniel” / “I’m Akibwa” flick, the exact “Building
  in the age of AI.” line, and the coloured Home, Projects, Career and Taste
  Library links. Its green rule spans the full viewport and is the boundary:
  everything below it remains the real Português com a Inês site. The masthead
  persists through scrolling and internal navigation in that tab; leaving by
  one of its portfolio links clears the visit state. Direct visits never show
  it. Reduced-motion visitors see the Daniel state without animation.

## Public-page hierarchy — 2026-09-01

Use the available space for orientation and decisions rather than repeating
the same identity or action:

- the shared header is the site's primary `Português com a Inês` wordmark;
  page headings describe the visitor's current subject or task. The footer
  repeats the wordmark at a quieter scale in cream on dark blue as an
  intentional sign-off, rather than introducing another headline;
- each page has one dominant action in its content. A later section must not
  repeat the same call to action simply to fill a closing band;
- on Home, the display heading is `European Portuguese lessons.` and the
  supporting line locates them in Porto and online. `Book a lesson` appears
  once. The quieter `How I teach` and `Lessons and prices` routes sit with that
  introduction rather than occupying a second strip beneath the hero;
- Approach, Lessons, FAQ, and Booking follow the same hierarchy: the brand
  anchors the shared header and footer, while each page owns a task-specific
  heading and only the actions that meaningfully advance its reading path.

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
  lessons`. Booking then asks whether this is one lesson or a recurring lesson.
  The selected route puts Online/In Porto and `60 minutes`/`90 minutes` together
  as compact sliding selectors on one setup screen; a recurring booking adds 4,
  6, 8 weeks, or `Ongoing` there as a third selector. The recurring route name
  is not repeated above `Choose your lesson`. Once a starting time is chosen,
  the same setup surface lists any clashing weeks before confirmation. An eligible
  first-time student also sees the separate fixed-length trial route, followed
  by its Online/In Porto choice;
  viewing lessons opens the upcoming-lesson list, with the same calendar kept
  beneath it as a four-week visual overview and without displaying free times.
  A signed-out visitor can browse lesson types, dates, and times first; sign-in
  is requested only when they open their lessons or confirm a booking.
  Completed decisions collapse into a compact row, so account tools,
  lesson cards, the calendar, and confirmation never compete at once;
- the signed-in identity appears once, inside a generously padded account bar.
  A small `Menu` contains `View lessons`, `Book a lesson`, `Past lessons`, `Edit
  details`, and `Sign out`, in that order. `View lessons` may show the useful
  upcoming count; `Past lessons` deliberately has no count competing for
  attention. It remains present even before the student chooses
  `View your lessons`, while booking, and while an individual lesson is open;
  an empty history says so instead of removing the shortcut. The Upcoming
  lessons panel contains every future commitment. Choosing either lesson shortcut
  dismisses the active booking detail, opens its own panel below
  the account bar, and establishes the four-week lesson workspace beneath it.
  Past lessons has `Back to start`, while the more useful top-right action in
  Upcoming lessons is `Book a lesson` and opens the booking choices directly.
  A repeating schedule appears once in Upcoming lessons,
  led by its nearest date and distinguished from coral one-off bookings with a
  lilac recurring treatment and a subtle lilac hover/focus wash.
  `Manage recurrence` opens the schedule-level choices directly, including
  moving every upcoming occurrence to a new weekly slot;
  `View next 4 lessons` reveals no more than four separate occurrence cards,
  each with its own `Manage` action. A small accessible
  tooltip explains that individual lessons can be modified up to four weeks in
  advance; it opens over the lesson list on a dark blue floating surface, so it
  never moves the cards beneath it. Stopping a repeat immediately returns every retained date to the
  ordinary individual lesson cards; only an active repeat is grouped. In these
  already-booked summaries, ordinary lesson product names are
  replaced by their useful compact duration (`60 mins` or `90 mins`), while a
  trial stays named. The recurring line states its weekly time without repeating
  the number of booked dates. One-off and stopped-sequence lessons remain
  individual entries. Each card gains a quiet colour wash on hover or keyboard
  focus without lifting, jumping, or shifting the list. One-off `Manage` stays
  in the card's far-right column on a phone instead of becoming a full-width
  row. Booked marks vary by 60/90 minutes and Online/In Porto; a repeating
  schedule has its own fifth mark. Do not reuse the stacked-wave emblem in
  booked lesson cards.
  There is no second `My lessons` navigation destination.
  The account bar, workflow choices, and calendar share the same left and right
  edges. Profile fields open directly inside the account
  bar, without a second framed card; their actions sit beside the field whenever
  the available width permits;
- after a successful one-off or recurring booking, the confirmation's primary
  back action opens `Upcoming lessons` so the new booking is immediately visible;
- the calendar is the stable visual surface beneath the lesson-management
  content. Viewing lessons owns a fixed four-week overview; it never expands to
  absorb later booked dates because the complete list lives above it. It has no
  second context strip or selected-day panel: selecting a booked date expands
  its recurring group when needed, scrolls the exact occurrence into Upcoming
  lessons, and briefly highlights it. The new-booking journey still uses its
  full eight-week availability horizon and returns there from a selected week,
  with the time or lesson detail beside it on desktop and immediately below it
  on mobile. A free day shows the available times without redundant “no lesson
  booked” or lesson-summary copy. Those times form one compact grid without
  morning, afternoon, or evening subheadings; buttons keep an accessible touch
  target while fitting three across on a phone. The four-week lesson overview stops before later repeating dates;
  those future lessons remain in the list instead of stretching the calendar. Opening any
  lesson keeps the list and calendar in place and adds a compact overlay asking
  whether to change or cancel it. `Change` keeps the page dimmed and lifts that
  same calendar and time picker into the overlay; it never dismisses the modal
  or scrolls the student down the underlying page. The overlay is one surface,
  without framed cards nested inside it. Eligible ordinary lessons can switch
  between the same compact `60 mins` and `90 mins` choices and Online/In Porto
  there, with the current date and time already selected; a paid lesson is never silently
  repriced. Cancellation stays inside the overlay until explicitly confirmed.
  The booking overview says `Next 8
  weeks`
  explicitly and contains no more than eight Monday-to-Sunday rows; the
  calendar key and range label share one visual centre. The final booking recap
  uses the selected date and time as its display heading instead of repeating
  `Single lesson`. It does not repeat the Online/In Porto control beneath the
  recap; one `Change details` action returns to the setup choices with the
  current location and length retained. The inclusive 56-day API boundary must
  not create a ninth visible row;
- days with two bookings show both booked times on separate lines. Do not use a
  small `2x` count badge beside the date;
- primary coral and secondary outline actions share a 52 px height, Montserrat
  0.7 rem labels, 0.12 em tracking, and the same hand-drawn button radius.
  Tertiary text actions use the same type at 40 px minimum height and align to
  the right wherever the label fits, on mobile as well as desktop. The selected
  compact lesson overlay pairs the booking status with `Change` and `Cancel`;
  it must not replace or reorder the underlying lesson workspace;
- transitions belong to the account, choice, calendar, detail, and confirmation
  surfaces individually. Use short local fades and a few pixels of settling
  motion rather than page-wide view snapshots. Guidance begins with the state
  change instead of waiting for decoration to finish, and the page scrolls only
  when the next decision is not already comfortably visible. Loading copy and
  its replacement controls dissolve into one another rather than snapping.
  Reduced motion removes both the transitions and smooth scrolling;
- preserve the current mobile reading order and full-width stacked lesson
  choices. The mobile calendar must keep all seven columns and its legend inside
  the card after resize or orientation changes.

## Account interaction states

Selecting an occurrence from a recurring sequence identifies it in the compact
management overlay. `Change` and `Cancel` affect only that date; `Manage
sequence` owns the recurring schedule in that same overlay. It can move the
upcoming recurrence with the compact length, location, day, and time controls;
stop adding new lessons while keeping booked dates; or cancel all cancellable
upcoming dates as well. The action labels stand alone without an explanatory
sentence above them. Confirm either destructive action at desktop and mobile
sizes before changing anything. The bulk-cancel confirmation must state
that paid cancellable lessons are refunded automatically and that a lesson
happening today remains booked under the existing same-day policy.

The change workflow has no decorative horizontal dividers. Lesson length uses
the same sliding two-option control as `Online` / `In Porto`, so changing an
existing lesson feels like the booking flow rather than a separate tool. The
policy band follows the Worker's payment mode: pay-in-person shows the concise
€5 legacy same-day rule; prepayment says that lessons cannot be changed or
cancelled on their day and a missed lesson is still charged. It contains no
instructions for finding the management controls.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.

# Canonical Site Direction

These five approved images are the visual target for the next
**Português com a Inês** website implementation:

1. `01-home.png`
2. `02-approach.png`
3. `03-lessons.png`
4. `04-faq.png`
5. `05-booking.png`

They include the original selected homepage and the matching Approach, Lessons,
FAQ, and Booking pages. Open `index.html` to review them together.

Editable design source:

- [Português com a Inês — Canonical Website](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y)

The images establish visual intent; they are not production interface assets.
Implementation must recreate the design with code-native text, layout,
interactions, and responsive states while preserving the existing live booking
architecture. See `IMPLEMENTATION-PLAN.md`.

## Shared system

- Keep the hand-lettered **Português com a Inês** wordmark in a warm-paper
  masthead.
- Keep only **Approach**, **Lessons**, **FAQ**, and **Booking** in navigation.
  The wordmark is the home control.
- Mark the current page with coral type and a restrained underline.
- Use forest green, business-card lavender, parchment, and coral.
- Preserve uncoated-paper texture, a hard editorial grid, fine lavender rules,
  oversized serif type, compact uppercase labels, and square corners.
- Reserve the radial conversation burst for the homepage hero. Other routes use
  crop-safe, page-specific marks: **Approach Pathway**, **Lessons Rhythm**,
  **Question Echo** with **FAQ Answer Index**, and **Open Time Window** for
  Booking.
- Keep live availability and booking state under the booking provider's
  control.
- Keep the homepage principle band to the three substantive ideas only. Do not
  add a separate **Approach** label cell; use three equal, compact columns.
- Keep the closing homepage rail focused on the two navigation actions. The
  removed “Private European Portuguese, shaped around you.” sentence repeated
  the principle content above.

## Page-generation record

All pages were generated with Codex's built-in image generator using the
`ui-mockup` prompt class. The selected homepage and original green business-card
front and back were supplied as visual references.

### Approach

Create an editorial teaching-manifesto page. Use a lavender title field reading
“A calm, practical way to learn.” and three ruled principles: **Real European
Portuguese**, **Built around you**, and **Relaxed and practical**. End with a
dark-green **Meet Inês** credential band. Keep Approach as the only active
navigation item.

### Lessons

Create a cultural-programme-style lesson and pricing page rather than ecommerce
cards. Typeset the current lesson formats in three ruled columns:

- Trial lesson — €20 — 45 minutes
- Single lesson — €25 — 45 minutes
- 5 lessons — €110 — 45 minutes each

End with an **Online or in Porto** band and one coral **Book a lesson** action.
Keep Lessons as the only active navigation item.

### FAQ

Create a printed reference-index treatment. Use the title “Questions before
booking?”, a left category index for Booking, Lessons, Location, Payment,
Rescheduling, and Levels, and a ruled accordion on the right. Show the first
booking question open. Use the green-and-coral **Question Echo** asset in the
lavender hero. Keep FAQ as the only active navigation item.

### Booking

Create a practical appointment-sheet layout. Use a dark-green introduction
panel and a warm-paper calendar panel with no highlighted or claimed available
times. Include **Choose a day**, **Available times**, the instruction to choose
a live available day, and a compact provider handoff. Do not repeat a
trial-lesson product summary above the live provider embed. Show Continue as
inactive until a time is selected. Use the fully contained lavender, paper,
and coral **Open Time Window** asset in the green introduction panel. Keep
Booking as the only active navigation item.

## Page-specific production marks

The editable components live in the Figma `01 Components` page under
**Page-specific brand marks**. Their exact production SVGs live in
`public/visuals/`.

- **Approach Pathway** — a three-stage rising path for the final approach
  principle; hidden on narrow phones where it would compete with the copy.
- **Lessons Rhythm** — five contained learning beats, designed for the
  dark-green hero surface.
- **FAQ Answer Index** — a quiet six-line reference mark at the end of the
  desktop FAQ rail; the separate Question Echo remains the hero asset.
- **Open Time Window** — a fully bounded booking mark that preserves its
  baseline and all four lower dots at every breakpoint.

All four use an 8:7 view box, `contain` sizing, and semantic brand colours.
They must never be enlarged with `cover` or positioned outside their owning
section.

## Constraints used throughout

Do not add Home, About, Contact, extra navigation, invented live availability,
student information, testimonials, portraits, rounded cards, pill controls,
gradients, glass panels, tourist imagery, flag motifs, or fabricated booking
terms. Render **Português com a Inês** with both accents and the article `a`.

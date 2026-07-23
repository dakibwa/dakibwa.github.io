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
- Reuse the radial conversation burst with different crops rather than making
  it a full-size hero on every page.
- Keep live availability and booking state under the booking provider's
  control.

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

- Trial lesson — €25 — 45 minutes
- Single lesson — €45 — 60 minutes
- 5 lessons — €210 — 60 minutes each

End with an **Online or in Porto** band and one coral **Book a lesson** action.
Keep Lessons as the only active navigation item.

### FAQ

Create a printed reference-index treatment. Use the title “Questions before
booking?”, a left category index for Booking, Lessons, Location, Payment,
Rescheduling, and Levels, and a ruled accordion on the right. Show the first
booking question open. Keep FAQ as the only active navigation item.

### Booking

Create a practical appointment-sheet layout. Use a dark-green introduction
panel and a warm-paper calendar panel with no highlighted or claimed available
times. Include **Choose a day**, **Available times**, the instruction to choose
a live available day, and the current trial-lesson summary. Show Continue as
inactive until a time is selected. Keep Booking as the only active navigation
item.

## Constraints used throughout

Do not add Home, About, Contact, extra navigation, invented live availability,
student information, testimonials, portraits, rounded cards, pill controls,
gradients, glass panels, tourist imagery, flag motifs, or fabricated booking
terms. Render **Português com a Inês** with both accents and the article `a`.

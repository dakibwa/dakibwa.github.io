# Canonical Site Implementation Plan

> Status, 23 July 2026: the five routes and shared responsive design system are
> implemented in the repository. Square-hosted booking remains the production
> route. Figma access is active and the compact production footer has now been
> reconciled into the editable system as Desktop (1536 × 124), Tablet
> (1024 × 158), and Mobile (390 × 290) component variants, using only the
> wordmark, navigation, and Message Inês action. The homepage closing
> actions also have approved-candidate Default, Hover, and Focus states for
> light and on-brand surfaces, using a 160 ms ease-out lift and underline
> sweep. A full route audit has also replaced repeated, cropped burst artwork
> with token-bound, crop-safe Approach Pathway, Lessons Rhythm, FAQ Answer
> Index, and Booking Open Time Window components in Figma and exact matching
> production SVGs. The homepage principles band is now three equal compact
> columns with no redundant Approach label cell, and its closing rail retains
> only the two navigation actions. The production footer already matches its
> specification. The approved Text Action motion is implemented in production
> CSS: a 160 ms ease-out 2 px lift and underline sweep, with colour-only
> feedback under reduced-motion preferences.

## Outcome

Rebuild the existing **Português com a Inês** website so it expresses the five
approved page images faithfully while remaining a responsive, accessible,
maintainable Next.js site with live Square-owned booking data.

The implementation is complete only when:

- Home, Approach, Lessons, FAQ, and Booking form one coherent responsive site;
- the visual hierarchy, typography, colours, rules, texture, motifs, and
  restrained interaction language match the canonical images;
- all visible text remains code-native and accessible;
- live availability, bookings, customer information, and booking changes still
  come from Square or the configured provider;
- desktop, tablet, and mobile journeys pass the relevant automated and visual
  checks;
- the production build is verified at the real public destination.

## Sources of truth

Use the sources in this order:

1. Dan’s current approved direction defines the intended outcome.
2. Approved frames and components in the canonical Figma file define the
   editable visual specification.
3. The repository defines implementation and deployment behaviour.
4. `design/primary-brand-direction.png` and the original business cards define
   the wordmark, palette, and authentic brand marks.
5. Square and its API adapter define live lesson availability, booking state,
   student details, and booking-management behaviour.

The five canonical PNGs remain historical references for the approved launch
direction, especially where the Figma system is not yet complete. They are not
production page backgrounds and must not become a competing current design
specification once an approved Figma frame exists.

## Recommended editable design route

Use **Figma Design** as the editable bridge between the approved PNGs and the
Next.js implementation. Canva can remain useful for marketing, social, and
print material, but it should not become the website specification.

Create one Figma file with these pages:

1. **00 Foundations** — palette, type scale, spacing, rules, grid, texture,
   icons, and accessibility notes.
2. **01 Components** — wordmark/header, active navigation, buttons, radial
   burst, plant/wave/sun marks, section labels, FAQ rows, lesson columns,
   calendar cells, fields, alerts, and policy strip.
3. **02 Desktop** — the five approved pages at the implementation target width.
4. **03 Tablet** — the five pages at a tablet breakpoint.
5. **04 Mobile** — the five pages at a narrow-phone breakpoint.
6. **05 States** — hover, focus, selected, expanded, loading, empty, error,
   success, and reduced-motion behaviour.
7. **06 Export** — only approved production assets, with clear SVG/PNG/WebP
   export settings.

Build frames with Auto Layout and reusable components. Use Figma variables for
colour, spacing, and responsive modes, then mark approved frames ready for
development. The repository remains the code source of truth; Figma owns the
editable visual specification.

### Current Figma handoff

The canonical Figma file now contains:

- `00 Foundations` — production-aligned paper, deep green, lavender, coral, and
  action-colour tokens plus responsive and motion notes;
- `01 Components` — the exact cream wordmark, `Text Action` variants for
  Default/On Brand × Default/Hover/Focus, the responsive `Site Footer`
  component set, and four token-bound page-specific brand-mark components;
- `02 Desktop` — the homepage closing actions and footer at 1536 px;
- `03 Tablet` — the same composition at 1024 px;
- `04 Mobile` — the stacked closing actions and footer at 390 px.

The closing actions retain their current production labels, **See the
approach** and **View lessons**. Their proposed hover behaviour is a 2 px lift,
coral underline sweep on paper, lavender underline sweep on green, and a
160 ms ease-out transition. Reduced-motion implementation must keep the colour
change while removing the movement and sweep.

## Design change workflow after launch

Use this sequence for every meaningful website design improvement:

1. **Design in Figma** — update the relevant component and desktop/mobile
   frames, including interaction, error, loading, or expanded states when the
   change affects them.
2. **Review** — share the frame with Dan and treat the approved frame as the
   implementation brief.
3. **Implement** — translate the approved Figma design into the existing
   responsive components and tokens without replacing real content or
   provider-backed behaviour with mock data.
4. **Verify** — run the proportionate checks and compare the real site against
   the approved frame at the relevant breakpoints.
5. **Reconcile** — if browser constraints or accessibility requirements lead
   to a visible implementation adjustment, update Figma to match the accepted
   production result before closing the task.

Copy-only edits, urgent fixes, accessibility corrections, provider changes,
and genuinely minor pixel adjustments can begin in code. Any visible result
must still be reflected in Figma during the same task. If Figma access or quota
is unavailable, report it rather than silently treating code as the new visual
specification; pause or obtain an explicit temporary exception and record
Figma reconciliation as the next action.

## Asset production manifest

| Asset | Source | Production form | Required work |
| --- | --- | --- | --- |
| Green wordmark | Original green business-card front | Transparent PNG initially; verified SVG only if an accurate trace is approved | Extract at high resolution, remove the flat lavender field cleanly, preserve both accents and the original lettering |
| Light wordmark | Existing original-wordmark extraction | Transparent PNG | Retain only for dark-green surfaces; verify edge quality and colour against the brand board |
| Conversation burst | Original green business-card back and current `splat-mask.png` | CSS mask using optimized alpha PNG/WebP | Compare the current mask with the source, normalize its crop, and verify clean scaling from mobile to wide desktop |
| Page-specific marks | Canonical Figma `01 Components` page | Crop-safe 8:7 SVGs | Keep Approach Pathway, Lessons Rhythm, FAQ Answer Index, and Booking Open Time Window fully contained; reserve the conversation burst for Home |
| Plant mark | Canonical Home/Approach images | Code-native SVG React component | Draw a simple reusable mark with green leaves and a lavender dot; decorative by default |
| Wave mark | Canonical pages | Code-native SVG React component | Draw the three-line green/lavender variant with consistent stroke and spacing |
| Sun/conversation mark | Canonical pages | Code-native SVG React component | Draw the radial small mark with a lavender centre; provide compact and large variants |
| Paper texture | Canonical images | Small repeating optimized WebP/PNG or a tested CSS texture | Produce a subtle tile, keep contrast low, and set a strict size budget so it does not become the LCP cost |
| Rules and grids | Canonical images | CSS borders and layout | No raster asset; express with tokens and responsive CSS |
| Buttons and active underline | Canonical images | CSS | Square corners, coral action colour, explicit hover/focus/disabled states |
| Favicon/app mark | Approved plant or sun mark | SVG plus required PNG sizes | Derive only after the mark is approved in Figma |
| Social sharing image | Canonical Home direction | 1200 × 630 optimized image | Compose from approved brand elements after the production homepage is stable |
| Responsive references | Canonical desktop images | Figma frames and review exports | Create tablet and mobile versions before implementation is considered visually locked |

Do not generate portraits, tourist imagery, decorative stock photography, or
additional brand motifs. This direction succeeds through typography, layout,
colour, and the small set of existing marks.

## Typography decision

The current site uses Bricolage Grotesque for display text, but the canonical
direction is led by a high-contrast editorial serif.

Before coding:

1. Build a Figma comparison using three properly licensed, web-available serif
   candidates.
2. Test the exact long headings from all five pages at desktop and mobile.
3. Select one display serif based on shape, readability, loading cost, and
   accent coverage.
4. Retain a compact sans-serif for navigation, uppercase labels, controls, and
   form text.
5. Self-host the chosen files when licensing permits, subset responsibly, and
   use `font-display: swap`.

Do not try to recreate the hand-lettered wordmark with a font.

## Content and data reconciliation

The canonical images contain useful proposed copy, but the provider and
repository must confirm operational facts before publication.

Resolve these before the Lessons and Booking pages are treated as release-ready:

- current trial, single, and five-lesson prices;
- current lesson durations;
- whether packages are genuinely bookable in Square;
- payment timing;
- the final same-day rescheduling wording and enforcement mode;
- the exact Porto/in-person location language;
- the production booking provider and fallback route.

This is required because the repository currently contains conflicting price
and duration defaults across page copy, environment examples, and deployment
variables. Centralize approved lesson products in one typed data/config module
so Home, Lessons, FAQ, Booking, metadata, and tests cannot drift independently.

## Route and component architecture

### Routes

- `/` — Home
- `/approach` — Approach
- `/lessons` — Lessons
- `/faq` — FAQ
- `/book` — Booking

The wordmark returns home. The visible navigation contains only Approach,
Lessons, FAQ, and Booking.

### Shared components

Create or refactor:

- `SiteHeader` — four-link navigation, active state, responsive menu behaviour;
- `SiteFooter` — restrained closing treatment using the same canonical system;
- `BrandWordmark` — green/light variants from the original source;
- `ConversationBurst` — scalable mask/component with controlled crops;
- `BrandIcon` components — Plant, Waves, and Sun;
- `EditorialRule` and `SectionLabel`;
- `PageHero` and `EditorialBand`;
- `LessonProgramme` — ruled lesson columns/list driven from centralized data;
- `FAQIndex` and `FAQRow`;
- booking presentation components around the existing live booking state.

Prefer semantic HTML, CSS Grid, Flexbox, SVG, and CSS variables. Avoid using a
general card component to reproduce a design whose character comes from flat
fields, rules, and typography.

### Styling structure

Move towards:

- a small global reset and token layer;
- shared brand/layout styles;
- component or route-scoped styles for page-specific compositions;
- no giant screenshot backgrounds;
- no duplicated colour or spacing literals when a token exists.

## Page implementation sequence

### 1. Foundations and shared shell

- Finalize Figma foundations, fonts, grids, breakpoints, components, and states.
- Produce and validate the small production asset kit.
- Refactor the header, footer, tokens, type styles, focus treatment, and
  responsive page shell.
- Add the `/approach` and `/lessons` routes.

Exit gate: the shared shell matches the canonical masthead and works with
keyboard navigation at desktop and mobile widths.

### 2. Home

- Rebuild the split hero with code-native heading and CTA.
- Use the conversation burst as a scalable mask, not a screenshot.
- Recreate the three-principle strip with reusable icons and rules.
- Define the below-the-fold continuation deliberately; the canonical image
  defines the opening viewport, not the entire content length.

Exit gate: the first desktop viewport and mobile adaptation preserve the
approved hierarchy without overflow or illegible text.

### 3. Approach

- Build the lavender editorial title field.
- Build the three ruled teaching principles.
- Add the concise Meet Inês credential band using confirmed qualifications
  only.

Exit gate: the page remains useful and readable without a portrait or generic
feature cards.

### 4. Lessons

- Drive all lesson columns from the centralized product data.
- Preserve the printed-programme treatment on desktop.
- Convert columns to a ruled vertical list on narrow screens.
- Link actions to the relevant live booking route without inventing package
  availability.

Exit gate: every displayed price, duration, saving, and product maps to an
approved live offer.

### 5. FAQ

- Retain the existing real FAQ content and accessible disclosure behaviour.
- Restyle it as a category index plus ruled question list.
- Make the mobile category control usable without hiding content from keyboard
  or screen-reader users.
- Keep WhatsApp/contact behaviour provider-backed and concise.

Exit gate: every question is reachable, expandable, and understandable with
keyboard-only navigation and JavaScript-enabled production behaviour.

### 6. Booking

- Preserve `BookingFlow`, `CustomSquareBookingFlow`, provider selection,
  availability loading, hosted fallback, booking submission, and policy
  behaviour.
- Restyle the existing controls into the canonical appointment-sheet layout.
- Never hardcode example availability into production.
- Design loading, empty, error, selected, submitting, success, and hosted
  fallback states in Figma before touching the logic.
- Keep secrets and private Square calls in the Worker, never in the static site.

Exit gate: the restyled flow completes against the configured provider, and
errors/fallbacks remain honest and recoverable.

### 7. Responsive and interaction pass

Review at minimum:

- wide desktop;
- standard laptop;
- tablet portrait and landscape;
- 390 px phone;
- a narrow 320 px fallback.

Define rather than improvise:

- header/menu behaviour;
- type scale and line breaks;
- hero crop;
- order of split panels;
- stacked lesson rules;
- FAQ category navigation;
- calendar density and touch targets;
- disabled and selected states;
- reduced-motion behaviour.

## Accessibility requirements

- Correct landmarks and heading order on every route.
- `aria-current` for the active page.
- Visible focus states that do not rely on colour alone.
- Minimum practical 44 px interactive targets on touch layouts.
- Sufficient contrast for paper, lavender, green, and coral combinations.
- Decorative marks hidden from assistive technology.
- FAQ disclosures with correct expanded/control relationships.
- Calendar dates and slots with complete accessible names and state.
- Form errors associated with the relevant fields and announced.
- No essential information embedded only in images.
- Respect `prefers-reduced-motion`.

## Verification plan

### During implementation

Use the smallest relevant check:

- `npm run lint`
- `npm run typecheck`
- focused Playwright journeys for the page being changed
- `npm run check:booking` whenever booking configuration or routing changes

### Cross-cutting readiness

Before release:

1. Run the production build with the configured base path.
2. Extend `scripts/qa-flow.mjs` to cover `/approach` and `/lessons`.
3. Capture desktop and mobile screenshots for all five routes.
4. Compare the opening viewport with the canonical reference and document
   intentional responsive differences.
5. Exercise FAQ expansion, navigation active states, calendar selection,
   booking details, validation, error, and fallback paths.
6. Run keyboard and automated accessibility checks.
7. Confirm there are no console errors or broken public asset paths.
8. Measure a cold production load and verify that fonts/texture/masks do not
   dominate LCP.
9. Verify the real public destination after deployment.

## Release discipline

- Start implementation from the canonical repository and a scoped
  `codex/` branch.
- Preserve the current uncommitted design work.
- Commit the canonical images, plan, approved production assets, code, and
  focused documentation intentionally.
- Do not publish from generated mockup folders or an old checkout.
- Do not update Notion until the change is committed, published, and verified
  on the real destination.
- When release is authorized, run the booking check and production build, then
  push and verify the GitHub Pages deployment.

## Decisions required before implementation locks

1. Confirm Figma as the editable design tool and the target Figma workspace.
2. Approve the display serif after the three-font comparison.
3. Approve mobile navigation and the five mobile page frames.
4. Verify the live Square lesson products, prices, and durations.
5. Confirm whether the below-the-fold Home content is reduced, rewritten, or
   retained beneath the canonical opening viewport.

## First executable action

Create the Figma file from the five canonical PNGs, establish the foundations
and shared components, and produce desktop plus mobile Home frames for approval.
Once those are accepted, generate the approved production asset kit and begin
the shared Next.js shell.

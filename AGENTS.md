# Portuguese with Inês repository instructions

## Verification and release

- During implementation, run the smallest relevant check. Use `npm run test:booking` for Worker logic, `npm run check:booking` when booking configuration or routing changes, the focused Playwright smoke test for affected customer journeys, and the production build for release or cross-cutting work.
- Booking changes span two deployables: the static site and the `ines-booking` Worker. Deploy the Worker first — the site's release gate checks its health and will refuse to publish against a broken one.
- The Playwright journey test now runs in CI against the built export, not only locally. It rotted silently once — the booking container was renamed and nothing noticed for several commits — so if you rename a selector it guards, update `scripts/qa-flow.mjs` in the same change.
- Markdown and `docs/**`-only changes do not require a build or deployment; the Pages workflow intentionally ignores them.

## Figma-first design workflow

- The canonical editable website design is the [Português com a Inês Figma file](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y). Figma owns intended visual design; Git owns production implementation and delivery; the `ines-booking` Worker and its D1 database own live booking truth.
- Start meaningful visual changes in Figma before editing production code. This includes new pages or sections, layout changes, component redesigns, typography or colour-system changes, new interaction patterns, and material desktop/mobile composition changes.
- In the same task, prepare the relevant desktop and mobile frames plus important states, obtain Dan’s approval, implement the approved design, verify the real site, and reconcile any implementation-led visual adjustments back into Figma before calling the work complete.
- Copy-only edits, urgent production fixes, accessibility corrections, provider/configuration changes, and truly minor pixel adjustments may start in code. If they visibly change the interface, sync the resulting design back to Figma in the same task.
- If Figma access, authentication, or tool quota prevents a required design update, do not silently bypass the workflow. Report the limitation and either pause the visual implementation or obtain an explicit temporary code-first exception, with Figma reconciliation kept as the next action.
- The current production direction is dark blue, lilac, cream, and coral, with organic splatty marks, Beth Ellen display text, and Montserrat body/UI text. Keep `public/visuals/` production-only and retain only assets referenced by the current site.
- Keep the original business-card material as historical brand reference. Once an approved Figma frame exists for a surface, use that frame as the visual implementation specification rather than creating a competing mock-up elsewhere.
- Superseded visual work is stored outside the repository in `/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`. It is provenance only: do not inspect or reuse it as design input unless Dan explicitly asks to revisit a named archived item.

## Documentation

- Git owns website implementation and deployment history; the booking Worker's D1 database owns live booking state. Update `README.md` or `docs-booking-system.md` in the same commit whenever a material change alters customer behaviour, booking flow, architecture, providers, publication workflow, or the next milestone.
- The admin endpoints are reachable by any account with `role = 'teacher'`, not only by the shared token. Anything added under `/admin/` is therefore something Inês can do from a browser she is signed into — check the permission path, not just the token path, when changing them.
- Booking touches money, a student's time and Inês's calendar. Never change the manage-link token scheme, the iCalendar `UID`/`SEQUENCE` handling, or the same-day fee detection without running `npm run test:booking` — each has a failure mode that is invisible until a real student is affected.

# Portuguese with Inês repository instructions

## Verification and release

- During implementation, run the smallest relevant check. Use the booking check when booking configuration or routing changes, the focused Playwright smoke test for affected customer journeys, and the production build for release or cross-cutting work.
- Markdown and `docs/**`-only changes do not require a build or deployment; the Pages workflow intentionally ignores them.

## Figma-first design workflow

- The canonical editable website design is the [Português com a Inês Figma file](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y). Figma owns intended visual design; Git owns production implementation and delivery; Square owns live booking and payment truth.
- Start meaningful visual changes in Figma before editing production code. This includes new pages or sections, layout changes, component redesigns, typography or colour-system changes, new interaction patterns, and material desktop/mobile composition changes.
- In the same task, prepare the relevant desktop and mobile frames plus important states, obtain Dan’s approval, implement the approved design, verify the real site, and reconcile any implementation-led visual adjustments back into Figma before calling the work complete.
- Copy-only edits, urgent production fixes, accessibility corrections, provider/configuration changes, and truly minor pixel adjustments may start in code. If they visibly change the interface, sync the resulting design back to Figma in the same task.
- If Figma access, authentication, or tool quota prevents a required design update, do not silently bypass the workflow. Report the limitation and either pause the visual implementation or obtain an explicit temporary code-first exception, with Figma reconciliation kept as the next action.
- The current production direction is dark blue, lilac, cream, and coral, with organic splatty marks, Beth Ellen display text, and Montserrat body/UI text. Keep `public/visuals/` production-only and retain only assets referenced by the current site.
- Keep the original business-card material as historical brand reference. Once an approved Figma frame exists for a surface, use that frame as the visual implementation specification rather than creating a competing mock-up elsewhere.
- Superseded visual work is stored outside the repository in `/Users/danatkinson/Documents/Creative Assets/Project Assets/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`. It is provenance only: do not inspect or reuse it as design input unless Dan explicitly asks to revisit a named archived item.

## Documentation and Notion handoff

- Git owns website implementation and deployment history; Square and other providers own live booking and payment truth. Update `README.md` or the relevant focused documentation in the same commit whenever a material change alters customer behaviour, booking/payment flow, architecture, providers, publication workflow, or the next milestone.
- The existing Life & Work orientation record is **Portuguese with Inês**. Find it by that exact title; do not create another project tracker.
- After a material change is committed, published, and verified on the real destination, update that row with only the corrected status, evidence date/source, and one next executable action.
- Do not update Notion for trivial edits or paste customer data, booking details, payment data, repository history, test logs, credentials, or secrets there.

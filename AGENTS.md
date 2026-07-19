# Portuguese with Inês repository instructions

## Verification and release

- During implementation, run the smallest relevant check. Use the booking check when booking configuration or routing changes, the focused Playwright smoke test for affected customer journeys, and the production build for release or cross-cutting work.
- Markdown and `docs/**`-only changes do not require a build or deployment; the Pages workflow intentionally ignores them.

## Documentation and Notion handoff

- Git owns website implementation and deployment history; Square and other providers own live booking and payment truth. Update `README.md` or the relevant focused documentation in the same commit whenever a material change alters customer behaviour, booking/payment flow, architecture, providers, publication workflow, or the next milestone.
- The existing Life & Work orientation record is **Portuguese with Inês**. Find it by that exact title; do not create another project tracker.
- After a material change is committed, published, and verified on the real destination, update that row with only the corrected status, evidence date/source, and one next executable action.
- Do not update Notion for trivial edits or paste customer data, booking details, payment data, repository history, test logs, credentials, or secrets there.

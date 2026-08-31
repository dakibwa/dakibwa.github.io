# Portuguese with Inês repository instructions

## Verification and release

- During implementation, run the smallest relevant check. Use `npm run test:booking` for Worker logic and the focused Playwright smoke test for affected customer journeys.
- Before pushing, run `npm run check:fast`; it keeps type checking, lint and the booking unit suite in one short local loop. Do not put the live Worker probe, production build or browser journey in the edit loop.
- `npm run check:release` adds the live booking probe and production build. CI runs it once on `main`, then exercises the customer journey against that same built export before automatically publishing it.
- Run `npm run check:booking` directly only when booking configuration or routing changes, or to diagnose the release gate. If a local environment points it at a localhost Worker, start that Worker first; otherwise let CI exercise the configured live endpoint.
- Booking changes span two deployables: the static site and the `ines-booking` Worker. Deploy the Worker first — the site's release gate checks its health and will refuse to publish against a broken one.
- The Playwright journey test now runs in CI against the built export, not only locally. It rotted silently once — the booking container was renamed and nothing noticed for several commits — so if you rename a selector it guards, update `scripts/qa-flow.mjs` in the same change.
- Markdown and `docs/**`-only changes do not require a build or deployment; the Pages workflow intentionally ignores them.

## Documentation-first, code-native design workflow

- [design/README.md](./design/README.md) is the canonical human-readable contract for the website's visual direction, responsive composition, motion, and important interaction states. Git owns the editable production implementation and delivery; the published site is the acceptance surface; the `ines-booking` Worker and its D1 database own live booking truth.
- Treat a clear requirement added to the repository documentation as an implementation requirement. Bring the code and live site into line with it, or record the conflict explicitly when provider truth, accessibility, security, or current product behaviour makes the documented requirement unsafe or ambiguous.
- For meaningful visual changes, describe the intended outcome and important desktop/mobile states in `design/README.md` before or alongside implementation. Then change the code, inspect the running site at representative widths and states, and reconcile any implementation-led adjustment back into the documentation in the same task.
- External design tools and mock-ups are optional working material only. They are never a source of truth, a required handoff, or a completion dependency for this website.
- A daily Codex project task checks the repository documentation against the implementation and published site. It is a backstop for small, clear drift; normal product work should still keep documentation and code aligned in the same change.
- The current production direction is dark blue, lilac, cream, and coral, with organic splatty marks, Beth Ellen display text, and Montserrat body/UI text. Keep `public/visuals/` production-only and retain only assets referenced by the current site.
- Keep the original business-card material as historical brand reference, not as a competing website specification.
- Superseded visual work is stored outside the repository in `/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`. It is provenance only: do not inspect or reuse it as design input unless Dan explicitly asks to revisit a named archived item.

## Documentation

- Git owns website implementation and deployment history; repository documentation owns intended website behaviour and design; the booking Worker's D1 database owns live booking state. Update `README.md`, `design/README.md`, or `docs-booking-system.md` in the same commit whenever a material change alters their contract.
- The admin endpoints are reachable by any account with `role = 'teacher'`, not only by the shared token. Anything added under `/admin/` is therefore something Inês can do from a browser she is signed into — check the permission path, not just the token path, when changing them.
- Booking touches money, a student's time and Inês's calendar. Never change the manage-link token scheme, the iCalendar `UID`/`SEQUENCE` handling, or the same-day fee detection without running `npm run test:booking` — each has a failure mode that is invisible until a real student is affected.

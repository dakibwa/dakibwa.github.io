# Design Reset Audit - 2026-07-07

This document records the cleanup after the rejected generated-asset redesign pass. It is intended to make the next rebuild start from a clean asset base rather than from chat history.

## Outcome

The failed visual pass has been separated from the repo:

- The generated photo-style assets were removed.
- The old public visual experiments were removed from disk and staged for deletion.
- The duplicate public copies and duplicate SVG business-card exports were removed.
- The unstaged app-code changes from the rejected redesign were restored back to the previous repo baseline.
- The retained brand assets now live under `design/` only.

The current site code is not the final design state. It has been reset so the next pass can rebuild deliberately.

## Retained Assets

Use these as the clean baseline:

- `design/primary-brand-direction.png`
- `design/stickers/sticker-sheet-whatsapp-2026-07-06.jpeg`
- `design/business-cards/blue-card-back.png`
- `design/business-cards/blue-card-front.png`
- `design/business-cards/green-card-back.png`
- `design/business-cards/green-card-front.png`

There are six visual files in the retained baseline, and each has a unique file hash.

## Removed Asset Categories

Removed or staged for removal:

- Generated lesson/table/booking/FAQ photo attempts.
- Old mock wordmark and flower/radial experiments.
- Old portrait/testimonial placeholder images.
- Old Porto line-art experiments.
- Old azulejo/FAQ decorative fragments.
- Duplicate `public/visuals/source-*` files.
- Duplicate `design/source-assets/svg/*` files.
- Temporary QA screenshots and build-output image copies.

## Important Current-State Caveat

`public/visuals/` has intentionally been removed. The restored app code still contains references to old `/visuals/...` paths because the code was reset to the pre-cleanup baseline.

That is acceptable for the reset state, but it means the next design pass must either:

- export selected approved assets from `design/` into `public/visuals/`, or
- change the implementation so it no longer references deleted public assets.

Do not treat the current restored UI as ready to ship.

## What Went Wrong

The rejected pass drifted into designing from generated support imagery instead of treating the supplied brand board and original cards as the source of truth. The result felt generic and ugly despite borrowing colors from the board.

The next pass should avoid:

- generating decorative photos before the layout direction is agreed;
- creating many loose assets with unclear provenance;
- shipping crops or mockups that are not source artwork;
- using full-board screenshots directly as interface art;
- duplicating the same files across `design/` and `public/` before the implementation needs them.

## Git State Intention

The staged asset cleanup is intentional:

- add clean `design/` assets and docs;
- delete old tracked `public/visuals/*` experiments.

The app-code redesign changes were intentionally restored and should not be recovered unless explicitly requested.

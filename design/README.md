# Current visual direction

The canonical editable design is the
[Português com a Inês Figma file](https://www.figma.com/design/c4AYW94iWzVqfRkCjyJs0Y).
Use its approved desktop and mobile frames as the visual specification. Git
owns the production implementation and the browser-ready assets actually used
by the site.

The current direction is:

- dark blue (`#2c54aa` and `#203e82`), lilac (`#aaa4e6`), warm cream
  (`#f5ecd9`), and a small coral accent (`#ef5d3c`);
- organic, irregular, splatty marks rather than geometric emblems;
- Beth Ellen for expressive display text;
- Montserrat for body copy, navigation, labels, and other readable UI text;
- generous spacing and strong contrast, with no horizontal lines baked into
  the artwork.

## References retained in this repository

`design/business-cards/` contains the original business-card exports. They are
historical brand references, not competing website specifications. The blue
business-card splat is the source motif for the current homepage artwork; use
the cleaned production asset rather than placing the card image or its
horizontal rules into the interface.

`design/stickers/` contains the historical sticker sheet. Do not cut new
production assets from it unless a new asset is deliberately reviewed and
approved.

## Production assets

`public/visuals/` is production-only. Every file there must be referenced by
the current site:

- the homepage business-card-derived splat and the approved page fields live
  in `public/visuals/generated-splats/`;
- the small splatty V2 emblems live as SVGs in
  `public/visuals/v2-splats/`;
- the wordmark and paper texture support the shared site shell.

Do not keep contact sheets, rejected generations, alternate raster exports,
mockups, or unused candidates under `public/`.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Creative Assets/Project Assets/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.

# NileLink public brand asset pack — Task 21

Prepared on 22 November 2026 in `codex/public-brand-redesign-2026-11-22`.

## Readiness

48 files are prepared under [`public/brand/nilelink`](../../public/brand/nilelink). Their sizes, SHA-256 hashes, sources, crop positions and readiness are recorded in [assets-manifest.json](assets-manifest.json). The asset pack is isolated from the existing public UI: no page imports, root favicons or global typography have been switched by task 21.

**Remaining dependency:** the licensed **Safiro Medium webfont** (WOFF/WOFF2 and its web-use license). It is not present in the supplied PDF or local asset inventory. Final English typography is pending; the proof uses a system font for its English explanatory text and does not present that as Safiro. Task 21 remains in progress until this dependency is resolved.

The [Atipo source](https://www.atipofoundry.com/fonts/safiro) offers a free Medium download, but the [vendor distinguishes desktop and webfont licenses](https://www.atipofoundry.com/license). A desktop font, demo font or a font loaded by a foundry preview has not been copied into this pack as a production webfont.

## Prepared assets

| Group | Location | Prepared output |
|---|---|---|
| Mark | `logos/mark-*.svg` | Primary Corten/Chalk, reverse, and Patina/Ember diagonal variants |
| Wordmark | `logos/wordmark-{en,ar}-{on-light,on-dark}.svg` | English and Arabic outlined artwork, with no dependency on a runtime logo font |
| Lockup | `logos/lockup-{en,ar}-{on-light,on-dark}.svg` | Mark and wordmark with guide proportions; Arabic mark on the right |
| Raster mark | `logos/mark-primary.png` | Exact embedded 555px RGBA mark from the supplied source |
| Favicons | `favicons/` | SVG, ICO (16/32/48), and PNG at 16/32/48/180/192/512px, not activated at the public root |
| Service icons | `icons/` and `icons/cards/` | Six 24px/2px code-native line icons and six 48px Corten card-chip versions |
| Photos | `images/` | Eight WebP files: source-sized copies and desktop/mobile variants for the two matching photos |
| Pattern | `patterns/corrugation.svg` | Exact 60px repeat: Corten 37px + Rib Shadow 23px, from the independent source pattern |
| Arabic font | `fonts/` | Five self-hosted variable Noto Kufi Arabic WOFF2 subsets, weights 100–900, CSS and OFL notice |

### Artwork provenance and limits

The supplied 30-page PDF contains flattened artwork on pages 13 onward. The SVG mark and wordmarks are **derived outlines of the supplied artwork**, not claimed to be the designer's original vector master. Glyph masks are copied using merged pixel runs; they are not retyped with a substitute font or recreated from a font name. No font binaries were extracted from a raster page.

The mark's tile radius and lockup proportions follow page 13. The isolated primary raster mark is retained as a direct reference. At native source sizes, Chromium rasterization matched the mark foreground and both wordmarks at IoU **1.0**; the rounded-tile silhouette matched at **0.9999727**. This is a fidelity check against the supplied flattened artwork, not a claim of original editable typography. The wordmark assets do not require DX Neuegrid to be hosted on the website; editing the underlying typography would still require appropriate original design/font files.

Service icons are project-authored SVG geometry based on page 17, with a 24px grid, 2px strokes, square caps and miter joins. Card chips follow the Corten/cut-corner appearance of the supplied web layout. They are labelled as reference-based assets rather than exported original designer paths.

### Photography

- Hero: [Brown and White Cargo Ship, photo 3277769](https://www.pexels.com/photo/brown-and-white-cargo-ship-3277769/), **Alexander Bobrov / Pexels**.
- Warehouse: [Men Working in a Warehouse, photo 4481329](https://www.pexels.com/photo/men-working-in-a-warehouse-4481329/), **Tiger Lily / Pexels**.
- [Pexels license](https://www.pexels.com/license/) checked on 22 November 2026. These are illustrative third-party photographs, not records of NileLink's vessels, facilities or employees.
- The two photos were visually matched to page 18 and the web mockups. WebP output has no baked-in headings, gradient or credit label. Credits remain available in the manifest for placement in the UI.
- Desktop/mobile crop centers and pixel dimensions are explicit in the manifest. Source variants preserve the original aspect ratio; derivatives do not upscale the downloaded 2560px source.

### Fonts

Noto Kufi Arabic is the **temporary Arabic family specified by page 14**, not a claim that the final Arabic font has arrived. It comes from [Google Fonts' official family](https://github.com/google/fonts/tree/main/ofl/notokufiarabic), with its [OFL notice](../../public/brand/nilelink/fonts/OFL.txt). The supplied local CSS references local WOFF2 files and uses `font-display: swap` and unicode ranges.

Safiro Medium remains an explicit pending input. DX Neuegrid is restricted by the reference to the wordmark: the prepared outline assets provide that existing artwork without embedding or redistributing the font software.

## Existing assets

[existing-assets-inventory.json](existing-assets-inventory.json) records the 23 pre-existing files under `public/images` and `public/fonts` with hashes and sizes. They are preserved. The previous stock-photo hero and old logo have not been renamed as the new approved assets.

The pre-redesign snapshot is `codex/external-site-before-brand-redesign-2026-11-22` at `88d55c1`. It remains available in both application remotes. No reset or history replacement is required to use it as a reference.

## Reproduce and verify

Use the bundled Python with Pillow, numpy and pypdf. The source exporter is calibrated to the PDF SHA-256 in the manifest and rejects a different source before exporting.

```text
node --use-system-ca scripts/brand/fetch-reference-assets.mjs
python scripts/brand/prepare-assets.py --pdf /path/to/1.pdf --hero .private/brand-assets/hero-original.jpg --warehouse .private/brand-assets/warehouse-original.jpg
python scripts/brand/verify-assets.py
```

Fetch uses only the documented public Pexels, Google Fonts and Google Fonts license sources. Paid fonts are user-supplied dependencies. Raw high-resolution inputs and the original PDF are not committed.

If regenerating an asset changes its bytes, review it, rerun the browser/source comparison, and update the manifest deliberately; the integrity verifier will reject stale hashes. The current browser proof checked 1280px and 390px: every image loaded, the Arabic webfont loaded, and neither view overflowed horizontally. Light/dark logo versions and the 16px mark were visually inspected.

## Handoff to tasks 22–30

- Import assets from `/brand/nilelink/...` rather than replacing shared root files.
- Keep styling isolated to the marketing site; these assets do not modify portal/admin service identities.
- Use the correct logo context and Arabic mark placement. Do not stretch the supplied viewBox.
- Read the pending font input before claiming final English typography fidelity.
- Full homepage implementation, integration and live release are tracked by subsequent tasks; task 21 prepares the pack.

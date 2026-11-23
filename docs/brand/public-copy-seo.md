# Task 29 — Public copy, languages and search metadata

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production.

## Editorial review

The source PDF's pages 6–8 were rendered and read separately from the implementation pass, then compared with the final Arabic/English messages and pages. Pages 29/30 remain the homepage composition/copy references. This is a documented second editorial pass by the implementing assistant, not a claim of external client approval.

| Source principle | Final treatment |
| --- | --- |
| Freight and customs from Damietta | Consistent homepage, service, company and search descriptions |
| Every cost on its own line; inclusions/exclusions | Retained in hero, quote explanation and how-we-work copy |
| Direct Egyptian Arabic; equivalent natural English | Plain AR/EN copy; no literal translation of idioms or exclamation-heavy sales claims |
| Complete shipment reference and visible updates | Explained as request stages and available updates after confirmation; no universal live/GPS tracking promise |
| No unsupported superlatives or numerical promises | Removed leading/best/No.1 claims, fixed transit ranges, dollar comparisons, free-quote claim, guaranteed compliance and two-hour/24-hour availability promises from the primary public copy |
| Missing warehouse/insurance detail | Complete enquiry wording, asking for actual storage/cargo requirements or insurance enquiry; no placeholder text, storage-facility capability or coverage guarantee |

Service feature lists now describe information/review steps instead of unverified coverage, climate control or safety/compliance guarantees. Existing comparisons use route-dependent wording and itemized quote costs. FAQ answers no longer promise all cargo types, door-to-door availability or numerical transit times. Existing values remain statements of approach rather than certifications. Form validation and toast messages in the branded AR/EN full forms are localized; endpoint contracts are unchanged.

New AR/EN sections remain scoped to their existing two-language design. All seven language routes remain available, without new raw translation keys. The other five languages keep their existing detailed layouts/copy; their homepage metadata, hero subtitle and secondary-page metadata use neutral localized descriptions. This task does not claim a new full-brand translation of those five detailed sites.

## Search and identity

- `lib/public/site.ts` is the approved public origin/name/description/share-image source: `https://nilelinklogistics.com`.
- Page canonical, OG URL and all seven hreflang variants preserve the current route, with an English x-default. Homepage metadata is generated explicitly. Absolute titles avoid inherited title-template duplication and do not append the brand twice to a title already ending in NileLink.
- Locale layout no longer assigns its homepage canonical to every child page. Root HTML language is server-rendered from the request locale and continues to update on client language navigation.
- The share image is a generated 1200×630 PNG using the approved outlined lockup, brand palette and rib pattern. `scripts/brand/build-social-share.mjs` reproduces it. It is outside the frozen 48-file asset pack; the pack's checksums and preserved legacy inventory still pass.
- Prepared brand SVG/PNG/ICO/apple icons are active in metadata; the automatic App Router favicon is also the approved brand ICO. Public legacy assets remain unchanged.
- Organization/office JSON-LD uses the same origin, brand, configured company name, phone, email, maps and real configured social links. Removed invented social profiles, customer-support language claims and unsupported 24/7 opening hours. No reviews, ratings or certifications were added.
- JSON-LD is rendered as escaped script content in the initial page markup, rather than inserted only after mount. Business schemas are limited to the five public routes. FAQ schema matches visible FAQ content on its applicable page.
- Sitemap has exactly 35 public URLs and matching language alternates. Removed fake request-time modification dates. Robots references the correct sitemap and excludes API/private/auth routes from crawling; existing authorization logic is unchanged.

## Verification

- Three persistent SEO contract tests passed across all locale/path combinations: canonical/hreflang/title behavior, 35 sitemap URLs and private-route robots directives.
- Actual Next.js webpack/Chrome: all 35 public locale/route combinations passed canonical/alternate/OG/share-image/structured-data checks, with no raw new translation keys, browser page errors or missing-message errors.
- Raw server HTML language checked for all seven locales. Arabic form validation visibly localized; query and fragment survived language navigation. Actual sitemap/robots and share image returned successfully.
- Share image visually inspected at 1200×630. Arabic quote error state captured. Source/JSON message review performed separately after writing; placeholder and claim checks scoped to the reviewed AR/EN public content.
- TypeScript, targeted ESLint, whitespace checks, the seven quick-quote handler regression tests and the existing 48-file asset verification passed. No live email was sent; browser API/map responses were mocked.
- No customer/admin/API business files changed. Full production build and release remain task 30.

Previously documented release dependencies remain explicit: licensed Safiro webfont, approved policy content/routes and confirmation of the configured phone/WhatsApp discrepancy. Detailed warehouse/insurance offerings require company information before adding capability/coverage claims. The current enquiry copy is complete and does not invent those details.

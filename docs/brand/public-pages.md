# Task 28 — Remaining public pages

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production. These secondary-page layouts are derived from the brand system; PDF pages 29/30 only specify the homepage.

## Inventory and retained contracts

| Existing route | Content/functions before this change | Result |
| --- | --- | --- |
| `/about` | Company story, mission, vision, six values, quote CTA | Retained in scoped brand sections/cards; approved warehouse image replaces the old photo collage |
| `/services` | Six detailed services with four features each, comparison, quote CTA | All original details and anchors retained; homepage's shared service names/short descriptions/icons introduced, plus insurance enquiry content |
| `/request-quote` | Full RHF/Zod form posting to `/api/quote`, office/support information | Same fields, validation/payload/endpoint and reset/error behavior, opt-in brand controls and linked labels; office/support content retained |
| `/contact` | Configured contact channels, message form posting to `/api/contact`, office map | Channels, secondary phone, map and full form preserved; offices/support information and relocated FAQ shown here |

Full quote fields remain first/last name, company, email, phone, freight type (air/road/ocean), weight, quantity, from/to and notes. Contact fields remain name, email, optional phone/subject and message. APIs, schemas, recipient settings and delivery code were not modified. Inputs have explicit IDs/labels, error descriptions and invalid states; branded forms use design-system controls/buttons and display no duplicate inner heading. Email/phone inputs use LTR. Other languages retain their legacy visual variant.

## Content moves and links

- AR/EN homepage now contains exactly hero → six services → how we work → quick quote; the shared footer follows it. Legacy sections remain for the five other languages until their localization task.
- The short company preview duplicated the longer story; its substance is retained in the company story. WhyChooseUs and GlobalCoverage content, including the six regions, moved to `/about` under `#why-nilelink` and `#coverage`. The old decorative world map/emoji regions were replaced with translated region labels.
- FAQ items and their structured data moved from the homepage to `/contact#faq`; native details/summary controls replace the animated accordion. Quote CTAs remain available on the corresponding public pages; repetitive homepage CTAs were consolidated into its quote section.
- All six original service anchors remain: `sea-freight`, `air-freight`, `road-freight`, `customs-clearance`, `warehousing`, `specialized`. Old homepage camelCase fragments have explicit aliases: `seaFreight`, `airFreight`, `roadFreight`, `customsClearance`.
- Homepage and service detail cards now share one service definition. Specialized services remain available as the existing additional section. Insurance stays an enquiry, with no new operational service/API.
- Existing shipping comparisons are retained with an explicit indicative-estimate note; no new prices or transit promises were introduced.
- The map coordinates come from `CONTACT.MAPS`. The configured channels and translated office addresses remain the contact source. Known source phone/WhatsApp differences remain pending release review rather than guessed corrections.

## Isolation and shared navigation

The route allowlist covers only `/`, `/about`, `/services`, `/request-quote`, `/contact` in AR/EN. Other languages, login/registration/recovery, invoice, customer portal, admin and analytics keep their existing layouts. Portal/admin suppression remains ahead of the new public header/footer branch. No internal business files were changed; CSS Modules and BrandScope isolate the public palette/fonts.

Secondary pages share the solid Steel header and new footer. Header language switching retains pathname, query and fragment. Footer top links target `#public-page-title` on secondary pages and `#public-home-title` on the homepage. The current metadata route functions remain intact. The FAQ schema is rendered on its new visible page.

## Verification

- Actual Next.js webpack server + Chrome: 24 AR/EN cases (four secondary routes × 1440/768/390 px), dark system preference and reduced motion. One header, one footer, one H1, labelled form controls, no horizontal overflow or page errors; sampled legacy blue colors absent. Desktop company/quote and mobile Arabic contact screenshots visually reviewed.
- Four localized form suites with mocked receivers: invalid input does not dispatch; 503 retains input; accepted original payload resets input. No live messages were sent.
- Six original service anchors checked, plus camelCase aliases and query/fragment-preserving language navigation at 360 px. Homepage section order and FAQ interaction checked. French company page retains its old variant.
- The map initially caused 640 px intrinsic overflow on mobile; an explicit 100% inline size fixed it. Map network content was replaced by a test response during browser QA.
- Existing full quote API was exercised separately with an isolated email receiver. The seven quick-quote handler regression tests still pass.
- TypeScript, targeted ESLint and whitespace checks passed after regenerating stale development route types. Full production build and release are task 30.

Private evidence: `.private/task28-*`. Safiro, approved policy content/routes, detailed insurance copy and final contact-data review remain the previously documented release dependencies. No placeholder policies or operational facts were invented.

# Task 25 — How we work

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production.

`PublicHowItWorks` follows the services section on Arabic and English homepages. The approved warehouse photograph sits at inline start beside three steps on desktop (right in Arabic, left in English); it comes first above the steps at ≤800 px. The image wrapper reserves a 3:2 aspect ratio, uses cover cropping and localized descriptive alternative text. The image is the prepared licensed reference asset; its source attribution is retained in the brand asset manifest.

Steps explain shipment details, an itemized quote with inclusions/exclusions, and shipment updates linked by one reference. Corten numbers, Steel separators and Quay surfaces use the scoped public palette. The semantic ordered list remains readable without animation. No business workflow, request creation or internal service steps were changed.

The homepage header now links to the localized `/#how-we-work` target rather than the temporary company-page link. The target has 24 px scroll margin. The header remains in normal document flow. Other languages keep the legacy homepage and header; font readiness remains as documented in task 21.

## Verification

- TypeScript, targeted ESLint and whitespace checks passed.
- Actual local Next.js webpack server and Chrome: Arabic and English at 1440, 1280, 768, 390 and 360 px. Three complete steps, 01–03 numbering, loaded image/alt text, 2 px separators, correct image ordering and no horizontal overflow or browser page errors.
- Header anchor clicked successfully in both locales at every viewport, including dark system preference and reduced motion.
- English desktop and Arabic mobile screenshots visually reviewed. French retains its legacy homepage.
- Browser API responses mocked; no live business data mutations or messages. Private evidence: `.private/task25-*`. Full production release verification remains task 30.

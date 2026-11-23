# Task 24 — Public services grid

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production.

Arabic and English homepages now show the brand services section immediately after the hero. Four columns on desktop (>1100 px), two on intermediate screens, one at ≤600 px follow the reference's desktop and mobile arrangements. RTL uses natural grid order. Six Chalk cards sit on Quay with the same Corten icon chips and Steel text; no per-service external palette or new photography was introduced.

Services: sea freight, air freight, land transport, customs clearance, warehousing and cargo insurance. Existing service anchors were checked and are used for the first five cards. Insurance opens the existing contact page as an inquiry. Whole-card links have descriptive names and visible keyboard focus; decorative icons have empty alternative text.

Copy follows the approved reference for the first four services. Warehouse copy uses only existing company copy's short/long-term storage offering. The PDF's insurance placeholder is replaced with a neutral invitation to inquire, without claims about coverage, eligibility, pricing or insurers. Detailed approved insurance copy remains a content dependency before final release. No insurance operation, request type, invoice item or backend API was added. Safiro remains pending in task 21; existing documented font fallbacks apply.

Other languages retain the legacy services component and page order. Internal customer/admin pages and business logic were not modified.

## Verification

- TypeScript, targeted ESLint and whitespace checks passed.
- Actual local Next.js webpack server and Chrome: AR/EN at 1440, 1280, 768, 390 and 360 px; six cards, expected column counts, loaded icons, correct Chalk surfaces under dark preference, no horizontal overflow or page errors.
- Visible keyboard focus checked for each viewport. English desktop and Arabic mobile screenshots visually inspected against the prepared reference images.
- Existing service destination anchors and contact page rendered successfully; French retained its legacy section. API responses were mocked in the browser; no business mutations or messages.
- Private browser results/screenshots: `.private/task24-*`. Full production build and combined release remain task 30.

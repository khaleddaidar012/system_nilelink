# Task 23 — Public homepage header and hero

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production.

Arabic and English homepages use `PublicHomeHero`, scoped to the public design system. The header includes the outlined brand lockup, services, how we work, quote, language and account links. Navigation stays in document flow, with two rows on smaller screens. The existing header and hero remain available in the other five languages; other public pages retain their header until task 28.

The hero uses the approved ship photograph with a Steel scrim, selectable localized copy, quote and configured WhatsApp links, and photographer attribution. Image dimensions reserve the logo's aspect ratio. Account links use the existing authenticated role response; authorization remains enforced by the existing protected routes. No business APIs were changed.

`How we work` currently links to the existing company page (`/about`); task 25 will introduce the dedicated homepage section. Quote and services links use existing routes. English uses the documented Arial fallback until licensed Safiro webfonts are supplied (task 21). Arabic uses the temporary self-hosted Noto Kufi family. This is a partial homepage integration, with the lower sections scheduled in tasks 24–28.

## Verification

- TypeScript and targeted ESLint passed; `git diff --check` passed.
- Actual Next.js 16 webpack development server, Chrome headless: Arabic and English at 1440, 1280, 768, 390 and 360 px. No page or hero horizontal overflow; title below the header; seven language choices; correct quote and WhatsApp destinations; no browser page errors.
- Customer and staff API responses mocked in the browser: correct `/portal` and `/admin` links. Guest login link remained visible. No live account mutations or messages.
- English → Arabic client navigation passed. French retained its existing homepage.
- Dark system preference, reduced motion and visible keyboard focus passed at 390 px. Desktop English and mobile Arabic screenshots visually inspected.
- Existing root `next/font` Google downloads reported a local certificate error and used their existing fallbacks. The new scoped Arabic font is self-hosted; Safiro remains pending. Full production build/release verification is reserved for task 30.

Local preview cache exhausted disk space initially. Only `.next/dev` was cleaned after stopping this task's preview processes, then the actual application was verified using webpack. Private screenshots and detailed browser results are retained locally under `.private/task23-*`, not published as project assets.

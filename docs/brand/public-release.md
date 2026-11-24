# Public brand release — task 30

Release candidate preparation: 2026-11-23. Live verification and final deployment identifiers are recorded below when completed.

## Approved release decisions

The user explicitly approved publishing with the current temporary English fallback while Safiro is unavailable, and retaining the configured call number `+20100018549`. WhatsApp remains `+201000018549`. Final Safiro typography fidelity is not claimed; its licensed webfont remains a deferred follow-up. Arabic uses the previously documented temporary self-hosted Noto Kufi family.

Warehouse/insurance copy is complete enquiry wording with no invented capabilities or coverage. Privacy/terms enquiries link to contact; no fictitious policy pages were added. Approved detailed business/policy content can be added separately without blocking these working routes.

## Candidate changes and regression checks

- Homepage assembled in the approved order; ten AR/EN viewport checks at 1440, 1280, 768, 390 and 360 px passed. Keyboard focus, labelled controls, ≥24 px primary navigation/control targets, reduced motion and no horizontal overflow checked.
- Native picture sources preserve the hero source aspect ratio and existing CSS crop. Mobile selects 720 px (36,248 bytes), intermediate screens 1280 px, large screens 1920 px; only one hero image request is made. The previous fixed source was 558,392 bytes. Warehouse images also select an appropriate existing derivative. No original frozen identity assets were changed.
- Portal service/timeline fixture rendering passed eight combinations of AR/EN, light/dark and 1280/390 px. White/neutral panels and matching service-colored markers remain intact; no marketing palette overrides leaked into the fixture.
- Existing financial/permission/account-health/service-visibility tests exercised local D1 fixtures only. Two old accounting assertions predated the current workflow: completing a service without all stages and blocking initial processing on missing UCR. The test now completes stages through the actual tracking API, checks missing-reference stage blocking, and verifies operational reassignment without repeating an already-completed confirmation. Application business logic was not changed to satisfy those tests.
- Public quick/full quote and contact success/error cases were tested with isolated/mocked receivers in tasks 26–29. Release checks do not send messages to staff or customers.

## Build and deployment procedure

Use the existing `scripts/d1/build-audit.mjs --worker --first-launch` workflow and its unpublished-workspace refresh support. Build sources have placeholder credentials, local D1 configuration, no copied dotenv files and verified dependency trace isolation. Deployment uses the existing guarded live-project script and current resource bindings; it does not migrate or rewrite customer data.

The isolated candidate workspace is `734ac246-b644-49fd-9f86-7910f273bd55`. An initial production build passed before final responsive-image review; a refreshed build is required for the final source revision. Production before/after performance is measured on local compiled versions with the same browser/CPU/network settings; results are laboratory comparisons, not field/Core Web Vitals guarantees.

## Rollback

Active production live Worker version (restored after initial release check): `d677c245-f706-48f3-8b4c-13237b76b9d6` (100% traffic on `nilelink-system` / `https://nilelinklogistics.com`). Earlier pre-preparation snapshot recorded before Nov 22 was `0a41ea54-36cc-4372-aded-07f01c231113`.

The Git backups `backup/main-before-brand-redesign-2026-11-23` and `codex/external-site-before-brand-redesign-2026-11-22` at `88d55c19da7f144ed67bbe483fa8dd2e98b47555` are reachable on both `origin` and `new_origin`. Prefer a Worker-version rollback for an immediate deployment failure. A source rollback must selectively restore marketing files after reviewing subsequent changes; never reset main or financial/customer records wholesale.

## Preview verification and performance (2026-11-24)

- Source revision built and previewed: `d97ed0e` (includes `codex/fix-brand-language` footer organization and RTL language selector chevron fixes on top of `8194c99`).
- Automated tests: `10/10` public tests (`tests/public/quick-quote.test.mjs`, `tests/public/seo.test.mjs`) and `96/96` D1 regression tests (`accounts`, `finance`, `account-health-consistency`, `service-colors`, `shipment-accounting`, `timeline-groups`, `visible-services`) passed.
- Refreshed isolated Worker build (`scripts/d1/build-audit.mjs --worker --first-launch --refresh-unpublished-workspace 734ac246-b644-49fd-9f86-7910f273bd55`) passed with TypeScript check, 380 static pages, and verified trace isolation.
- Isolated preview deployment (no production D1/R2/email bindings): `nilelink-brand-preview` — `https://nilelink-brand-preview.mohamedznaty55.workers.dev` (Version ID `5115c058-54f0-4f01-a089-cee52745fbc8`).
- Route and asset checks on preview: `35/35` public routes across all 7 locales returned `200 OK`; `/ar/login`, `/en/login`, `/robots.txt`, `/sitemap.xml`, responsive hero images (`hero-720.webp`, `hero-1280.webp`, `hero-1920.webp`), brand logos, and `/brand/social-share.png` all returned `200 OK`; invalid `/api/quick-quote` payload rejected with `400` without dispatching email.
- Laboratory Chrome headless comparison (`https://nilelinklogistics.com` before vs `https://nilelink-brand-preview.mohamedznaty55.workers.dev` after, cache disabled, zero console errors, zero horizontal overflow):
  - Desktop AR (`1280x800`): HTML `158 KB -> 116 KB` (`-26%`), image transfer `844 KB -> 173 KB` (`-79.5%`), total transfer `1,175 KB -> 686 KB` (`-41.6%`), LCP `3,048 ms -> 2,796 ms` (cold preview hit; warm median HTTP `166 ms` vs `321 ms`), CLS `0.0218`.
  - Desktop EN (`1280x800`): HTML `137 KB -> 95 KB` (`-31%`), image transfer `844 KB -> 173 KB` (`-79.5%`), total transfer `1,140 KB -> 494 KB` (`-56.7%`), FCP `980 ms -> 692 ms`, LCP `3,108 ms -> 692 ms` (`-77.7%`), CLS `0`.
  - Mobile AR (`390x844`, 2x DPR): image transfer `530 KB -> 129 KB` (`-75.7%`), total transfer `822 KB -> 638 KB` (`-22.4%`), FCP `2,368 ms -> 776 ms`, LCP `4,216 ms -> 852 ms` (`-79.8%`), CLS `0.0047`.
  - Mobile EN (`390x844`, 2x DPR): FCP `732 ms`, LCP `828 ms`, total transfer `582 KB`, CLS `0`.

## Final evidence

Preview verification and laboratory before/after measurements are complete. Guarded live production deployment to `https://nilelinklogistics.com` and final post-launch live verification remain pending explicit user approval after reviewing the preview URL. No live release is claimed yet.

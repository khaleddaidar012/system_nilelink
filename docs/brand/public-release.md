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

Before-deployment live Worker version: `0a41ea54-36cc-4372-aded-07f01c231113` (100% traffic), deployment `017cd8a4-9800-4d3b-8e46-0c8e7e66f761`. The version was read from Cloudflare immediately before release preparation.

The Git snapshot `codex/external-site-before-brand-redesign-2026-11-22` at `88d55c19da7f144ed67bbe483fa8dd2e98b47555` is reachable on the application remote. Prefer a Worker-version rollback for an immediate deployment failure. A source rollback must selectively restore marketing files after reviewing subsequent changes; never reset main or financial/customer records wholesale.

## Final evidence

Pending final candidate build, production-preview performance, guarded deployment and live verification. No live release is claimed by this preparation record alone.

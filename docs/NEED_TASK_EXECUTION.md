# Requested tasks — execution log

Source: D:\khaled\nilelink_last_version\need_task. Target explicitly confirmed: D:\khaled\nile_link_website-main.

Production uses Cloudflare Workers, D1 and R2. Proposed MongoDB paths and example domains in the task documents were adapted to this runtime; existing data was preserved.

| # | Delivered behavior | Validation / publication |
|---|---|---|
| 1 | Branded sender, Reply-To, multipart text/HTML and corrected SMTP sender; provider/DNS deliverability audit | Four email tests passed; deployed. Yahoo Inbox placement still needs actual recipient headers and controlled inbox testing. |
| 2 | Responsive editable account dialog, initials/photo, private R2 avatar upload, 2MB JPG/PNG/WEBP validation, language/theme/password/logout actions | 25 account tests passed, including avatar byte validation and isolation. Deployed and read-only live checks passed. |
| 3 | Bounded customer-scoped D1 SSE, active-session revalidation, visibility pause, reconnect and 30-second polling fallback; live refresh subscribers and connection indicator | Account/live snapshot tests passed. Deployed; anonymous and staff event access denied in live checks. Typical SSE detection interval: five seconds. |
| 4 | No unspecified option in the shipping operation dropdown; required valid shipping/customs operation checked by the server | Workflow tests passed. Deployed. General inquiries retain their non-shipping operation semantics. |
| 5 | Quote-scoped customs-reference snapshot and acceptance notice; UCR updates address only the current quote of that request | Regression test changes the parent reference after issue and verifies the accepted quote's own reference. Deployed. |
| 6 | EGP for new quotes and new direct invoices; stored legacy currencies preserved and currency-specific price formatting | Workflow default/edit currency tests passed. Deployed. No existing money was converted or relabeled. |
| 7 | Seven-step AR/EN spotlight tour for new customer records, skip/Escape/outside dismissal, scoped persisted completion and account-menu replay | Onboarding ownership test and TypeScript passed. Deployed. Existing records without the flag are not interrupted. |
| 8 | Exact decimal tier selling prices in accounting lines, manager/staff permission controls, default OFF, customer breakdown and PDF tier rows | Thirty pricing/accounting tests plus a dedicated server permission test passed; deployed; read-only live verification passed. |
| 9 | Per-service details modal and selection; server-calculated partial acceptance, declined service cancellation and activation guards | Workflow tests plus dedicated partial-acceptance test passed; deployed; read-only live verification passed. The combined selected total is intentionally omitted per task 11. |
| 10 | Customs-only UCR section, staff provide/request workflow, customer submission, stale-write/ownership guards and notifications | Dedicated UCR workflow test passed; deployed; read-only live verification passed. Quote creation and acceptance do not require UCR first. |
| 11 | Removed customer quote aggregate totals from lists, summaries, modal and request view; retained service prices and invoice/admin totals | TypeScript and source/UI integration checked; deployed; read-only live verification passed. Direct quote URLs reuse the shared modal. |
| 12 | Ordered per-service sea/road/customs trackers, staff notes, timestamps, responsible-staff editor, guarded stage corrections and live refresh | Dedicated stage ordering/concurrency/ownership test passed; deployed; read-only live verification passed. Historical completed services retain their completed view. |
| 13 | Direct create/open request accounting draft without a fabricated shipment; accepted selling prices prefilled, internal costs left for review, atomic request link and retry behavior | Dedicated create/seed/publish/privacy/bypass test passed; deployed; read-only live verification passed. Existing invoice publication approvals remain mandatory. |

## Runtime notes

- A single portal SSE connection dispatches invalidation events. The backend compares scoped D1 revisions across Worker instances. Each stream is bounded to stay within the Free plan query budget and is renewed by the client. No process-local event bus or MongoDB change stream is used.
- New customer records explicitly receive an onboarding flag; completion is stored in their own user JSON and cached under a per-user localStorage key. Legacy users can replay manually.
- Tier prices define selling amounts, not internal costs. All customer-facing tier structures are explicitly projected; internal notes and staff accounting metadata are excluded.
- Task 13 uses the same accounting draft/review/publication engine for request invoices and shipment invoices. A request accounting marker distinguishes them; no dummy shipment is created. Legacy editing endpoints cannot bypass publication controls.
- New JSON fields fit the existing D1 document schema. No production migration, financial mutation or operational stage mutation was needed during verification.
- Code-level and authenticated read-only live checks are recorded under .private. Visual browser click-through and real Yahoo Inbox placement have not been claimed.

Email operational follow-up: [EMAIL_DELIVERABILITY.md](EMAIL_DELIVERABILITY.md).

## Final release

Published and verified on 2026-11-16. Cloudflare Worker version: c5f9b062-bbb4-472a-b7ca-1243846754ab. Live checks confirmed the new admin UCR/tracking routes, protected invoice-creation route, tiered-pricing permission, and deployed request-invoice, partial-acceptance and tier-editor client bundles. No production invoice or service-stage test records were created.

The combined regression run covered 95 cases; two legacy assertions were updated for the newly requested customs-only reference rule, and the complete accounting suite then passed all 27 tests. Six final integration scenarios passed, as did separate direct-invoice concurrency and live-snapshot isolation checks. TypeScript, targeted ESLint and isolated workerd PDF generation passed. Invoice and statement PDFs were rendered and visually inspected; tier rows showed no overlap or clipping.

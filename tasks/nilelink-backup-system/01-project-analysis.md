# Task 01 — Project Analysis

## Objective

Document the **current** Nile Link architecture (as discovered in the repository) so every later task builds on facts, not assumptions. This task proposes no implementation.

## Why This Is Needed

The backup feature touches auth, DB, deployment, secrets and admin UI. Several findings below directly change the design (Atlas DB, Workers runtime, hard-coded secrets, in-memory rate limiter).

## Existing Project Files Involved

See the findings below; every path was inspected.

## New Files To Create

- None (documentation only; this file *is* the deliverable).

## Files To Modify

- None.

## Findings

### 1. Next.js architecture
- Next.js **16.2.10**, React 19.2.4, App Router, TypeScript, Tailwind v4 (`package.json`, `postcss.config.mjs`, `tsconfig.json`).
- i18n via `next-intl`: `i18n.ts`, `i18n/`, `navigation.ts`, locale-prefixed pages under `app/[locale]/…`. Locales seen in `middleware.ts`: `ar, en, fr, de, it, zh, bg` (messages in `messages/*.json`).
- `middleware.ts` skips `/api`, `/_next`, `/uploads`, and any path containing `.`; it only enforces email-verification redirect for `/portal`. **It does NOT protect `/admin`.** Admin protection is done in `app/[locale]/admin/layout.tsx` (server component).
- Zod 4 + react-hook-form for validation; `sonner` is a dependency; `components/ui/Toast.tsx` exists (not yet inspected in depth — verify before reuse in Task 09).

### 2. MongoDB integration
- `lib/mongodb.ts` → `connectDB()` using **Mongoose 9**, cached on `globalThis`, reads `MONGODB_URI` from `process.env` or `getCloudflareContext().env`. Timeouts: 5 s server selection, 15 s socket.
- Models in `lib/models/` (19 files): `User, Customer, CustomerRequest, Document, DocumentActivityLog, Invoice, InvoiceActivityLog, InvoiceSequence, Notification, Payment, PricingRule, Quote, QuoteItem, RequestService, RoleConfig, ServiceConfig, SystemSetting, AnalyticsEvent`, plus `index.ts`.
- **Production DB is MongoDB Atlas** (a `mongodb+srv://…@cluster0….mongodb.net/nilelink` URI is configured in `wrangler.jsonc` → `vars.MONGODB_URI`). `.env.example` uses `mongodb://localhost:27017/nilelink` for dev. ⇒ The Windows agent will dump a **remote Atlas database over the internet**, not a local one.
- Database name: `nilelink`.

### 3. Authentication
- Custom JWT with `jose` in `lib/auth/token-service.ts`: HS256, cookies `nilelink_access_token` (1 h) and `nilelink_refresh_token` (7 d), httpOnly, sameSite=lax, secure in production.
- Helpers: `getServerSession()` (server components) and `getSessionFromRequest(request)` (route handlers, parses the Cookie header manually).
- Other auth files: `lib/auth/session.ts`, `otp-service.ts`, `password.ts`, `rate-limiter.ts`.
- ⚠ `getJwtSecret()` falls back to a **hard-coded literal secret** if env vars are missing.

### 4. Authorization & roles
- `UserRole = "customer" | "customer_admin" | "staff" | "super_admin"` (`lib/models/User.ts`).
- `lib/auth/rbac-guard.ts` → `requireAuth(request?, allowedRoles?)` returns `{session}` or a `NextResponse` 401/403. **Best fit for the backup APIs:** `requireAuth(request, ["super_admin"])`.
- `lib/auth/require-permission.ts` → `assertStaffPermission(request, key?)`; `super_admin` bypasses key checks; `staff` needs a key from `IStaffPermissions` (`canSendAlerts, canReviewDocuments, canManageCustomers, issueTaxInvoice, createInvoice, …`). **No backup-related permission key exists.** Recommendation: do **not** add a staff permission; restrict to `super_admin`.
- JWT carries role and staffPermissions snapshot; it is **not re-validated against the DB per request** (a demoted admin keeps access up to 1 h). Acceptable for read-only backup listing, but restore should re-check the DB (see Task 11/14).

### 5. Dashboard structure
- `app/[locale]/admin/layout.tsx`: requires session, role `staff` or `super_admin`, else redirects to `/portal`. Renders `components/admin/AdminSidebar.tsx` + `<main>`.
- Pages: `admin/{page,customers,documents,invoices,notifications,operations,pricing,quotes,requests,settings,staff,coming-soon}`.
- `AdminSidebar.tsx`: static `coreNavItems` array (dashboard, review queue, customers, requests, quotes, invoices, notifications, staff, settings), labels via `t("admin.sidebar.*")` with Arabic/English inline fallbacks (`isAr`). **There is no "System" group yet.**
- `admin/settings/page.tsx`: client component using `AdminHeader` + `DocumentCategoriesManager` — the pattern to follow for a new admin page.
- Design tokens: Tailwind classes `primary-*`, `secondary-*`, slate dark mode, rounded-xl cards, `lucide-react` icons, `cn()` from `lib/utils.ts`.
- ⚠ Layout allows `staff` as well; the Backups page **must additionally** gate to `super_admin` (layout alone is insufficient).

### 6. API structure
- Route handlers under `app/api/`: `admin/{analytics,customers,documents,invoices,notifications,operations,payments,pricing-rules,quotes,requests,roles,services,settings,staff}`, `auth`, `portal`, `cron/check-expiries`, `invoice`, `quote`, `seed`, `settings`, `analytics`, `contact`, `env-test`.
- Pattern reference: `app/api/admin/staff/route.ts`, `app/api/admin/documents/[id]/verify/route.ts`. `API_INVENTORY.md` (repo root) lists all endpoints — update it in Task 08.
- ⚠ `app/api/env-test` and `app/api/seed` should be reviewed (potential info-leak/danger) — out of scope but noted.

### 7. Environment variables
- `.env.example` documents: `MONGODB_URI, JWT_SECRET, AUTH_SECRET, CRON_SECRET, NEXT_PUBLIC_APP_URL, EMAIL_*, WHATSAPP_*, R2_*`.
- Also present: `.env`, `.env.local` (local only), `cloudflare-env.d.ts` (CloudflareEnv typing).
- Runtime resolution pattern in the repo: `process.env.X` first, then `getCloudflareContext().env.X` (see `lib/mongodb.ts`). Backup settings (agent URL/secret) must follow the same pattern.

### 8. Cloudflare / OpenNext deployment
- `wrangler.jsonc`: worker name `system-nilelink`, `main: .open-next/worker.js`, compat flags `nodejs_compat`, `nodejs_compat_populate_process_env`, assets binding, observability logs/traces **enabled with persist**.
- `open-next.config.ts`, `next.config.mjs`, `patches/@opennextjs+aws+4.0.2.patch` (patch-package postinstall).
- Deploy: `.github/workflows/deploy.yml` → on push to `main`, `npm ci` + `npm run cf-deploy` using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets. Docs: `CLOUDFLARE_GUIDE.md`.
- ⚠ **`wrangler.jsonc` `vars` contains plaintext secrets** (`MONGODB_URI` with credentials, `JWT_SECRET`, `AUTH_SECRET`, `CRON_SECRET`) committed to git, and Worker logs are persisted. Backup secrets (agent HMAC key) **must NOT** be added there; use `wrangler secret put`.
- Workers constraints: no filesystem, no child processes, request body size limits, CPU/time limits, isolates (no shared memory between requests).

### 9. Existing logging
- Only `console.error` in routes (e.g. `app/api/cron/check-expiries/route.ts`). No structured logger.

### 10. Existing audit functionality
- `lib/models/DocumentActivityLog.ts` and `InvoiceActivityLog.ts` — **entity-bound** (require `documentId`/`customerId`). They cannot represent system-level events like backups. ⇒ A new `SystemAuditLog` model is required (Task 15). Use them as style reference (actorId/actorName/actorRole, ipAddress, userAgent, createdAt, indexes).

### 11. Reusable pieces
- `lib/mongodb.ts` (`connectDB`), `lib/auth/rbac-guard.ts`, `lib/auth/rate-limiter.ts` (⚠ in-memory `Map` — ineffective across Worker isolates; do not rely on it for backup rate limiting), `lib/storage/r2-storage.ts` (R2 client; local fallback `storage/r2_local_fallback`), `components/admin/AdminHeader.tsx`, `components/ui/Button.tsx`, `components/ui/Toast.tsx`, `lib/utils.ts` (`cn`), `lib/validations/` (zod schemas), `lib/cron/expiry-tracker.ts` + `app/api/cron/check-expiries/route.ts` (existing cron-secret pattern: `Authorization: Bearer <CRON_SECRET>`).
- Translation tooling: `add_admin_keys.js`, `add_sidebar_keys.js`, `scripts/generate-locales.mjs`.

### 12. Deployment constraints / risks that shape the design
1. Workers cannot access `C:\NileLink\Backups` ⇒ separate agent mandatory.
2. Workers → agent requires a reachable HTTPS endpoint (see Task 02 decision).
3. mongodump does **not** include Cloudflare R2 objects (customer documents). Scope question (Task 02).
4. Backups contain PII and `passwordHash`, OTP fields ⇒ encryption-at-rest and access control are required.
5. Secrets are hard-coded in repo ⇒ rotate before/along with this work (separate remediation, flagged to the user).
6. `cred.md` exists in the repo root — verify it is git-ignored/untracked and contains no live secrets.
7. `tsconfig.json` likely type-checks all `**/*.ts` ⇒ a `backup-agent/` folder inside the repo must be excluded from the Next build (Task 03).
8. `.gitignore` has no entry for `storage`/backup dirs — ensure no backup artifacts can ever be committed.

## Implementation Tasks

- [ ] Re-verify `components/ui/Toast.tsx`, `AdminHeader.tsx`, `lib/models/index.ts`, `tsconfig.json` include/exclude, `.gitignore` before Task 08/09.
- [ ] Confirm whether production `MONGODB_URI` in Cloudflare is the same Atlas cluster (ask owner).
- [ ] Confirm Atlas tier (M0/M2/M5 vs dedicated) — affects `mongodump`/`mongorestore` permissions and Atlas’s own backups.
- [ ] Record answers in `02-architecture.md` Open Decisions.

## Security Requirements

- Do not copy any secret values from `wrangler.jsonc`, `.env*`, or `cred.md` into task files, logs or chat.

## Error Handling

- N/A (documentation).

## Testing

- N/A.

## Acceptance Criteria

- [ ] All findings above verified by owner/lead.
- [ ] Open decisions answered or explicitly deferred.

## Depends On

- None.

## Blocks

- 02 and every following task.

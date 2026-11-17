# Task 08 — Next.js Integration

## Objective

Add the protected backend layer inside Nile Link (route handlers + agent client + types) so the browser only ever talks to authenticated Nile Link APIs, which in turn call the agent.

## Why This Is Needed

The browser must not reach the Windows server. The Worker is the policy-enforcement point: it authenticates the admin, validates input, signs agent requests, and writes audit records.

## Existing Project Files Involved

- `lib/auth/rbac-guard.ts` — `requireAuth(request, ["super_admin"])` (returns `{session}` or a 401/403 `NextResponse`). Primary guard.
- `lib/auth/token-service.ts` — `getSessionFromRequest`, `AuthSessionPayload` (userId, email, role, firstName, lastName).
- `lib/auth/require-permission.ts` — **not used** (no backup permission key; decision D5).
- `lib/mongodb.ts` — `connectDB()` for the audit log writes and a DB re-check of the actor (`User` model).
- `lib/models/User.ts`, `lib/models/index.ts` — re-verify `role === "super_admin"` and `status === "active"` against DB for destructive actions; register new model.
- `lib/auth/rate-limiter.ts` — in-memory per-isolate; acceptable only as a best-effort extra; **real throttling is done by the agent** (Task 07) and by a Mongo-based cool-down (below).
- `cloudflare-env.d.ts` — add types for `BACKUP_AGENT_URL`, `BACKUP_AGENT_KEY_ID`, `BACKUP_AGENT_HMAC_SECRET`.
- `wrangler.jsonc` — **do not add the secret to `vars`** (they are plaintext and committed). Use `wrangler secret put`. Only the non-secret URL may live in `vars`, preferably also a secret.
- `app/api/admin/staff/route.ts`, `app/api/admin/documents/[id]/verify/route.ts` — style references.
- `API_INVENTORY.md` — document new endpoints.
- `.env.example` — document variable names (placeholders only).
- `app/api/cron/check-expiries/route.ts` — style reference for env resolution; do not copy its weak default-secret fallback.

## New Files To Create

- `lib/backup/agent-client.ts` — `callAgent(method, path, body?, actor)` with HMAC signing, 10 s timeout, retries only for idempotent GETs.
- `lib/backup/signing.ts` — canonical string + HMAC via Web Crypto (`crypto.subtle`, works on Workers).
- `lib/backup/config.ts` — resolve env via `process.env` then `getCloudflareContext().env` (same pattern as `lib/mongodb.ts`); fail with a clear 503 if unset.
- `lib/backup/types.ts` — shared DTOs mirroring agent schemas.
- `lib/backup/guard.ts` — `requireBackupAdmin(request, {destructive})` wrapping `requireAuth` + DB re-check.
- `lib/validations/backup.ts` — zod schemas (id regex, restore confirmation).
- `app/api/admin/system/backups/route.ts` — `GET` list, `POST` create manual.
- `app/api/admin/system/backups/health/route.ts` — agent health passthrough.
- `app/api/admin/system/backups/[id]/route.ts` — `GET`, `DELETE`.
- `app/api/admin/system/backups/[id]/protect/route.ts`
- `app/api/admin/system/backups/[id]/restore/route.ts`
- `app/api/admin/system/backups/import/route.ts`
- `app/api/admin/system/backups/jobs/[jobId]/route.ts`
- `lib/models/SystemAuditLog.ts` (created in Task 15; consumed here).

## Files To Modify

- `cloudflare-env.d.ts`
- `lib/models/index.ts`
- `.env.example`
- `API_INVENTORY.md`

## Implementation Tasks

- [ ] Add env typings + `lib/backup/config.ts`.
- [ ] Implement `signing.ts` with Web Crypto; add shared test vectors with Task 07.
- [ ] Implement `agent-client.ts`: build headers (key id, timestamp, nonce via `crypto.getRandomValues`, actor, signature), `fetch` with `AbortController` timeout, map agent errors to safe Worker errors, never forward agent internals/paths.
- [ ] Implement `guard.ts`: `requireAuth(request, ["super_admin"])`; for destructive routes also load user from DB and confirm `status === "active"` and `role === "super_admin"`; return 403 otherwise.
- [ ] Add `lib/validations/backup.ts` (zod: `id` regex, `reason` ≤ 200 chars, restore body `{confirmPhrase, acknowledgeDataLoss: true}`).
- [ ] Implement each route handler: guard → validate → rate/cool-down check → audit "requested" → `callAgent` → audit result → respond. Add `export const dynamic = "force-dynamic"`.
- [ ] Add Mongo-based cool-down for POST create (e.g. reject if a manual backup was requested < 30 s ago by any admin) since in-memory limiters don't work across isolates.
- [ ] Add CSRF/Origin check for state-changing routes (same-origin `Origin`/`Sec-Fetch-Site` validation) since auth is cookie-based (`sameSite=lax`).
- [ ] Document secrets setup in `CLOUDFLARE_GUIDE.md` (secret names; `wrangler secret put`).
- [ ] Update `.env.example` (names only) and `API_INVENTORY.md`.
- [ ] Unit tests with mocked `fetch`.

## Security Requirements

- All routes `super_admin` only; destructive routes re-check DB state.
- HMAC secret only in Worker secrets, never in `vars`, never in client bundle, never in logs (note: Worker observability is `persist: true` — do not `console.log` request/response bodies or headers).
- Response mapping must not leak agent URL, file paths, or Mongo details.
- Same-origin enforcement on POST/DELETE.

## Error Handling

- Agent unreachable/timeout → `503 {code:"AGENT_UNAVAILABLE"}`; audit records failure for write ops.
- Agent 4xx → mapped to safe messages; 5xx → generic message + request id.
- Misconfigured env → `503 {code:"BACKUP_NOT_CONFIGURED"}`.

## Testing

- Mock agent: success, 401, 409 busy, timeout; guard tests per role (`customer`, `staff`, `super_admin`, unauthenticated).

## Acceptance Criteria

- [ ] Non-super_admin gets 401/403 on every route.
- [ ] Browser never receives agent URL/secret.
- [ ] Signed requests accepted by the real agent in a local integration run.
- [ ] Audit entries written for every write operation.
- [ ] `API_INVENTORY.md` updated.

## Depends On

- 02, 07, 15 (model)

## Blocks

- 09, 10, 11, 12

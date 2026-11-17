# Task 07 — Secure Agent API

## Objective

Design and implement the HTTP API exposed by the Windows agent for the Nile Link Worker, including request authentication (HMAC), replay protection, async jobs, and strict input validation.

## Why This Is Needed

This API is the only remote control surface for the most sensitive operations (restore overwrites production data). It must be authenticated independently from the website session.

## Existing Project Files Involved

- `app/api/cron/check-expiries/route.ts` — existing shared-secret Bearer pattern (`CRON_SECRET`). **Insufficient** for restore (static bearer, replayable). Use HMAC with timestamp+nonce instead.
- `lib/auth/token-service.ts` — website session (not used between Worker and agent; mentioned to avoid reuse of `JWT_SECRET`, which must never double as the agent secret).
- `cloudflare-env.d.ts` — add typed `BACKUP_AGENT_*` secrets in Task 08.

## New Files To Create

- `backup-agent/src/auth/hmac.ts` — verify signatures.
- `backup-agent/src/auth/nonce-store.ts` — replay cache.
- `backup-agent/src/routes/backups.ts`, `jobs.ts`, `restore.ts`, `import.ts`, `scheduler.ts`, `health.ts`
- `backup-agent/src/services/job-manager.ts` — async job registry (persisted to `logs/jobs/<jobId>.json`).
- `backup-agent/src/schemas/api.ts` — zod request/response schemas.
- `backup-agent/docs/api.md` — contract documentation.

## Files To Modify

- `backup-agent/src/server.ts` (register auth hook + routes)

## API design (all under `/v1`)

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /v1/health` | detail health | tools versions, free disk, last backup, scheduler next run; authenticated. Unauthenticated variant returns only `{status}` |
| `GET /v1/backups?type=&limit=&cursor=` | list | metadata only |
| `GET /v1/backups/:id` | one backup | |
| `POST /v1/backups` | create manual backup | body `{reason?}` → `202 {jobId}`; type forced to `manual` |
| `POST /v1/backups/:id/verify` | re-verify checksum/archive | async job |
| `POST /v1/backups/:id/protect` | `{protected:boolean}` | |
| `POST /v1/backups/:id/restore` | restore | body `{confirmPhrase, safetyBackup:true}` → `202 {jobId}`; see Task 11 |
| `POST /v1/backups/import` | import | see Task 12 |
| `DELETE /v1/backups/:id` | delete | refuses protected/safety-in-use |
| `GET /v1/jobs/:jobId` | job status | `{state, step, progress?, resultBackupId?, error?}` |
| `GET /v1/scheduler` | next/last run | |

Better-fit note: restore and create are modeled as **jobs** (not synchronous) because they exceed Worker time limits; id-based routes only.

### Authentication (every request except unauthenticated health)

Headers sent by the Worker:
- `X-NL-Key-Id` — selects the secret (supports rotation: two active keys).
- `X-NL-Timestamp` — Unix ms; agent rejects if |now − ts| > 60 s.
- `X-NL-Nonce` — random 128-bit; agent stores seen nonces for 5 min (reject duplicates → replay protection).
- `X-NL-Actor` — base64url JSON `{userId,email}` of the admin (informational for local audit; **not** trusted for authorization).
- `X-NL-Signature` — `HMAC-SHA256(secret, METHOD + "\n" + path+query + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body))`, hex; compared with `timingSafeEqual`.
- Optional extra layer: Cloudflare Access service-token headers if tunnel is used.

Responses: JSON only, `{ok:boolean, data?, error?:{code,message}}`, no stack traces, correlation `X-Request-Id`.

### Validation rules
- IDs validated by the regex from Task 04; unknown fields rejected (`zod.strict()`).
- Body size ≤ 64 KB except import route.
- Never accept: file paths, database names (except allow-listed `targetDbName` for test restores), shell flags, URIs.

## Implementation Tasks

- [ ] Implement `hmac.ts` with canonical string builder, shared test vectors with the Worker side (Task 08).
- [ ] Implement `nonce-store.ts` (in-memory TTL map + small on-disk fallback not needed; process restart clears but timestamp window bounds exposure to 60 s).
- [ ] Add Fastify/HTTP hook: reject 401 on any auth failure with a generic message; log reason internally.
- [ ] Add rate limiting in the agent (token bucket per key-id: e.g. 30 req/min, 1 write op/10 s).
- [ ] Implement `job-manager.ts`: states `queued|running|succeeded|failed|interrupted`, persisted JSON, single running heavy job enforced via the Task 04 lock.
- [ ] Implement routes with zod validation and uniform error mapping (`BUSY`→409, `NOT_FOUND`→404, `INVALID_ID`→400, `PROTECTED`→409).
- [ ] Implement `GET /v1/health` (both variants).
- [ ] Write `docs/api.md` with examples and the signing algorithm.
- [ ] Add key rotation support (`AGENT_HMAC_KEYS` JSON with multiple key ids).
- [ ] Unit/integration tests: valid/invalid signature, stale timestamp, replayed nonce, tampered body, wrong key id, oversized body, bad id.

## Security Requirements

- Minimum 256-bit random HMAC secret; stored only as Cloudflare Worker secret + agent secret store.
- TLS terminated at the tunnel/proxy; agent itself bound to loopback; no plaintext exposure to the internet.
- Constant-time compare; generic 401s; no user enumeration.
- Never return MongoDB URIs, hostnames with credentials, or filesystem paths.

## Error Handling

- Unknown route → 404 JSON; malformed JSON → 400; internal error → 500 with request id only.
- Jobs always end in a terminal state; `interrupted` if the agent restarted mid-job.

## Testing

- Contract tests shared between agent and Worker client (same signing vectors).
- Negative tests listed above.

## Acceptance Criteria

- [ ] Unsigned/stale/replayed/tampered requests all rejected (401).
- [ ] All endpoints validate IDs and bodies; no path parameters other than backup IDs/job IDs.
- [ ] Async job lifecycle works and survives UI polling.
- [ ] `docs/api.md` matches implementation.

## Depends On

- 03, 04 (jobs), 06 (store), 14 (security design)

## Blocks

- 08, 10, 11, 12, 13, 18

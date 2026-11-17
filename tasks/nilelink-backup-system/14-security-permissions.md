# Task 14 — Security & Permissions

## Objective

Perform a threat analysis for the backup system and define the concrete controls each task must implement. This is a **design input** for Tasks 03, 07, 08, 11, 12 and a verification checklist for Task 18.

## Why This Is Needed

The agent can read the entire database (including password hashes and PII) and overwrite it. Compromise of any link in the chain is catastrophic.

## Existing Project Files Involved

- `lib/auth/rbac-guard.ts`, `lib/auth/require-permission.ts`, `lib/auth/token-service.ts`, `lib/auth/rate-limiter.ts`.
- `lib/models/User.ts` (roles, `status`, `staffPermissions`).
- `wrangler.jsonc` (⚠ plaintext secrets in `vars`), `.env.example`, `.env`, `.env.local`, `cred.md`.
- `middleware.ts` (does not protect `/admin` or `/api`).
- `app/[locale]/admin/layout.tsx` (role gate allows `staff`).
- `app/api/env-test`, `app/api/seed` (review: potential data/secret exposure).
- `.github/workflows/deploy.yml`.

## New Files To Create

- `backup-agent/docs/SECURITY.md` (operator-facing summary)
- `lib/backup/guard.ts` (Task 08) — implements authorization controls below.

## Files To Modify

- `.gitignore` (backup artifacts, agent env files)
- `wrangler.jsonc` / secret management (separate remediation recommended, see risks)

## Threat analysis

| # | Threat | Impact | Control |
|---|--------|--------|---------|
| T1 | Non-admin invokes backup/restore APIs | Data theft/destruction | `requireAuth(request, ["super_admin"])` on every route; page-level server gate; no staff permission key |
| T2 | Stale/hijacked session (JWT 1 h, not re-checked) | Restore by demoted/suspended user | DB re-check of `role`+`status` on destructive routes; typed confirmation; optional password re-entry (`lib/auth/password.ts`) |
| T3 | CSRF (cookie auth, sameSite=lax) | Forged restore/delete | Same-origin (`Origin`/`Sec-Fetch-Site`) validation on POST/DELETE; JSON-only content type |
| T4 | Forged requests to agent | Unauthorized backup/restore | HMAC-SHA256 with key-id, timestamp ±60 s, nonce, body hash; constant-time compare; TLS via tunnel; loopback bind |
| T5 | Replay of captured agent request | Repeated restore | Timestamp window + nonce cache (5 min); idempotency via job ids; restore requires fresh typed phrase bound to backup id |
| T6 | Leaked API secret | Full control of agent | Secrets in Worker secrets + agent secret store only; rotation procedure (two active key ids); never in `vars`, never in logs; different from `JWT_SECRET`/`CRON_SECRET` |
| T7 | Brute force / DoS on APIs | Availability | Agent token-bucket per key; Worker Mongo-based cool-down (in-memory `rate-limiter.ts` is per-isolate → not sufficient); Cloudflare WAF/rate-limit rules on `/api/admin/system/backups*`; agent single-job lock |
| T8 | Path traversal / arbitrary file access | Read/overwrite OS files | Opaque ID regex only; `safe-path` canonical check; reject symlinks/junctions/UNC/drive letters/reserved names; filename never used for paths |
| T9 | Command injection via `mongodump/mongorestore` | RCE on server | `spawn` with arg arrays, `shell:false`; no user-controlled args; enums/allow-lists only |
| T10 | MongoDB URI/credentials exposure | DB takeover | URI only in agent secret store (ACL-restricted file or machine env), masked in logs (`redact`), not in process list (use config file/env), not in API responses/metadata; dedicated least-privilege Mongo users |
| T11 | Backup tampering at rest | Restoring poisoned data | SHA-256 checksum verified before restore; optional HMAC-signed metadata; restricted ACLs; optional AES-GCM at rest/BitLocker; imported backups unverified-origin flagged |
| T12 | Malicious import (zip-slip/bomb/foreign DB) | RCE/DoS/privilege change | No extraction; gzip magic + `mongorestore --dryRun`; DB-name allow-list; size/time limits; never auto-restore |
| T13 | Disk fill via repeated backups/imports | Backup failures/outage | Pre-flight space check, retention, import limits, alerts |
| T14 | PII exposure from backups (password hashes, OTP fields in `User`) | Compliance breach | Disable browser download (D7); encrypt volume; limited ACL; consider excluding OTP/token fields via a documented post-restore cleanup, not in dump |
| T15 | Insider abuse | Data exfiltration | Full audit (actor, IP, user-agent); alerting on restore/import/delete; two-person approval optional (future) |
| T16 | Log leakage | Secret disclosure | Redaction; Worker logs are persisted (`observability.persist`) — never log headers/bodies |
| T17 | Tunnel/proxy misconfiguration exposing agent | Remote attack surface | Loopback bind; Cloudflare Access service token in front; no inbound firewall rules if using tunnel; IP allow-list as optional extra |
| T18 | Agent host compromise | Everything | Dedicated low-privilege service account, patching, firewall, AV exclusions limited to backup dir, no RDP exposure |
| T19 | Hard-coded fallback secrets in app (`token-service.ts`, `check-expiries/route.ts`) | Forgeable sessions → backup access | **Out-of-scope but critical:** remove fallbacks, rotate `JWT_SECRET`/`AUTH_SECRET`/`CRON_SECRET`, move secrets out of `wrangler.jsonc` `vars` |

## Implementation Tasks

- [ ] Write `backup-agent/docs/SECURITY.md` from the table above.
- [ ] Confirm each control is assigned to a task (03: bind/service account/redaction; 06: safe-path; 07: HMAC/replay/rate limit; 08: guard/CSRF/cool-down; 11: confirm/re-check; 12: import validation; 13/16: availability).
- [ ] Define key rotation runbook (generate new key id → deploy to agent → deploy to Worker → remove old key).
- [ ] Define Cloudflare WAF/rate-limit rule recommendation for the backup routes.
- [ ] Add `.gitignore` entries; verify `cred.md`, `.env`, `.env.local` are not tracked (`git ls-files`).
- [ ] Recommend and track separate remediation: rotate leaked credentials found in `wrangler.jsonc`, remove default secrets from code.
- [ ] Decide on optional controls: password re-entry for restore, AES at rest, two-person approval.

## Security Requirements

- This task *is* the security requirements; each control above becomes an acceptance test in Task 18.

## Error Handling

- Security failures always fail closed (deny), return generic errors, and are logged without secrets.

## Testing

- Task 18 permission/unauthorized/replay/tamper/traversal tests map 1:1 to T1–T12.

## Acceptance Criteria

- [ ] Every threat has an owner task and a test.
- [ ] Secrets handling approved by the owner.
- [ ] Rotation of exposed credentials scheduled (or explicitly risk-accepted).

## Depends On

- 02

## Blocks

- 07, 08, 11, 12 (design input), 18

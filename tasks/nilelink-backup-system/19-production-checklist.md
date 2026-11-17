# Task 19 — Production Checklist

## Objective

A go-live checklist to be completed and signed off before the backup system is declared production-ready.

## Why This Is Needed

Prevents "installed but never verified" backups — the most common backup failure.

## Existing Project Files Involved

- `CLOUDFLARE_GUIDE.md`, `wrangler.jsonc` (secrets must not be in `vars`), `.github/workflows/deploy.yml`.
- `backup-agent/docs/runbooks.md`, `backup-agent/deploy/README-deploy.md`.
- `app/[locale]/admin/system/backups/page.tsx`, `lib/models/SystemAuditLog.ts`.

## New Files To Create

- `tasks/nilelink-backup-system/go-live-signoff.md` (copy of this checklist with dates/initials at go-live)

## Files To Modify

- None.

## Implementation Tasks (checklist)

**Server & agent**
- [ ] MongoDB Database Tools installed; `mongodump --version` / `mongorestore --version` recorded
- [ ] Node runtime installed (if required) and version recorded
- [ ] Backup directory structure created (`automatic/manual/safety/imports/temp/logs`)
- [ ] Permissions configured (only service account + Administrators); verified with `icacls`
- [ ] Free disk ≥ planned capacity (30 daily + safety + manual headroom); disk alert threshold set
- [ ] Secrets configured on server (Mongo URI, HMAC keys) outside the repo; ACL-restricted
- [ ] Dedicated least-privilege MongoDB users created (backup / restore)
- [ ] Backup Agent installed as service, auto-start + recovery verified (kill test, reboot test)
- [ ] Windows Time sync verified; `TZ`/scheduler timezone = Africa/Cairo
- [ ] Health check passing (signed request from Worker)
- [ ] Tunnel/proxy configured per decision D1; no unnecessary inbound firewall rules
- [ ] MailEnable verified unaffected (services running, ports unchanged)

**Cloudflare / app**
- [ ] Worker secrets set via `wrangler secret put` (not in `vars`)
- [ ] New code deployed (`cf-deploy`) and `/admin/system/backups` reachable by super_admin only
- [ ] Staff/customer access denied (tested)
- [ ] WAF/rate-limit rules for `/api/admin/system/backups*` enabled
- [ ] Exposed legacy secrets rotated (JWT/AUTH/CRON/Mongo) or risk formally accepted (see Task 14 T19)

**Functional verification (use test DB first, then production for backup only)**
- [ ] Manual backup tested (appears in UI, metadata/checksum correct)
- [ ] Automatic backup tested (scheduler fired at the configured time; observed once on the real schedule)
- [ ] Restore tested **using a safe/test database** (never first on production)
- [ ] Safety backup verified to be created before restore
- [ ] Import tested (valid + invalid file)
- [ ] Retention tested (dry-run preview + a sweep on test data)
- [ ] Failure handling tested (agent stopped, disk-full simulation)
- [ ] Audit logs verified for each operation type (no secrets)
- [ ] Admin UI verified in Arabic and English, light and dark
- [ ] Offsite/secondary copy of backups arranged (optional but strongly recommended; 3-2-1 rule)
- [ ] Runbook reviewed; contact list and escalation defined
- [ ] Monitoring/alert for "no successful backup in 26 h" active
- [ ] Documentation handed over (README, deploy guide, runbooks, API doc)

## Security Requirements

- Sign-off by the system owner and the server administrator.

## Error Handling

- Any unchecked item blocks go-live unless risk-accepted in writing in the sign-off file.

## Testing

- Items above are the tests; evidence (screenshots/log excerpts) attached to the sign-off file.

## Acceptance Criteria

- [ ] 100 % of items checked or formally risk-accepted.

## Depends On

- 03–18

## Blocks

- 20

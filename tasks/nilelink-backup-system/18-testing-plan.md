# Task 18 — Testing Plan

## Objective

Define and execute the complete test suite (unit, integration, chaos, security, UI) for the backup system, always against a **test database**, never production.

## Why This Is Needed

Backups are only valuable if restore works. Tests prove the guarantees: safety backup before restore, no destruction of valid backups on failure, strict authorization.

## Existing Project Files Involved

- `package.json` — root has `lint` only; **no test runner configured** (add one, e.g. Vitest) — requires approval to add dev dependencies.
- `scripts/test-financial-system.ts` — existing ad-hoc test script style.
- `TESTING_GUIDE.md`, `TEST_GUIDE.md` — existing manual test docs (append a Backup section).
- `.playwright-mcp/` — evidence of Playwright usage for UI checks.
- `lib/backup/*`, `app/api/admin/system/backups/**`, `components/admin/system/backups/**`, `backup-agent/**`.

## New Files To Create

- `backup-agent/tests/unit/*.test.ts` (hmac, safe-path, retention planner, scheduler time, redact, metadata)
- `backup-agent/tests/integration/*.test.ts` (against a throwaway mongod/test Atlas DB)
- `backup-agent/tests/fixtures/fake-mongodump.cmd` (simulate failures)
- `tests/backup/*.test.ts` (Worker-side: guard, signing vectors, routes with mocked agent)
- `tests/e2e/backups.spec.ts` (Playwright)
- `tasks/nilelink-backup-system/test-report-template.md`

## Files To Modify

- `package.json` (test scripts/devDependencies — only after approval)
- `TESTING_GUIDE.md`

## Test matrix

| Area | Tests |
|---|---|
| Unit | HMAC canonical string & shared vectors; timestamp window; nonce replay; id regex fuzz; `safe-path` traversal set (`..\`, `%2e%2e`, UNC, `C:\`, `CON`, trailing dot); retention `planRetention`; scheduler time with fake clock incl. DST; redaction; metadata zod |
| Integration — backup | seeded test DB → backup → archive, metadata, checksum correct, size matches; two simultaneous requests → one `BUSY` |
| Integration — restore | mutate DB → restore → data equals backup; safety backup exists, verified, protected; counts match |
| Restore safety | force safety backup failure → **restore not started**, DB unchanged, maintenance flag cleared |
| Restore failure | corrupt archive mid-restore → rollback from safety backup; if rollback blocked → CRITICAL path |
| Corrupt backup | truncated/modified archive → checksum fails → quarantined, restore refused |
| Permissions | unauthenticated 401; `customer`, `customer_admin`, `staff` (with/without permissions) 403; `super_admin` 200; demoted/suspended super_admin (DB re-check) denied on destructive routes |
| Unauthorized API (agent) | no/invalid signature, wrong key id, stale timestamp, replayed nonce, tampered body, oversized body, bad id → 401/400 |
| CSRF/Origin | cross-origin POST rejected |
| Retention | 35 automatic + manual/protected/safety/import mix → only oldest 5 automatic removed; metadata error → delete nothing; last valid never deleted |
| Scheduler | triggers at 21:00 Cairo (winter/summer), no duplicate for same date, catch-up within grace, none after grace, overlap with manual backup |
| Disk failure simulation | small VHD / quota to trigger `ENOSPC` → partial removed, previous backups intact; low-space pre-flight |
| Agent unavailable | stop service → UI degraded, 503 mapping, no queued writes; restart → recovery |
| Crash recovery | kill agent mid-dump → orphan cleanup; kill mid-restore → `interrupted`, no auto-resume |
| Import | valid; wrong ext; fake gzip; non-mongodump gzip; `admin` DB; oversize; aborted upload; traversal filename |
| Audit | one record per operation with actor/backupId/result; no secrets; idempotent terminal events |
| Logging | grep logs/audit/responses for URI fragments, secret values → none |
| UI e2e | super_admin sees page; staff redirected; create backup; restore dialog requires typed phrase; import flow; RTL/dark mode visual check |

## Implementation Tasks

- [ ] Get approval to add a test runner (Vitest) to root and agent; add scripts.
- [ ] Provision a **test MongoDB** (local `mongod` or a separate Atlas test cluster/db `nilelink_test`) with seed script.
- [ ] Implement unit tests (agent + web).
- [ ] Implement integration tests with fake and real tools.
- [ ] Implement chaos tests (kill process, disk quota, network block) with documented manual procedures where automation is impractical.
- [ ] Implement Playwright e2e.
- [ ] Create `test-report-template.md` and record results per release.
- [ ] Add CI job (GitHub Actions) for unit tests only; integration/chaos run manually on staging.
- [ ] Assert the global invariant after every failure test: previous valid backup still verifies.

## Security Requirements

- Test credentials separate from production; test DB name restricted by agent allow-list; no production data in fixtures.

## Error Handling

- Tests must clean up temp dirs/DBs even on failure.

## Testing

- This is the testing task; coverage target: all listed matrix rows executed at least once before Task 19.

## Acceptance Criteria

- [ ] All matrix rows pass; report stored.
- [ ] No test touches the production database.
- [ ] Invariant ("valid backup never destroyed") holds across chaos tests.

## Depends On

- 03–17 (as relevant)

## Blocks

- 19, 20

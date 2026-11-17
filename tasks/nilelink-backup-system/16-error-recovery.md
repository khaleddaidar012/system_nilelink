# Task 16 — Error Recovery

## Objective

Define and implement the failure behaviour for every foreseeable fault so that **a failed operation never destroys the last valid backup** and the system self-heals on restart.

## Why This Is Needed

Backup tooling fails at the worst moments (disk full, power cut, network drop). Without explicit recovery rules, partial files can be mistaken for good backups or the only good backup can be deleted.

## Existing Project Files Involved

- `lib/backup/agent-client.ts`, `app/api/admin/system/backups/**` (error mapping, Task 08).
- `components/admin/system/backups/*` (surface errors, Task 09–12).
- `lib/system/maintenance.ts` (Task 11; stuck-flag recovery).
- `lib/mongodb.ts` (timeouts: 5 s selection/connect, 15 s socket — relevant to Worker-side failures).

## New Files To Create

- `backup-agent/src/recovery/startup-reconciler.ts`
- `backup-agent/src/recovery/errors.ts` (typed error codes)
- `backup-agent/src/recovery/alerts.ts` (alert hook: log + optional email/Telegram later)
- `backup-agent/docs/runbooks.md` (manual recovery procedures)

## Files To Modify

- `backup-agent/src/services/backup.service.ts`, `restore.service.ts`, `import.service.ts`, `retention.service.ts` (use typed errors + cleanup in `finally`)
- `backup-agent/src/index.ts` (run reconciler before starting server/scheduler)

## Scenario matrix

| Scenario | Detection | Behaviour | Guarantee |
|---|---|---|---|
| MongoDB unavailable | pre-flight ping/`mongodump` connect error | job `failed: DB_UNREACHABLE`; no temp left; scheduler retries once after 30 min | previous backups untouched |
| Disk full / low | pre-flight (free ≥ max(2× last size, 1 GB)); `ENOSPC` during write | abort, delete partial, alert; **never** auto-delete manual/protected to make room | previous backups untouched |
| `mongodump` failure (non-zero exit) | exit code/stderr | delete partial; failed record in `logs/failed/` | no promotion of partial |
| Timeout/hang | watchdog | kill process tree, delete partial | same |
| `mongorestore` failure | exit code/post-check | rollback from safety backup; if rollback fails → `CRITICAL`, protect both archives, alert | safety + source archives preserved |
| Agent restarts during backup | `temp\*.partial` + stale lock at boot | reconciler deletes orphan partials (older than agent start), clears stale lock (PID dead), marks job `interrupted` | final folders only ever created by atomic rename |
| Agent restarts during restore | persisted restore state != `done` | **do not auto-resume**; job `interrupted`; maintenance flag stays on (until admin decision); alert; runbook: verify DB state, optionally re-run restore or rollback to safety backup | safety backup protected |
| Network failure Worker↔agent | fetch timeout/error | `503 AGENT_UNAVAILABLE`; UI keeps polling job state later (job continues on agent); no duplicate submissions (idempotency by `jobId`) | no blind retries for write ops |
| Agent unavailable | health fails | UI degraded, actions disabled, alert if no successful backup in > 26 h (missed schedule) | – |
| Corrupt backup (checksum/archive) | verify step | status `quarantined`; excluded from restore/retention counts; shown in UI | never silently restored |
| Partial backup (file exists but no completed metadata) | reconciler/listing | treated as orphan → removed from `temp`, or quarantined if found in final folder | not listed as valid |
| Metadata unreadable | schema validation | `quarantined` | not deleted automatically |
| Stuck maintenance flag | expiry timestamp | auto-expire (≤ 60 min) unless restore job still `running` | app never locked forever |
| Tunnel/proxy down | health check | same as agent unavailable | – |

## Implementation Tasks

- [ ] Define typed error codes (`DB_UNREACHABLE`, `DISK_FULL`, `DISK_SPACE_LOW`, `TOOLS_NOT_FOUND`, `DUMP_FAILED`, `TIMEOUT`, `VERIFY_FAILED`, `RESTORE_FAILED`, `ROLLBACK_FAILED`, `BUSY`, `INTERRUPTED`, `CORRUPT_BACKUP`).
- [ ] Wrap every operation in try/catch/finally with deterministic cleanup (partial dirs, locks, maintenance flag where appropriate).
- [ ] Implement `startup-reconciler.ts`: scan `temp\`, stale lock, jobs in `running` state → `interrupted`; verify last N backups' metadata/size (cheap check); log summary.
- [ ] Ensure the retention sweep runs only after a new backup is fully promoted and never when listing had errors (Task 13).
- [ ] Implement "missed backup" detector (no successful automatic backup in 26 h) → alert + red status in dashboard.
- [ ] Implement `alerts.ts` abstraction (log only in v1; email/Telegram later).
- [ ] Write `runbooks.md`: manual restore with `mongorestore` CLI, recovering from CRITICAL, clearing maintenance flag, rebuilding metadata for an orphaned archive, key rotation.
- [ ] Add a `POST /v1/jobs/:id/ack` or admin action to acknowledge an `interrupted` restore and clear/keep maintenance mode deliberately.
- [ ] Chaos tests: kill agent process mid-dump and mid-restore (on test DB), fill a small VHD to simulate disk full, block network to Mongo.

## Security Requirements

- Recovery code must not log secrets or full command lines containing URIs.
- Reconciler operates only inside `BACKUP_ROOT` via `safe-path`.
- Auto-recovery never performs destructive DB actions (no automatic restore/rollback after a crash; only file-level cleanup).

## Error Handling

- This task defines it; all errors surface to UI with safe codes/messages and to local logs with detail.

## Testing

- Scenario matrix → test per row (Task 18). Verify the invariant: **after any injected failure, the latest previously valid backup still verifies with the same checksum.**

## Acceptance Criteria

- [ ] Every scenario row demonstrated on test infrastructure.
- [ ] Invariant holds in all chaos tests.
- [ ] Runbooks reviewed by the operator.

## Depends On

- 04, 05, 11, 12, 13 (hardening pass across them)

## Blocks

- 17, 18, 19, 20

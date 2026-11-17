# Task 13 — Retention & Cleanup

## Objective

Automatic cleanup: keep the latest **30 automatic daily backups**; never auto-delete manual, imported or protected backups; apply a separate retention policy to safety backups; never delete the last valid backup.

## Why This Is Needed

Prevents the disk from filling up (which would cause backup failures) without risking important backups.

## Existing Project Files Involved

- None in the web app for deletion logic (agent-side).
- `app/api/admin/system/backups/[id]/route.ts` (Task 08, `DELETE`) — manual deletion path shares the same guards.
- `components/admin/system/backups/BackupsTable.tsx` (Task 09) — shows retention/protected info.

## New Files To Create

- `backup-agent/src/services/retention.service.ts`
- `backup-agent/src/config/retention.ts` (policy constants/config)

## Files To Modify

- `backup-agent/src/config.ts` (`RETENTION_AUTOMATIC_COUNT=30`, `RETENTION_SAFETY_MIN_COUNT=3`, `RETENTION_SAFETY_MAX_AGE_DAYS=30`, `RETENTION_MIN_FREE_GB`)
- `backup-agent/src/scheduler/scheduler.ts` (invoke retention after each successful automatic backup)
- `backup-agent/src/storage/backup-store.ts` (delete guards)

## Policy

| Type | Rule |
|---|---|
| automatic | keep newest **30** `completed` backups; delete older ones (oldest first), only if status is `completed`/`failed` and `protected=false` |
| manual | **never** auto-deleted |
| import | **never** auto-deleted |
| safety | keep the newest **3** always; delete safety backups older than **30 days** beyond those 3; a safety backup referenced by a recent restore (< 30 days) is kept |
| protected (any type) | never auto-deleted |
| quarantined | never auto-deleted (needs human review) |
| last valid backup (any type) | never deleted by any path |

Counting rule: only `completed` + verified automatic backups count toward the 30; failed/partial records do not consume slots. Deletion happens **after** a new backup is verified and renamed into place (never before).

## Implementation Tasks

- [ ] Implement `retention.service.ts` with a pure function `planRetention(items, policy, now)` returning `{keep[], delete[], reasons[]}` (easy to unit-test) and an `apply(plan)` executor.
- [ ] Executor deletes via `backup-store.delete(id)` (re-checks guards at execution time), logs each deletion, writes local audit line, returns summary to the caller.
- [ ] Safety check: abort sweep if fewer than 1 valid backup would remain, or if metadata listing had parse errors (fail safe: delete nothing when state is uncertain).
- [ ] Disk-pressure branch: if free space < `RETENTION_MIN_FREE_GB`, log WARNING and surface in health; **do not** delete manual/protected to make room — alert instead.
- [ ] Run order: new backup verified → retention sweep → record in scheduler state.
- [ ] Expose `GET /v1/retention/preview` (dry-run plan) for the dashboard (optional) and make `DELETE /v1/backups/:id` reuse the same guards.
- [ ] Emit `BACKUP_DELETED` events (reason `retention`) to the Worker through the next listing/poll response or a pending-events endpoint (agent never calls the Worker) — see Task 15.
- [ ] Unit tests: 35 automatic + mix of manual/protected/safety/import ⇒ exactly the oldest 5 automatic deleted; empty folder; all failed; clock skew; metadata error ⇒ no deletion.

## Security Requirements

- Deletion only via IDs resolved through `safe-path`; recursive delete restricted to the validated backup directory.
- Retention config comes from agent config, not API input.

## Error Handling

- Deletion failure (file locked) → log, keep the entry, continue; retry next sweep.
- Partial deletion → mark `quarantined` rather than leaving ambiguous state.

## Testing

- `planRetention` unit tests; integration: create 32 fake automatic backups, run sweep, assert survivors.

## Acceptance Criteria

- [ ] Exactly the oldest automatic backups beyond 30 are removed.
- [ ] Manual/import/protected/quarantined are never deleted automatically.
- [ ] Safety policy works as defined; the last valid backup is never deleted.
- [ ] Sweep is skipped (nothing deleted) on any uncertainty.

## Depends On

- 04, 05, 06, 07

## Blocks

- 18, 19, 20

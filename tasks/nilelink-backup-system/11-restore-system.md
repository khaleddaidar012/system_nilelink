# Task 11 — Restore System  ⚠ HIGH RISK

## Objective

Restore a selected backup into the production database via the agent, with mandatory safety backup, verification and audit. **A destructive restore never starts until the safety backup has succeeded and been verified.**

## Why This Is Needed

Restore overwrites live customer, financial and document data. Mistakes are unrecoverable without the safety backup.

## Existing Project Files Involved

- `lib/backup/guard.ts` / `lib/auth/rbac-guard.ts` — `super_admin` + DB re-check (`lib/models/User.ts`).
- `app/api/admin/system/backups/[id]/restore/route.ts` (Task 08).
- `lib/models/SystemSetting.ts` — candidate store for a **maintenance-mode flag** (verify schema before use) and/or a dedicated `SystemState` doc.
- `middleware.ts` — currently skips `/api`; maintenance mode must be enforced in API write routes (via a shared helper) and/or the layouts, not just in middleware.
- `lib/mongodb.ts` — note: restore replaces data under live connections; app connections continue (see maintenance mode).
- `components/admin/system/backups/RestoreDialog.tsx` (new), `BackupsTable.tsx`.

## New Files To Create

Agent:
- `backup-agent/src/services/restore.service.ts`
- `backup-agent/src/services/post-restore-check.ts`

Web app:
- `components/admin/system/backups/RestoreDialog.tsx`
- `lib/system/maintenance.ts` (read/write maintenance flag; `assertNotInMaintenance()` helper used by write APIs)

## Files To Modify

- `app/api/admin/system/backups/[id]/restore/route.ts`
- `lib/models/SystemSetting.ts` (or new model) for maintenance flag
- Key mutating API routes under `app/api/**` to call `assertNotInMaintenance()` (list to be enumerated from `API_INVENTORY.md`; minimal: portal/customer write routes, admin write routes)
- `messages/*.json`

## Required flow

```
Admin requests restore
 → authorization (session + DB re-check, super_admin)
 → confirmation (typed phrase "RESTORE <backupId-last-8>", checkbox "I understand current data will be replaced")
 → validate backup (exists, status=completed, not quarantined, sha256 matches, archive readable via dryRun)
 → enable maintenance mode (block writes, show banner)
 → create CURRENT database safety backup (type "safety", reason "pre-restore of <id>")
 → verify safety backup (same verification as Task 04; must be status=completed)
      ├─ FAIL → abort, disable maintenance mode, nothing restored, audit RESTORE_FAILED
 → begin restore (mongorestore --drop, archive, gzip, nsInclude nilelink.*)
 → verify result (collections present, document counts within expectations vs metadata, a read smoke-check through the agent)
      ├─ FAIL → automatic rollback attempt from the safety backup (only if safe), audit RESTORE_FAILED + ROLLBACK_*
 → disable maintenance mode
 → audit RESTORE_COMPLETED
```

## Implementation Tasks

Agent:
- [ ] Implement `restore.service.ts` as a **state machine** persisted per job: `validating → maintenance_on → safety_backup → safety_verified → restoring → verifying → maintenance_off → done` (+ `rolling_back`). Persist state so a restart can resume/abort safely (Task 16).
- [ ] Re-use Task 04 `createBackup({type:"safety", reason, restoredFrom})` and `verifyArchive`.
- [ ] **Hard guard in code:** `restoring` step throws if `safetyBackup.status !== "completed"` or verification not ok.
- [ ] Spawn `mongorestore` (no shell) with `--archive --gzip --drop --nsInclude=nilelink.*` (confirm flags for the actual MongoDB tools version; avoid restoring `admin`/`config` DBs; keep users/roles untouched).
- [ ] Post-restore check: list collections, compare counts to metadata ±, ensure `users` has ≥ 1 `super_admin`.
- [ ] Rollback: if restore fails midway, attempt `mongorestore --drop` of the safety backup; if that also fails → mark `CRITICAL`, keep both archives, protect them (`protected:true`), alert.
- [ ] Mark the restore-source backup and safety backup `protected: true` during the operation.
- [ ] Support optional `targetDbName` (allow-list from agent config, e.g. `nilelink_restore_test`) for test restores — never arbitrary names.

Web app:
- [ ] Implement maintenance flag (set/clear/read) with auto-expiry safeguard (e.g. 60 min max) to avoid permanent lock-out.
- [ ] Add `assertNotInMaintenance()` to write routes; read routes keep working; UI shows banner.
- [ ] Restore route: guard → validate zod `{confirmPhrase, acknowledgeDataLoss}` (phrase must match server-computed expected value) → audit `RESTORE_STARTED` → call agent → return jobId.
- [ ] `RestoreDialog`: shows backup details, size/date, warning copy, typed confirmation, disabled until valid; progress steps from job state; final result.
- [ ] Ensure the restoring admin's session stays valid after restore (users collection may be replaced: JWT is stateless, but warn that other users may be affected; consider forcing re-login).
- [ ] Translations (ar/en + generator).

## Security Requirements

- Highest protection: `super_admin` + DB re-check + typed confirmation + same-origin; optional re-authentication (password re-entry via `lib/auth/password.ts`) — recommend adding.
- Agent accepts restore only for IDs of `completed`, verified backups of allowed types.
- Restore into production DB name only; other targets only from allow-list.
- Full audit including actor, IP, backup id, safety backup id, result.

## Error Handling

- Backup invalid/corrupt → refuse before any change.
- Safety backup fails → abort with no data changes.
- `mongorestore` fails → attempt rollback; if rollback fails → CRITICAL state, manual runbook (Task 16/19).
- Agent restarts mid-restore → job `interrupted`; startup reconciliation must NOT auto-restart a restore; requires admin decision (Task 16).
- Maintenance flag stuck → expiry + manual clear endpoint.

## Testing

- On a **test database only**: happy path; invalid ID; corrupt archive; safety backup failure (simulate full disk/tool failure) ⇒ confirm production-like data unchanged; restore failure ⇒ rollback; permissions (staff/customer denied); wrong confirm phrase; double submit.

## Acceptance Criteria

- [ ] Restore cannot begin without a verified safety backup (proved by test).
- [ ] After restore, data equals backup content; safety backup retained and protected.
- [ ] Every attempt produces audit entries (started + completed/failed).
- [ ] App write APIs blocked during restore and re-enabled afterwards.

## Depends On

- 04, 06, 07, 08, 09, 15, 16 (error recovery design)

## Blocks

- 18, 19, 20

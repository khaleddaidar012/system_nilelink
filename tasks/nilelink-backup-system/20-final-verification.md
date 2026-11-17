# Task 20 — Final Verification

## Objective

Prove the end-to-end behaviour of the finished system against the expected final architecture.

## Why This Is Needed

Confirms every component works together in the real environment and closes the project.

## Existing Project Files Involved

- `app/[locale]/admin/system/backups/page.tsx`, `components/admin/AdminSidebar.tsx` (navigation entry).
- `app/api/admin/system/backups/**`, `lib/backup/**`, `lib/models/SystemAuditLog.ts`.
- `backup-agent/**` on the Windows Server; `C:\NileLink\Backups`.
- `tasks/nilelink-backup-system/00-README.md` (final tick of all boxes).

## New Files To Create

- `tasks/nilelink-backup-system/final-verification-report.md` (results, evidence, date, signer)

## Files To Modify

- `tasks/nilelink-backup-system/00-README.md` (mark tasks complete)
- `API_INVENTORY.md` (if not yet updated)

## Expected final architecture

```
MongoDB = production database

Every day at 21:00 Egypt time (Africa/Cairo):
MongoDB
  ↓
Windows Backup Agent
  ↓
mongodump
  ↓
local backup
  ↓
C:\NileLink\Backups\automatic\<backupId>\

Admin Dashboard:
Nile Link
  ↓
System
  ↓
Backups
  ↓
List / Create / Import / Restore
```

## Implementation Tasks (verification steps)

- [ ] Observe a real automatic backup at 21:00 Cairo time (check agent log, folder, metadata, audit, UI).
- [ ] Confirm the backup is listed in **Admin → System → Backups** with correct date/time (Cairo), size, type `Automatic`, status `Completed`.
- [ ] Verify checksum manually (`certutil -hashfile dump.archive.gz SHA256` equals `checksum.sha256`).
- [ ] Create a manual backup from the UI; confirm it appears, is not subject to retention, audit has `BACKUP_CREATED`.
- [ ] Import a valid archive; confirm type `Imported` and audit `BACKUP_IMPORTED`; confirm a bad file is rejected cleanly.
- [ ] Perform a restore on the **test/staging database**: safety backup created and verified first, data matches, audit `RESTORE_STARTED`→`RESTORE_COMPLETED`, maintenance mode toggled.
- [ ] Simulate failure (agent stopped / disk-full on test) and confirm UI + previous backups unaffected.
- [ ] Verify retention on real data: 30 automatic kept, others untouched by sweeps.
- [ ] Verify security: staff/customer denied; unsigned agent request rejected; no secrets in Worker logs, agent logs, audit.
- [ ] Verify the agent survives a server reboot and resumes scheduling without duplicate/missed runs.
- [ ] Confirm MailEnable and other server services unaffected.
- [ ] Complete `19-production-checklist.md` sign-off.
- [ ] Write `final-verification-report.md` and tick all boxes in `00-README.md`.

## Security Requirements

- No production restore is performed as part of verification unless explicitly authorized by the owner with a fresh safety backup.

## Error Handling

- Any failed verification step reopens the owning task; the project is not closed until all steps pass.

## Testing

- The steps above are the final acceptance tests.

## Acceptance Criteria

- [ ] All verification steps pass with evidence.
- [ ] Owner sign-off recorded.
- [ ] All README checkboxes ticked.

## Depends On

- 01–19

## Blocks

- None (project complete)

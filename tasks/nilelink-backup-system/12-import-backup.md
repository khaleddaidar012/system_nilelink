# Task 12 — Import Backup

## Objective

Let a super_admin upload a previously exported backup archive; the agent validates it and registers it as a backup of type `import` (restorable only via Task 11's full flow). Importing never changes the live database.

## Why This Is Needed

Allows restoring from an archive taken elsewhere (another machine, offsite copy) while keeping the same safety guarantees.

## Existing Project Files Involved

- `app/api/admin/system/backups/import/route.ts` (Task 08).
- `lib/backup/agent-client.ts`, `lib/backup/guard.ts`.
- `lib/storage/r2-storage.ts` — shows existing upload/validation style (`sanitizeFileName`); **not** used to store backups.
- `components/admin/system/backups/ImportBackupDialog.tsx` (new).
- `next.config.mjs` — check body size limits for route handlers; `wrangler.jsonc` — Workers request body limit (≈100 MB on standard plans) constrains uploads through the Worker.
- Existing upload UX reference: `components/portal/verification/VerificationFlow.tsx`, document upload components under `components/portal/`.

## New Files To Create

Agent:
- `backup-agent/src/services/import.service.ts`
- `backup-agent/src/routes/import.ts` (streaming upload endpoint, if not already in Task 07)
Web:
- `components/admin/system/backups/ImportBackupDialog.tsx`

## Files To Modify

- `app/api/admin/system/backups/import/route.ts`
- `messages/*.json`

## Format

Only the agent's own format is accepted: a single `.archive.gz` produced by `mongodump --archive --gzip`, optionally accompanied by its `metadata.json`/`checksum.sha256` (a `.zip`/`.tar` bundle is **not** accepted in v1 to avoid archive-bomb and zip-slip surface). Decision D6 sets the size limit and transport.

## Implementation Tasks

- [ ] Choose transport per D6 and document: (A) multipart via Worker with hard size cap (e.g. 100 MB) streamed to the agent; or (B) Worker issues a short-lived, single-use, signed upload token and browser uploads directly to the agent (explicit, approved exception to "browser never talks to agent").
- [ ] Client validation: extension `.archive.gz`/`.gz`, max size, show checksum progress (optional).
- [ ] Worker validation: content-length cap, `Content-Type`, reject if > limit before streaming; audit `BACKUP_IMPORT_REQUESTED`.
- [ ] Agent: stream upload to `temp\import-<random>.partial` with byte counter (abort over limit), never trusting client filename (store sanitized display name in metadata only).
- [ ] Agent: free-space pre-check (size × 2).
- [ ] Format validation: gzip magic bytes `1f 8b`; run `mongorestore --archive --gzip --dryRun` (no writes) to ensure it is a valid mongodump archive; reject otherwise.
- [ ] Identity validation: parse namespaces from the dry run; require namespaces to be in DB `nilelink` (reject archives containing `admin`/`config`/foreign DBs); if a provided `metadata.json` exists, validate with zod and compare sha256; recompute sha256 and compare to provided checksum when given.
- [ ] Generate new `bk_…_import_…` id (never reuse the imported id), write metadata (`type: import`, `importedFrom.originalFileName` sanitized, `createdBy`), compute checksum, atomic move from `temp` to `imports\<id>\`.
- [ ] Cleanup on any failure: delete the temp file/dir; release locks; audit failure.
- [ ] Zip-slip/path traversal: N/A by design (no extraction by us); filename never used in paths.
- [ ] Decompression-bomb guard: `--dryRun` runs with time limit; reject if ratio/time exceed thresholds; limit uncompressed size estimate where available.
- [ ] UI dialog: file picker, validation messages, progress bar, result.
- [ ] Imported backups are `status: completed` but flagged unverified-origin in UI ("Imported") and **cannot be auto-deleted** (protected by default).
- [ ] Tests: wrong extension, fake gzip, valid gzip but not mongodump, archive with `admin` DB, oversize, truncated upload, client abort mid-upload, concurrent import+backup, filename with `..\..\evil`.

## Security Requirements

- `super_admin` only; same-origin; size limits enforced at every hop (client, Worker, agent).
- Never execute or extract uploaded content; only `mongorestore --dryRun` over the stream, with timeouts.
- Imported file name never used for filesystem paths; generated IDs only.
- Imported data is untrusted: restoring it uses the same flow (safety backup + confirmation + audit).

## Error Handling

- Upload interrupted → temp deleted, no registration.
- Invalid format/identity → reject with specific safe error; temp deleted.
- Disk low → reject early.
- Duplicate content (same sha256 as an existing backup) → warn/allow flagged as duplicate.

## Testing

- Listed above; plus end-to-end: import valid archive → appears as `import` → restore on test DB.

## Acceptance Criteria

- [ ] Valid archive imports and is listed; invalid archives rejected with no leftovers.
- [ ] No path traversal possible via file name.
- [ ] Import never modifies the live DB.
- [ ] Audit `BACKUP_IMPORTED` written on success; failure also audited.

## Depends On

- 06, 07, 08, 09, 15

## Blocks

- 18, 19, 20

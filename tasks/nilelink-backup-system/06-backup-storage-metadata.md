# Task 06 — Backup Storage & Metadata

## Objective

Define and implement the on-disk layout under `C:\NileLink\Backups` and the metadata schema, plus the storage service the rest of the agent uses.

## Why This Is Needed

Every other agent task reads/writes backups. A strict layout + opaque IDs + metadata-as-source-of-truth prevents path traversal, mix-ups between backup types, and makes retention/restore safe.

## Existing Project Files Involved

- `.gitignore` — add patterns so backup artifacts can never be committed (`**/NileLink/Backups/**`, `*.archive.gz`, `backup-agent/**/temp/`).
- `lib/models/SystemSetting.ts` — reference for how app-level settings are stored (not used for agent metadata).
- `lib/storage/r2-storage.ts` — reference only (shows existing `sanitizeFileName` approach — do **not** reuse for backup paths; IDs are generated, not user-named).

## New Files To Create

- `backup-agent/src/storage/layout.ts` — constants + path builders.
- `backup-agent/src/storage/backup-store.ts` — list/get/delete/protect/move operations.
- `backup-agent/src/storage/metadata.ts` — schema (zod), read/write atomic, checksum helpers.
- `backup-agent/src/storage/safe-path.ts` — canonical path guard.
- `backup-agent/src/storage/disk.ts` — free-space query.

## Files To Modify

- `.gitignore`
- `backup-agent/src/types/backup.ts`

## Layout

```
C:\NileLink\Backups\
  automatic\<backupId>\{dump.archive.gz, metadata.json, checksum.sha256}
  manual\<backupId>\...
  safety\<backupId>\...        # pre-restore safety backups (type "safety")
  imports\<backupId>\...       # validated imported backups (type "import")
  temp\                        # <id>.partial\ working dirs, import staging, agent.lock
  logs\                        # agent-YYYY-MM-DD.log, scheduler-state.json, audit-local.jsonl, failed\<id>.json
```

Justification: separate folders per type make retention rules trivial and make it impossible for a retention sweep over `automatic\` to touch `manual\`/`safety\`. `temp\` on the same volume enables atomic rename.

## Metadata schema (`metadata.json`, versioned)

```json
{
  "schemaVersion": 1,
  "id": "bk_20261005T180000Z_auto_a1b2c3d4",
  "type": "automatic | manual | safety | import",
  "status": "completed | failed | running | quarantined",
  "createdAt": "ISO-8601 UTC",
  "completedAt": "ISO-8601 UTC",
  "createdBy": { "kind": "system | user", "userId": "string?", "email": "string?" },
  "reason": "string? (e.g. 'pre-restore of bk_...')",
  "source": { "database": "nilelink", "host": "redacted label e.g. atlas-cluster0", "mongodumpVersion": "x.y.z" },
  "archive": { "file": "dump.archive.gz", "sizeBytes": 0, "sha256": "hex", "compression": "gzip" },
  "collections": [{ "name": "users", "documents": 0 }],
  "verification": { "verifiedAt": "ISO", "method": "dryRun|gzipTest", "ok": true },
  "protected": false,
  "restoredFrom": "backupId? (for safety backups: the target being restored)",
  "importedFrom": { "originalFileName": "sanitized string", "uploadedBy": "..." },
  "error": { "code": "string?", "message": "redacted string?" }
}
```

- **Never** store the Mongo URI/host credentials; `source.host` is a human label from config.
- `metadata.json` is the source of truth; folder name = `id`; mismatch ⇒ item `quarantined` and flagged in UI.
- `checksum.sha256` is a plain text copy for manual verification (`certutil -hashfile`).

## Implementation Tasks

- [ ] Create `layout.ts` with enum → folder mapping and `ensureLayout()` run at startup (creates folders, sets ACL guidance logged).
- [ ] Implement `safe-path.ts`: `resolveBackupDir(id)` validates id regex first, then builds path from layout and asserts `path.resolve(result).startsWith(path.resolve(BACKUP_ROOT) + sep)`; reject symlinks/junctions via `lstat`; reject any id with `..`, `/`, `\`, `:`.
- [ ] Implement `metadata.ts`: zod schema, `writeMetadata` atomic (write `.tmp` + rename), `readMetadata` with schema validation and `schemaVersion` migration hook.
- [ ] Implement `backup-store.ts`: `list({type?, limit, cursor})` (reads metadata only, sorted by `createdAt` desc, cached 30 s), `get(id)`, `markProtected(id, bool)`, `delete(id)` (only if not protected and not currently in use), `exists(id)`.
- [ ] Implement `disk.ts`: free/total bytes for `BACKUP_ROOT` volume (used by health and pre-flight).
- [ ] Add integrity re-check on `get(id)`: file exists, size matches metadata, (optional lazy) sha256 on demand via `POST /verify`.
- [ ] Update `.gitignore`.
- [ ] Unit tests: layout creation, id validation fuzz (`..\`, `%2e`, UNC paths `\\server\share`, drive letters, long names), metadata roundtrip, atomic write.

## Security Requirements

- Path traversal impossible by construction: callers pass IDs, never paths.
- Reject reparse points; no following symlinks.
- Folder ACL: only service account (+ Administrators) can read/write; not shared on the network; excluded from MailEnable or any web root.
- No metadata field is user-controlled except sanitized `importedFrom.originalFileName` (length-capped, charset-restricted, used for display only, never for paths).

## Error Handling

- Corrupt/unparseable `metadata.json` → item listed as `quarantined` (not deleted, not restorable) with reason.
- Missing archive for a `completed` metadata → `quarantined`.
- Free-space query failure → treat as unknown, block new backups conservatively.

## Testing

- See unit tests above; add a Windows-specific test run (reserved names `CON`, `NUL`, trailing dots/spaces).

## Acceptance Criteria

- [ ] Layout created on first run with correct subfolders.
- [ ] Any non-matching ID is rejected before touching the filesystem.
- [ ] Listing returns accurate type/size/date/status for all backups, including quarantined.
- [ ] No API path can resolve outside `BACKUP_ROOT`.

## Depends On

- 03

## Blocks

- 04, 07, 11, 12, 13

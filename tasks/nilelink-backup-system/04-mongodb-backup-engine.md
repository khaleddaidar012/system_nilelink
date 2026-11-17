# Task 04 — MongoDB Backup Engine

## Objective

Implement backup creation (and the verification primitives later used by restore) in the agent using the **official MongoDB Database Tools** (`mongodump`, `mongorestore`). No custom JSON export.

## Why This Is Needed

`mongodump` produces a consistent, restorable BSON archive and is the vendor-supported way. A temp-directory + atomic rename strategy guarantees a failed/partial backup can never be mistaken for, or replace, a valid one.

## Existing Project Files Involved

- `lib/mongodb.ts` — reference only for DB name (`nilelink`) and URI semantics; agent does **not** import it.
- `lib/models/index.ts` and `lib/models/*.ts` — list of collections expected in a dump (used for post-dump sanity check, e.g. `users`, `customers`, `documents`, `invoices` must exist in the archive).
- `wrangler.jsonc` — evidence DB is Atlas (do not copy the URI).

## New Files To Create

- `backup-agent/src/services/backup.service.ts` — orchestrates a backup.
- `backup-agent/src/services/mongo-tools.ts` — locates tools, runs them via `spawn` (no shell), parses output, redacts logs.
- `backup-agent/src/services/verify.service.ts` — archive verification.
- `backup-agent/src/services/job-lock.ts` — single-job mutex (shared with Task 05).
- `backup-agent/src/lib/ids.ts` — backup ID generation.
- `backup-agent/src/types/backup.ts` — metadata types (see Task 06).

## Files To Modify

- `backup-agent/src/config.ts` (tool paths, dump timeouts).
- `backup-agent/src/index.ts` (wire services).

## Design

**Backup ID:** `bk_<UTC yyyyMMddTHHmmssZ>_<type>_<8-char random>` e.g. `bk_20261005T180000Z_auto_a1b2c3d4`. Opaque, validated by regex `^bk_\d{8}T\d{6}Z_(auto|manual|safety|import)_[a-z0-9]{8}$`. This is the **only** identifier accepted from API callers.

**Directory/file naming:** final: `<BACKUP_ROOT>\<type-folder>\<id>\` containing:
- `dump.archive.gz` (single-file `mongodump --archive --gzip`)
- `metadata.json`
- `checksum.sha256`

**Temporary strategy:** write to `<BACKUP_ROOT>\temp\<id>.partial\` → verify → compute checksum → write `metadata.json` (status `completed`) → **atomic `rename`** to the final folder (same volume ⇒ atomic). Anything remaining in `temp\` at startup is an orphan and handled by Task 16.

**Command (spawn, args array, never a shell string):**
`mongodump --uri=<from secure config> --db=nilelink --archive=<temp>\dump.archive.gz --gzip --readPreference=secondaryPreferred` (avoid `--oplog`: not supported on Atlas shared tiers / non-replica-set; confirm per D2). Consider `--uri` passed via a config file (`--config`) or env so it does not appear in the Windows process list.

**Verification:**
1. Exit code 0 and archive size > minimum threshold (e.g. > 1 KB).
2. Parse dump log for `done dumping nilelink.<collection>` lines; require expected core collections (`users`, `customers`, `documents`, `invoices`, `systemsettings` — confirm real collection names from the Mongoose models) present.
3. Integrity: run `mongorestore --archive=<file> --gzip --dryRun --nsInclude=nilelink.*` (no DB writes) to prove the archive is readable; fall back to full gzip stream test if `--dryRun` unavailable.
4. SHA-256 checksum computed and stored.

**Size calculation:** `fs.stat` of the archive (bytes) stored in metadata; also record per-collection doc counts when available from the dump log.

**States:** `running → completed | failed`. Failed jobs keep a `failed` metadata record under `logs/failed/<id>.json` (no archive kept) so the UI can display failures; partial data is deleted.

## Implementation Tasks

- [ ] Implement `mongo-tools.ts`: resolve `mongodump.exe`/`mongorestore.exe` from `MONGO_TOOLS_DIR` or PATH; run `--version` at startup and expose via health.
- [ ] Implement `ids.ts` with crypto-random suffix and regex validator.
- [ ] Implement `job-lock.ts`: in-process mutex plus lock file `<BACKUP_ROOT>\temp\agent.lock` (PID + start time) to survive restarts (stale lock detection).
- [ ] Implement `createBackup({type, requestedBy})` in `backup.service.ts`:
  - [ ] Acquire lock (reject with `BUSY` if held).
  - [ ] Pre-flight: tools present, DB reachable (`mongodump` connectivity / a `ping`), free disk ≥ max(2 × last backup size, 1 GB).
  - [ ] Generate ID, create `temp\<id>.partial\`.
  - [ ] Spawn `mongodump`; stream stderr to redacted log; enforce timeout (config, default 30 min).
  - [ ] Verify (see above).
  - [ ] Compute size + SHA-256.
  - [ ] Write `metadata.json` then `checksum.sha256`.
  - [ ] Atomic rename to final folder.
  - [ ] Release lock in `finally`.
  - [ ] On any failure: delete partial dir, write failed record, keep previous backups untouched.
- [ ] Implement `verify.service.ts` (`verifyArchive(id)` reusable by restore/import).
- [ ] Add `redactedCommandForLog()` helper so logs show tool+flags but never the URI.
- [ ] Unit tests with a fake `mongodump` executable (script) for success, non-zero exit, timeout, truncated archive.

## Security Requirements

- `child_process.spawn` with argument array, `shell: false`; no user-supplied strings in args (type is an enum, id is generated).
- Mongo URI only from secure config; masked in logs; not in API responses.
- Backup user with minimum role (`backup`). Never use an Atlas admin account.
- Archive files created with ACL limited to the service account.

## Error Handling

- Tools missing → job fails fast with `TOOLS_NOT_FOUND`.
- DB unreachable → `DB_UNREACHABLE`, no temp dir left.
- Disk low/full → `DISK_SPACE_LOW`/`DISK_FULL`, partial deleted.
- Timeout → kill process tree, `TIMEOUT`.
- Process crash mid-dump → orphan temp handled at next start (Task 16).

## Testing

- Unit (fake tools), integration against a **test** MongoDB with seeded data: dump → verify → checksum matches → metadata correct.
- Corrupt archive test (truncate file) → verification fails, not promoted.

## Acceptance Criteria

- [ ] A backup of the test DB produces folder with `dump.archive.gz`, `metadata.json`, `checksum.sha256`.
- [ ] Failed runs leave no partial final folder and never touch older backups.
- [ ] Two simultaneous requests: second gets `BUSY`.
- [ ] No secret appears in logs.

## Depends On

- 03, 06 (layout/metadata schema must be defined first)

## Blocks

- 05, 10, 11, 13, 16

# Task 15 — Audit Logging

## Objective

Create a system-level audit trail for all backup operations: who, when, which backup, what operation, result — with no secrets stored.

## Why This Is Needed

Existing audit models (`DocumentActivityLog`, `InvoiceActivityLog`) are bound to a document/invoice and cannot record system events. Backups/restores need an immutable, queryable trail for accountability.

## Existing Project Files Involved

- `lib/models/DocumentActivityLog.ts`, `lib/models/InvoiceActivityLog.ts` — style reference (actorId, actorName, actorRole/actorType, ipAddress, userAgent, createdAt, indexes, `mongoose.models.X || mongoose.model`).
- `lib/models/index.ts` — register the new model export.
- `lib/mongodb.ts` — `connectDB()`.
- `lib/auth/token-service.ts` — `AuthSessionPayload` for actor data.
- `app/api/admin/documents/[id]/verify/route.ts` — example of how existing routes record activity.
- Backup routes from Task 08.

## New Files To Create

- `lib/models/SystemAuditLog.ts`
- `lib/backup/audit.ts` — `recordBackupAudit(event)`; extracts IP (`cf-connecting-ip`) and user-agent; sanitizes details.
- `backup-agent/src/audit/local-audit.ts` — append-only JSONL `logs/audit-local.jsonl` (agent-side source of truth if the Worker is unreachable).
- (Optional) `app/api/admin/system/backups/audit/route.ts` + UI tab in Task 09 to view the trail.

## Files To Modify

- `lib/models/index.ts`
- Backup route handlers (Task 08/10/11/12) to call `recordBackupAudit`.
- `backup-agent/src/services/*` to append local audit lines.

## Events

`BACKUP_CREATED`, `BACKUP_FAILED`, `BACKUP_DELETED`, `RESTORE_STARTED`, `RESTORE_COMPLETED`, `RESTORE_FAILED`, `BACKUP_IMPORTED` (required) plus recommended: `BACKUP_REQUESTED`, `BACKUP_IMPORT_FAILED`, `BACKUP_PROTECTED`, `BACKUP_UNPROTECTED`, `BACKUP_VERIFIED`, `ROLLBACK_STARTED/COMPLETED/FAILED`, `MAINTENANCE_ENABLED/DISABLED`, `AGENT_AUTH_FAILED` (rate-limited summary).

## Schema (`SystemAuditLog`)

```
event: enum (above)                         // indexed
operation: "backup|restore|import|delete|protect|verify|retention|maintenance"
result: "requested|success|failure"
actor: { userId?: ObjectId(ref User), email?: string, name?: string, role?: string, kind: "user|system|agent" }
backupId?: string                           // indexed
relatedBackupId?: string                    // e.g. safety backup for a restore
jobId?: string  (unique with event for idempotency of terminal events)
details?: { sizeBytes?, durationMs?, type?, reason?, errorCode?, step? }   // whitelisted keys only
ipAddress?: string, userAgent?: string
createdAt: Date (default now, indexed)
```
- Immutable: no update/delete routes; collection has only inserts (enforce in code; optionally capped/TTL-free).
- Indexes: `{createdAt:-1}`, `{backupId:1,createdAt:-1}`, `{event:1,createdAt:-1}`, unique sparse `{jobId:1,event:1}`.

## Implementation Tasks

- [ ] Create `SystemAuditLog.ts` modeled on existing log models.
- [ ] Register in `lib/models/index.ts`.
- [ ] Implement `lib/backup/audit.ts` with a **whitelist sanitizer** (drop unknown keys; truncate strings; strip anything matching URI/secret patterns).
- [ ] Wire audit calls into routes: requested (before agent call) and terminal (when the job result is first observed; idempotent via unique `{jobId,event}`).
- [ ] If audit write fails on a **destructive** action (restore/delete/import): abort *before* calling the agent (fail closed); for terminal events log locally and retry.
- [ ] Agent: `local-audit.ts` append-only; the Worker's `GET /jobs/:id` and list responses include any unsynced retention-delete events so the Worker can persist `BACKUP_DELETED` (agent never calls the Worker).
- [ ] Optional: audit list endpoint + table (super_admin only), paginated.
- [ ] Tests: event per operation, no secrets, idempotent terminal event, fail-closed behaviour.

## Security Requirements

- No secrets, URIs, HMAC data, file paths or request bodies in audit `details`.
- Actor information taken from the verified session/DB — never from client input.
- Audit records visible only to `super_admin`.

## Error Handling

- Audit DB unavailable → destructive ops refused; non-destructive ops proceed but local agent audit still records.
- Duplicate terminal event → ignored by unique index.

## Testing

- Unit tests for sanitizer; integration for each event; check `SystemAuditLog` content after a full backup/restore cycle on a test DB.

## Acceptance Criteria

- [ ] All seven required events recorded with actor, timestamp, backup ID, operation, result.
- [ ] No secret material in any record.
- [ ] Records cannot be edited/deleted through the app.

## Depends On

- 01

## Blocks

- 08, 10, 11, 12, 13, 20

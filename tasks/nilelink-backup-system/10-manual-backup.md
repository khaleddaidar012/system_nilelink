# Task 10 — Manual Backup

## Objective

"Create Backup Now" button: super_admin triggers a manual backup, sees progress, gets a result notification, and the action is audited.

## Why This Is Needed

Admins need an on-demand backup before risky changes (deploys, bulk edits) without waiting for 21:00.

## Existing Project Files Involved

- `app/api/admin/system/backups/route.ts` (Task 08, `POST`) — create endpoint.
- `app/api/admin/system/backups/jobs/[jobId]/route.ts` (Task 08) — polling.
- `lib/backup/agent-client.ts`, `lib/backup/guard.ts`, `lib/models/SystemAuditLog.ts`.
- `components/admin/system/backups/BackupsManager.tsx` (Task 09).
- `components/ui/Button.tsx`, `components/ui/Toast.tsx`/`sonner`.
- `messages/*.json` (`admin.backups.create.*`).

## New Files To Create

- `components/admin/system/backups/CreateBackupButton.tsx`
- `components/admin/system/backups/useBackupJob.ts` (hook: start job, poll status, terminal-state handling)

## Files To Modify

- `components/admin/system/backups/BackupsManager.tsx` (mount button, refresh list on completion)
- `app/api/admin/system/backups/route.ts` (finalize `POST`: optional `reason`, cool-down, audit)
- `messages/*.json`

## Flow

```
Click "Create Backup Now" → (optional reason, ≤200 chars) → confirm
 → POST /api/admin/system/backups  (guard, same-origin, cool-down)
 → audit BACKUP_REQUESTED (actor, reason)
 → agent POST /v1/backups → 202 {jobId}
 → UI polls /jobs/:jobId (every 2 s) → state: queued/running/succeeded/failed
 → on success: toast + list refresh; audit BACKUP_CREATED (backupId, size)
 → on failure: toast with safe error code; audit BACKUP_FAILED
```

## Implementation Tasks

- [ ] Implement `useBackupJob` (start, poll with backoff, stop on terminal state or unmount; persist `jobId` in `sessionStorage` so a page refresh resumes polling).
- [ ] Implement `CreateBackupButton`: disabled while `isStarting || runningJob || agentOffline`; shows spinner + step label; `aria-busy`.
- [ ] Duplicate-request prevention: (1) client disables button, (2) server cool-down from `SystemAuditLog` (reject if a manual request exists in the last 30 s), (3) agent lock returns `BUSY` (409) — UI shows "A backup is already running".
- [ ] Finalize `POST` handler: validate body, audit, call agent, return `202 {jobId}`.
- [ ] On job terminal state the Worker writes `BACKUP_CREATED`/`BACKUP_FAILED` audit (triggered when the polling route first observes the terminal state; idempotent by `jobId` unique key to avoid duplicates).
- [ ] Result notifications: success toast (ID, size), failure toast (error code + request id), persistent banner if failed.
- [ ] Translate strings (ar/en + generator).
- [ ] Tests: double-click, two admins simultaneously, agent down, job fails, page refresh mid-job.

## Security Requirements

- `super_admin` only; same-origin check; reason is sanitized/length-capped, never used in paths or commands.
- Rate limit: cool-down + agent token bucket.

## Error Handling

- `BUSY` → informative toast, no retry storm.
- `AGENT_UNAVAILABLE` → disabled UI + toast.
- Poll failures (network) → retry with backoff up to a limit, then show "status unknown — check list".
- Job `interrupted` → treated as failed with explanation.

## Testing

- Hook unit tests (fake timers); API tests (cool-down, audit idempotency); e2e: create backup on test env and verify appears in list.

## Acceptance Criteria

- [ ] One click creates exactly one backup of type `manual`.
- [ ] Concurrent attempts never create two simultaneous backups.
- [ ] Audit has exactly one terminal entry per job.
- [ ] Failure leaves previous backups intact and UI recovers.

## Depends On

- 08, 09, 15, 04

## Blocks

- 18, 19, 20

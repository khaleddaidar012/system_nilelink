# Task 02 — Architecture

## Objective

Define the final architecture and the contract between its four components, plus the decisions that must be made before coding.

## Why This Is Needed

Cloudflare Workers cannot run `mongodump` or read `C:\NileLink\Backups`. A wrong connectivity choice here affects security and every later task.

## Existing Project Files Involved

- `lib/mongodb.ts` — production DB access (app side only; agent has its own connection config).
- `lib/auth/rbac-guard.ts` — `requireAuth(request, ["super_admin"])`.
- `wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts` — Worker env typing/bindings.
- `lib/storage/r2-storage.ts` — R2 (documents) — relevant to scope decision.
- `.github/workflows/deploy.yml`, `CLOUDFLARE_GUIDE.md`.

## New Files To Create

- None (this file is the design). Later tasks create the files listed there.

## Files To Modify

- None.

## Components

### A) Cloud / Web application (Cloudflare Workers, OpenNext)
- Admin UI `app/[locale]/admin/system/backups/page.tsx`.
- Protected API `app/api/admin/system/backups/**` (super_admin only).
- `lib/backup/agent-client.ts` signs and sends requests to the agent.
- `SystemAuditLog` collection in MongoDB (written by the Worker, not the agent).
- Holds **only**: `BACKUP_AGENT_URL`, `BACKUP_AGENT_KEY_ID`, `BACKUP_AGENT_HMAC_SECRET` (Worker *secrets*). Never holds the MongoDB dump, never receives MongoDB credentials for backup tools.

### B) Windows Server Backup Agent (`backup-agent/`, Node.js + TypeScript, runs as a Windows service)
- Only component that runs `mongodump`/`mongorestore` and touches the disk.
- Holds the DB connection string used for dump/restore in a **machine-level environment/secret file readable only by the service account** (never sent over the network, never logged).
- Runs the scheduler (21:00 Africa/Cairo), retention, verification, metadata.
- Exposes a small HTTP API bound to `127.0.0.1` (reached via tunnel/reverse proxy) — see decision D1.

### C) MongoDB
- Production database `nilelink` (Atlas today). Agent connects as a dedicated **backup user** (`backup` built-in role for dump) and a separate, rarely-used **restore user** (`restore` role) if the platform allows; otherwise a single least-privilege user.

### D) Local backup storage
- `C:\NileLink\Backups` on the Windows Server. Layout and metadata in Task 06. Only the agent service account has write access.

## Communication

```
Browser ──HTTPS+session cookie──► Worker /api/admin/system/backups/*
   Worker: requireAuth(super_admin) → validate input → write audit(STARTED)
   Worker ──HTTPS + HMAC headers──► Agent API (via Cloudflare Tunnel or reverse proxy)
   Agent: verify HMAC/timestamp/nonce → run job → write metadata/logs
   Agent ──► Worker: JSON response (job id / status)   [pull model; no callbacks into Worker]
   Worker: write audit(RESULT) → respond to browser
```

- Long operations (backup, restore) are **asynchronous jobs**: `POST` returns `202 {jobId}`; UI polls `GET /jobs/:id` through the Worker. Avoids Worker time limits.
- The agent **never calls the Worker** (no inbound exposure of the app to the agent, simpler trust model). Audit entries are written by the Worker based on job results; the agent additionally keeps its own local log (`logs/`) as source of truth if the Worker is unreachable.

## Hard constraints

- Worker never accesses `C:\NileLink\Backups` directly.
- The browser never talks to the agent (exception only if Task 12 chooses signed direct upload; must be explicitly approved).
- No arbitrary filesystem paths cross any API: only opaque backup IDs.
- MongoDB credentials never leave the agent host.

## Open decisions

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | How does the Worker reach the agent? | (a) **Cloudflare Tunnel** (`cloudflared` on the server, outbound-only, no inbound firewall port) + HMAC; (b) public HTTPS port on server behind reverse proxy; (c) **Pull model**: agent polls a job queue in MongoDB/Worker — no inbound access at all | (a) with HMAC and optional Cloudflare Access service token; (c) is the strongest alternative if the company refuses a tunnel |
| D2 | Is production DB Atlas or self-hosted? | Atlas (current evidence) / local mongod | Confirm. Affects connectivity, permissions, restore strategy |
| D3 | Scope: only MongoDB, or also R2 documents? | DB only / DB + R2 sync | DB only for v1 (as specified); add R2 as a follow-up task |
| D4 | Backup encryption at rest | none / AES-256 with key held on server / BitLocker volume | Encrypt archives (AES-256-GCM) or at least BitLocker on `C:`; confirm |
| D5 | Who can restore/delete? | `super_admin` only / + staff with new permission | `super_admin` only |
| D6 | Import size limit and path | Via Worker (≤ ~100 MB) / direct signed upload to agent | Limit via Worker v1; direct signed upload only if dumps are larger |
| D7 | Browser download of backups | disabled / enabled | Disabled in v1 (PII + password hashes) |
| D8 | Restore target | Same DB `nilelink` / staging DB first | Restore to same DB only after safety backup; support optional `targetDbName` for test restores (agent allow-list) |
| D9 | Maintenance mode during restore | none / app-wide flag in `SystemSetting` | Add a maintenance flag so writes are blocked during restore |

## Decisions Log (answered 2026-10-05)

| # | Decision taken | Impact on tasks |
|---|---|---|
| D1 | **Cloudflare Tunnel + HMAC** | Task 07/17: agent binds to loopback; `cloudflared` service; no inbound firewall rule |
| D2 | **MongoDB Atlas** is production | Task 04: dump a remote cluster; no `--oplog`; use a dedicated Atlas backup user |
| D3 | **MongoDB only** in v1 (R2 later) | R2 sync is a future task, not in this pack |
| D4 | **BitLocker on the volume only** (no per-archive AES) | Task 14/17: enable BitLocker on the backup drive; metadata has no encryption fields |
| D5 | **`super_admin` + `staff` with a NEW permission** (owner overrode the default) | Task 08/09/11: add `canManageBackups` to `IStaffPermissions` (`lib/models/User.ts`) and use `assertStaffPermission(request, "canManageBackups")`; destructive ops (restore/delete/import) must keep the DB re-check of role+status+permission, typed confirmation and audit. Page gate becomes super_admin OR staff with the permission. Role admin UI (`app/api/admin/roles`, `app/api/admin/staff`) needs the new key |
| D6–D9 | **Not answered yet — defaults apply**: D6 import via Worker with size cap; D7 browser download disabled; D8 restore to same DB, optional allow-listed test DB; D9 maintenance flag | Revisit before Tasks 11/12 |

Implementation start scope (owner choice): **Tasks 06 → 03 → 15 → 04** on the developer machine, tested against a test database, **no production access**.

## Implementation Tasks

- [x] Obtain answers to D1–D9 from the owner and record them here (D1–D5 answered; D6–D9 defaults).
- [ ] Freeze the HTTP contract in Task 07 accordingly.
- [ ] Update `README` progress.

## Security Requirements

- Defence in depth: Worker auth (session+role) **and** agent auth (HMAC). Compromise of one must not allow restore.

## Error Handling

- If the agent is unreachable the UI shows a degraded state; no operation is queued blindly in the Worker.

## Testing

- Architecture review sign-off; later covered by Task 18.

## Acceptance Criteria

- [ ] D1–D9 answered.
- [ ] Diagram reviewed and accepted.

## Depends On

- 01

## Blocks

- 03, 04, 05, 06, 07, 08, 14

# NileLink Backup System — Current Status & Handoff Summary
Date: October 7, 2026
System: NileLink Logistics Platform (Next.js 16 + Cloudflare OpenNext + Dedicated Windows Backup Agent)

---

## 1. Executive Summary & Architecture

The backup architecture separates the web application from file system operations:
* **Web App (Cloudflare Workers / OpenNext):** Serves the Next.js frontend, performs role-based authorization (`super_admin` or `staff` with `canManageBackups`), validates user actions, records audit trails in MongoDB (`SystemAuditLog`), and proxies backup calls to the Windows Server.
* **Windows Backup Agent (`backup-agent/`):** A dedicated Node.js service running on the company Windows Server. It directly runs MongoDB database tools (`mongodump` / `mongorestore`), handles disk operations under `C:\NileLink\Backups`, maintains automated schedulers, and exposes a secure loopback API reached via Cloudflare Tunnel.
* **Security & Auth:** Communication between the Next.js Worker and the Backup Agent uses dual-layer security:
  - **Perimeter Auth:** Cloudflare Access Service Token (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) verified at the Cloudflare Edge before entering Cloudflare Tunnel.
  - **Cryptographic Auth:** HMAC-SHA256 request signing (`X-NL-Key-Id`, `X-NL-Timestamp`, `X-NL-Nonce`, `X-NL-Signature`) with replay attack prevention, 60-second clock skew tolerance, and actor attribution.
  - Full details in `CLOUDFLARE_ACCESS_BACKUP_INTEGRATION.md`.

---

## 2. Completed Phases & Implemented Features

### Phase 1: Core Agent Engine & Architecture
* [x] **Task 01 & 02: Architecture & Decision Log:**
  - Production database is MongoDB Atlas.
  - Tunnel-based connectivity using loopback + HMAC headers.
  - BitLocker volume encryption at rest.
* [x] **Task 03, 04, 06: Backup Engine, Layout & Metadata:**
  - Standard backup structure under `C:\NileLink\Backups` (`automatic/`, `manual/`, `safety/`, `imports/`, `temp/`, `logs/`).
  - Atomic writing via `<id>.partial` and rename into place upon verification.
  - Metadata schema with SHA-256 hash calculation, collection document counting, and gzip integrity verification.
  - Prevention against deleting the last valid backup and protection locks.
* [x] **Task 05: Automatic Daily Scheduler:**
  - Wall-clock trigger at **21:00 Africa/Cairo** daily with automatic DST (Daylight Saving Time) handling.
  - Overlap prevention (lock mutex), catch-up within 180 minutes of server restart, and single-run-per-date guarantees.
* [x] **Task 07: Secure Agent API (`/v1`):**
  - HMAC authentication, 5-minute nonce store cache, and rate limiting.
  - Endpoints: `GET /v1/health`, `GET /v1/backups`, `POST /v1/backups`, `POST /v1/backups/:id/protect`, `DELETE /v1/backups/:id`, `GET /v1/jobs/:jobId`, `GET /v1/scheduler`, `GET /v1/retention/preview`.
  - Placeholder endpoints (`501 Not Implemented`) for restore & import.
* [x] **Task 13: Retention & Automatic Cleanup:**
  - Keeps newest 30 automatic daily backups.
  - Retains newest 3 safety backups and purges older than 30 days.
  - Never auto-deletes manual, imported, protected, quarantined, or the last remaining valid backup.
  - Fails safe (aborts cleanup without deletion) on any corrupt or unverified metadata.

### Phase 2: Next.js Integration & Admin Dashboard
* [x] **Task 08: Next.js API Proxy (`/api/admin/system/backups`):**
  - Web Crypto HMAC signer (`lib/backup/signing.ts`, `lib/backup/agent-client.ts`).
  - Route handlers for listing, manual creation, health checks, protection toggles, deletion, and job polling.
  - Audit logs written to `SystemAuditLog` collection.
  - Same-origin CSRF validation and cool-down throttling on manual creation.
* [x] **Task 09: Admin Dashboard UI (`/admin/system/backups`):**
  - Route accessible at `http://localhost:3000/en/admin/system/backups` (and `/ar/...`).
  - Bilingual interface (English & Arabic with full RTL support).
  - Live status cards showing agent health, tools versions, disk space, and next scheduled run.
  - Backups table with status badges, Cairo timestamps, protection locks, and delete triggers.
* [x] **Task 10: Manual Backup Trigger:**
  - "Create Backup Now" button with optional reason input.
  - Client-side async job tracking, live polling against `/jobs/:jobId`, step progress indicator, and toast notifications.
* [x] **Dev Mock Agent:**
  - `backup-agent/scripts/dev-mock-agent.ts` enables instant testing of the full web UI and polling loop without connecting to real databases.

---

## 3. Pending Phases (What to Build Next)

| Task | Title | Description |
|---|---|---|
| **Task 11** | **Restore System** | Safe database restore using `mongorestore`. Creates an automatic safety backup first, requires typed confirmation phrase (`RESTORE-CONFIRM`), supports app-wide maintenance mode, and enforces role verification. |
| **Task 12** | **Import Backup** | Uploading external `.archive.gz` files from the browser, validating archive structure, computing SHA-256, and registering under `imports/` as protected. |
| **Task 14** | **Security & Permissions Hardening** | Granular RBAC review, role management UI for `canManageBackups`, and secret auditing. |
| **Task 15** | **Audit Logging Review** | Viewing audit history in the UI (`SystemAuditLog` entries for create/delete/protect/restore). |
| **Task 16** | **Error Recovery & Diagnostics** | Quarantine management, repairing unverified archives, and retry queues. |
| **Task 17** | **Windows Server Deployment** | Setting up `cloudflared` (Cloudflare Tunnel) and `node-windows` service installation on the target production machine. |
| **Task 18–20** | **Testing & Final Checklist** | End-to-end integration testing on staging/test database. |

---

## 4. Key Files Reference

* **Next.js Web API:**
  - `app/api/admin/system/backups/route.ts` (List & Create)
  - `app/api/admin/system/backups/health/route.ts` (Health & Scheduler Info)
  - `app/api/admin/system/backups/[id]/route.ts` (Get single & Delete)
  - `app/api/admin/system/backups/[id]/protect/route.ts` (Toggle Lock)
  - `app/api/admin/system/backups/jobs/[jobId]/route.ts` (Async Job Polling)
* **Next.js Web UI:**
  - `app/[locale]/admin/system/backups/page.tsx` (Page container & auth gate)
  - `components/admin/system/backups/BackupsManager.tsx` (Main client component)
  - `components/admin/system/backups/BackupStatusCard.tsx` (Status & metrics card)
  - `components/admin/system/backups/BackupsTable.tsx` (Interactive table)
  - `components/admin/system/backups/formatters.ts` (Cairo timezone & size formatters)
* **Agent Core (`backup-agent/src/`):**
  - `config.ts` (Zod environment parsing)
  - `server.ts` (HTTP server & HMAC router)
  - `services/backup.service.ts` (`mongodump` orchestrator)
  - `services/job-manager.ts` (Background job tracking)
  - `scheduler/scheduler.ts` (Cairo 21:00 scheduler)
  - `services/retention.service.ts` (30-day retention cleaner)
  - `auth/hmac.ts` & `auth/nonce-store.ts` (HMAC authentication & replay guard)

---

## 5. How to Run & Continue Development

### To run in Development (Mock Mode):
1. **Terminal 1 (Mock Agent):**
   ```powershell
   cd d:\khaled\nile_link_website-main\backup-agent
   $k = (Get-Content .dev-key.txt).Trim()
   $env:AGENT_HMAC_KEYS = "{`"k1`":`"$k`"}"
   npx tsx scripts/dev-mock-agent.ts
   ```
2. **Terminal 2 (Next.js Web App):**
   ```powershell
   cd d:\khaled\nile_link_website-main
   npm run dev
   ```
3. Open in browser: `http://localhost:3000/en/admin/system/backups` (Login: `manager@nilelink.com` / `Manager2026!`).

### Next Immediate Action for AI Assistant:
Proceed with **Task 11 (Restore System)** and **Task 12 (Import Backup)** according to specifications in `tasks/nilelink-backup-system/11-restore-system.md` and `12-import-backup.md`.

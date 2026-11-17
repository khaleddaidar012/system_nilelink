# Nile Link Local Backup & Restore System

> STATUS: PLANNING ONLY. No code from this pack has been implemented yet.
> Do not start implementation until explicitly instructed. Execute tasks **one file at a time, in order**.

## Goal

Give Nile Link administrators a safe, auditable way to **create, list, import and restore MongoDB backups** from the admin dashboard, with an **automatic daily backup at 21:00 (Africa/Cairo)** stored on the company Windows Server under `C:\NileLink\Backups`.

The Next.js app runs on **Cloudflare Workers (OpenNext)** and therefore can never touch the Windows disk. All disk and `mongodump`/`mongorestore` work is done by an independent **Windows Backup Agent**.

## Architecture Summary

Production:

```
MongoDB (production DB — currently MongoDB Atlas, see Task 01)
   ↑
Nile Link System (Next.js on Cloudflare Workers)
```

Backup:

```
Nile Link Dashboard (Admin UI, /admin/system/backups)
        ↓
Nile Link protected API (app/api/admin/system/backups/*)
        ↓  (HTTPS + HMAC-signed requests)
Secure Backup Agent API (Windows Server, Node.js service)
        ↓
MongoDB Database Tools (mongodump / mongorestore)
        ↓
C:\NileLink\Backups
```

## Task Progress

- [ ] 01 Project Analysis — [01-project-analysis.md](./01-project-analysis.md)
- [ ] 02 Architecture — [02-architecture.md](./02-architecture.md)
- [ ] 03 Windows Backup Agent — [03-windows-backup-agent.md](./03-windows-backup-agent.md)
- [ ] 04 MongoDB Backup Engine — [04-mongodb-backup-engine.md](./04-mongodb-backup-engine.md)
- [x] 05 Automatic Scheduler — [05-automatic-scheduler.md](./05-automatic-scheduler.md) (unit-tested; real-time smoke test on a test DB still pending)
- [ ] 06 Backup Storage & Metadata — [06-backup-storage-metadata.md](./06-backup-storage-metadata.md)
- [x] 07 Secure Agent API — [07-secure-agent-api.md](./07-secure-agent-api.md) (restore/import routes return 501 until Tasks 11/12)
- [x] 08 Next.js Integration — [08-nextjs-integration.md](./08-nextjs-integration.md)
- [x] 09 Dashboard Backups Page — [09-dashboard-backups-page.md](./09-dashboard-backups-page.md)
- [x] 10 Manual Backup — [10-manual-backup.md](./10-manual-backup.md)
- [ ] 11 Restore System — [11-restore-system.md](./11-restore-system.md)
- [ ] 12 Import Backup — [12-import-backup.md](./12-import-backup.md)
- [x] 13 Retention & Cleanup — [13-retention-cleanup.md](./13-retention-cleanup.md)
- [ ] 14 Security & Permissions — [14-security-permissions.md](./14-security-permissions.md)
- [ ] 15 Audit Logging — [15-audit-logging.md](./15-audit-logging.md)
- [ ] 16 Error Recovery — [16-error-recovery.md](./16-error-recovery.md)
- [ ] 17 Windows Server Deployment — [17-windows-server-deployment.md](./17-windows-server-deployment.md)
- [ ] 18 Testing — [18-testing-plan.md](./18-testing-plan.md)
- [ ] 19 Production Checklist — [19-production-checklist.md](./19-production-checklist.md)
- [ ] 20 Final Verification — [20-final-verification.md](./20-final-verification.md)

## Dependencies Between Tasks

```
01 Analysis ─► 02 Architecture ─┬─► 03 Agent skeleton ─┬─► 04 Backup engine ─► 05 Scheduler
                                │                      ├─► 06 Storage & metadata ─► (04, 13)
                                │                      └─► 07 Secure Agent API
                                │
                                └─► 14 Security (design input to 07/08; implement alongside)
                                     15 Audit logging (model needed before 08/10/11/12)

07 Agent API ─► 08 Next.js integration ─► 09 Dashboard page ─┬─► 10 Manual backup
                                                              ├─► 11 Restore  (needs 04, 06, 15)
                                                              └─► 12 Import   (needs 06, 07)
04 + 06 ─► 13 Retention
04/11 ─► 16 Error recovery (hardening pass across 03–13)
03–16 ─► 17 Windows deployment ─► 18 Testing ─► 19 Prod checklist ─► 20 Final verification
```

Hard rules:

1. **06 (storage/metadata) must exist before 04 writes anything** — define layout first, then the engine.
2. **15 (audit model) must exist before 10, 11, 12** write audit entries.
3. **11 (restore) must not be started before 04 (backup engine) is verified**, because restore depends on the safety-backup path.
4. **14 is a design input** to 07/08. Read it before implementing those; implement its controls inside them.
5. Nothing is deployed to production (17+) before 18 testing passes on a **test database**.

## Open decisions that block implementation

See the final summary in the chat and [02-architecture.md](./02-architecture.md#open-decisions). Key ones: Atlas vs self-hosted production DB, agent connectivity method (Tunnel vs polling), scope of R2 files, who may restore, import size limits.

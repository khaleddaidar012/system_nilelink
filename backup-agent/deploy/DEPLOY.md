# Backup Agent 0.2.2 — Windows Server update (MailEnable Bad Mail & Queue Fix)

Changes vs 0.2.1:
- Resolves MailEnable install root upward from any configured or discovered path (e.g. if `MAILENABLE_PATH` points to `Queues` or `Bad Mail\Messages`, it automatically detects `<Root>\Bad Mail\Messages`).
- Always checks `path.dirname(queuesDir)` as a primary root, ensuring `Bad Mail\Messages` is discovered even if `MAILENABLE_PATH` is unconfigured.
- Accurately counts empty queue as `badMail: 0` and `accessible: true`.
- Distinguishes empty directories, missing directories, and permission errors (`EACCES`/`EPERM`).
- Adds non-sensitive diagnostic info showing the actual resolved Bad Mail path.
- All backup, restore, scheduler, retention, and Cloudflare Tunnel functionalities remain intact.

## What gets replaced
| Replaced | Never touched |
| --- | --- |
| `<InstallDir>\dist\` (compiled agent) | `.env` / machine env vars (HMAC keys, Mongo URI) |
| `package.json`, `package-lock.json` | `C:\NileLink\Backups\*` (backups, logs, scheduler state) |
| `scripts\probe-agent.mjs` | `cloudflared` service / tunnel config |
| | `node_modules\` (no new dependencies) |

Service to restart: **NileLinkBackupAgent** (node-windows service; the script auto-detects its real name).
Do **not** restart `cloudflared` or MailEnable.

## 1. Build the release (dev machine)
```powershell
cd d:\khaled\nile_link_website-main\backup-agent
powershell -ExecutionPolicy Bypass -File deploy\make-release.ps1
# -> release\nilelink-backup-agent-0.2.2.zip
```

## 2. Copy to the server
Copy the zip to the server (RDP drive redirection, SMB, etc.) and extract it, e.g. to `C:\Temp\nilelink-agent-0.2.2\`.

## 3. Apply (elevated PowerShell on the server)
```powershell
cd C:\Temp\nilelink-agent-0.2.2
powershell -ExecutionPolicy Bypass -File deploy\update-agent.ps1
```
The script:
1. Backs up current `dist` to `dist.bak-<timestamp>`.
2. Stops `NileLinkBackupAgent` service.
3. Replaces `dist` with version 0.2.2.
4. Starts `NileLinkBackupAgent` service.
5. Runs signed local verification (`/v1/health` reports v0.2.2, `/v1/mail/status` returns queues, `/v1/backups` returns 200).
6. Automatically rolls back if any check fails.

Manual equivalent:
`Stop-Service NileLinkBackupAgent` → copy `dist\` over `<InstallDir>\dist\` → `Start-Service NileLinkBackupAgent`.

## 4. Verify through the tunnel (from dev machine)
```powershell
node --env-file=.env.local backup-agent/scripts/probe-agent.mjs /v1/health       # shows version 0.2.2
node --env-file=.env.local backup-agent/scripts/probe-agent.mjs /v1/mail/status  # returns 200 with inbound, outbound, and badMail: 0
```
Then open `/en/admin` → System Overview → Bad Mail shows `0`, and status turns **Online & Healthy**!

## 5. Permissions Check (If Bad Mail displays Permission Denied)
If the Windows service runs under a restricted local account and the dashboard shows an `EACCES` or permission warning for `Bad Mail\Messages`:
Grant Read permissions to the service account or `Users` group on the directory:
```powershell
icacls "C:\Program Files (x86)\Mail Enable\Bad Mail" /grant "Users:(OI)(CI)R" /T
```
(Or ensure the user account under which `NileLinkBackupAgent` service is configured has Read access to `C:\Program Files (x86)\Mail Enable\Bad Mail\Messages`).

## Manual rollback (if ever needed)
```powershell
Stop-Service NileLinkBackupAgent
robocopy "<InstallDir>\dist.bak-<timestamp>" "<InstallDir>\dist" /MIR
Start-Service NileLinkBackupAgent
```

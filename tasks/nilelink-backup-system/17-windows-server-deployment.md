# Task 17 — Windows Server Deployment

## Objective

Exact, ordered steps to deploy the agent on the company Windows Server without disturbing existing services (**especially MailEnable**).

## Why This Is Needed

The agent is useless until it runs reliably as a service with the right tools, permissions, secrets and connectivity.

## Existing Project Files Involved

- `backup-agent/**` (Tasks 03–16 output), `backup-agent/.env.example`, `backup-agent/docs/runbooks.md`.
- `CLOUDFLARE_GUIDE.md` — add Worker secret setup + tunnel notes.
- `wrangler.jsonc` — **no secrets here**; Worker secrets via `wrangler secret put`.
- `.github/workflows/deploy.yml` — unchanged (agent is deployed manually/separately, not by the Worker pipeline).

## New Files To Create

- `backup-agent/deploy/install.ps1` (idempotent installer script; prints actions, requires explicit confirmation flag)
- `backup-agent/deploy/uninstall.ps1`
- `backup-agent/deploy/README-deploy.md`
- `backup-agent/deploy/cloudflared-config.example.yml` (if tunnel chosen, D1a)

## Files To Modify

- `CLOUDFLARE_GUIDE.md`

## Deployment steps (run on the Windows Server; **do not execute until instructed**)

1. **Pre-checks (read-only):** Windows Server version, free disk on target volume (≥ 3× expected DB dump size × retention 30 + safety), existing listeners (`netstat -ano | findstr LISTEN`) to choose a free port and confirm **MailEnable ports (25/110/143/465/587/993/995/…) and its admin/web ports are untouched**; list installed services; confirm outbound access to the MongoDB host (Atlas: port 27017 / SRV DNS) and to Cloudflare (if tunnel).
2. **MongoDB Database Tools:** download the official MSI/ZIP matching the server's MongoDB (Atlas) compatibility from mongodb.com; install to `C:\Program Files\MongoDB\Tools\<ver>\bin` (or unzip to `C:\NileLink\tools\mongodb-tools`); record `mongodump --version`; do **not** install/enable a MongoDB *server* here.
3. **Node.js runtime:** install Node.js LTS (≥ 20, same major as CI uses: 20) system-wide, or bundle the agent with a single-file runtime; verify `node -v`.
4. **Directories:** create `C:\NileLink\Backups\{automatic,manual,safety,imports,temp,logs}`, `C:\NileLink\agent` (app files), `C:\NileLink\config` (secrets).
5. **Service account:** create local user `svc_nilelink_backup` (no interactive logon, password never expires, random 24+ chars, stored in the company password manager) or use a gMSA if domain-joined.
6. **Permissions (icacls):** `C:\NileLink\Backups` → Full control: `svc_nilelink_backup`, `Administrators`, `SYSTEM`; remove `Users`/`Everyone`. `C:\NileLink\agent` → Read & execute for service account. `C:\NileLink\config` → Read for service account + Administrators only. Not shared via SMB. Exclude from any web root / MailEnable data directories. Disable inheritance as needed.
7. **Environment/secrets:** place Mongo URI and HMAC keys in `C:\NileLink\config\agent.env` (ACL above) or machine env vars (`setx /M`), plus `BACKUP_ROOT`, `AGENT_PORT`, `AGENT_BIND=127.0.0.1`, `MONGO_TOOLS_DIR`, `TZ=Africa/Cairo`. Never commit; never email.
8. **Install agent:** copy built `dist` + production `node_modules` (`npm ci --omit=dev`) to `C:\NileLink\agent`.
9. **Windows service:** install `NileLinkBackupAgent` (automatic start; run as `svc_nilelink_backup`; recovery: restart after 1 min, 1 min, 5 min; reset fail count daily; delayed start optional). Verify it starts after reboot.
10. **Connectivity (per D1):** (a) install `cloudflared` as a service, create a named tunnel mapping `https://backup-agent.<company-domain>` → `http://127.0.0.1:<AGENT_PORT>`, protect with Cloudflare Access service token; **no inbound firewall rule**; or (b) if a reverse proxy/port is used: open only the chosen port from Cloudflare IP ranges, with TLS; confirm with IT it does not collide with MailEnable/IIS bindings.
11. **Windows Firewall:** keep default inbound block; **no** inbound rule for the agent when using loopback+tunnel; allow outbound 443 (Cloudflare) and 27017/DNS to Mongo host only if egress is restricted.
12. **Logs:** `C:\NileLink\Backups\logs` with daily rotation (agent) + retention of logs 90 days; optionally forward critical events to Windows Event Log.
13. **Startup/restart:** verify service recovery by killing the process; verify auto-start after reboot; verify `cloudflared` service too.
14. **Worker side:** `wrangler secret put BACKUP_AGENT_URL`, `BACKUP_AGENT_KEY_ID`, `BACKUP_AGENT_HMAC_SECRET` (and Access service-token secrets if used); redeploy.
15. **Time sync:** ensure Windows Time service is syncing (NTP) — critical for HMAC timestamp window and scheduler.
16. **Antivirus:** add exclusion only for `C:\NileLink\Backups\temp` if AV causes dump locking; document it.
17. **Smoke test:** `GET /v1/health` via the public route with a signed request; run a manual backup on a **test** database first.

## Implementation Tasks

- [ ] Write `install.ps1`/`uninstall.ps1` implementing steps 4–9 idempotently with `-WhatIf`/`-Confirm` safeguards.
- [ ] Write `README-deploy.md` containing steps 1–17 with exact commands and expected outputs.
- [ ] Prepare `cloudflared-config.example.yml`.
- [ ] Update `CLOUDFLARE_GUIDE.md` with Worker secret commands.
- [ ] Execute deployment on a staging VM first; record deviations.
- [ ] Obtain sign-off from the server owner before touching production (no change to MailEnable, IIS or existing firewall rules).

## Security Requirements

- Least-privilege service account; restricted ACLs; secrets outside the repo; no inbound exposure when tunnel is used; patched OS; RDP not exposed to the internet.
- MailEnable: **do not** modify its services, ports, directories, certificates or firewall rules. Agent port must differ from any existing listener.

## Error Handling

- Installer aborts on any failed pre-check; prints what was and wasn't changed; uninstall leaves backup data intact.

## Testing

- Staging VM full run; reboot test; kill test; permission test (service account cannot read outside its folders; `Users` cannot read backups).

## Acceptance Criteria

- [ ] Agent runs as a service, survives reboot and crash, logs correctly.
- [ ] Tools installed and versions recorded; directories/ACLs verified.
- [ ] MailEnable unaffected (service status/ports compared before and after).
- [ ] Worker can reach the agent through the approved route; direct internet access to loopback port impossible.

## Depends On

- 03–16

## Blocks

- 18 (integration/staging), 19, 20

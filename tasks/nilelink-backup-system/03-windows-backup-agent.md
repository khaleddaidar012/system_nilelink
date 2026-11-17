# Task 03 — Windows Backup Agent

## Objective

Create the skeleton of an independent Node.js/TypeScript service (`backup-agent/`) that runs as a Windows service: config loading, logging, health endpoint, graceful shutdown, auto-restart. No backup logic yet.

## Why This Is Needed

Only a process running on the Windows Server can run MongoDB Database Tools and access `C:\NileLink\Backups`. The repo is a Node/TypeScript project, so Node/TS is the natural fit (no strong reason for another stack).

## Existing Project Files Involved

- `package.json` — root deps (Next.js app). Agent must have its **own** `package.json`; do not add agent deps here.
- `tsconfig.json` — must **exclude** `backup-agent` so `next build`/`opennextjs-cloudflare build` ignore it.
- `eslint.config.mjs` — add `backup-agent/**` to ignores if lint should skip it.
- `.gitignore` — add `backup-agent/node_modules`, `backup-agent/dist`, `backup-agent/.env*`, `backup-agent/config/*.local.*`.
- `.github/workflows/deploy.yml` — unchanged; confirm agent folder does not break `npm ci`/build.

## New Files To Create

```
backup-agent/
  package.json
  tsconfig.json
  .env.example                    (names only, no values)
  src/index.ts                    entrypoint: load config → start server → start scheduler
  src/config.ts                   zod-validated env config, fails fast
  src/logger.ts                   structured JSON logger (file + console), secret redaction
  src/server.ts                   HTTP server bootstrap (bind 127.0.0.1)
  src/routes/health.ts            GET /v1/health
  src/lib/redact.ts               strips mongodb URIs/passwords/HMAC secrets from strings
  src/lib/shutdown.ts             SIGTERM/SIGINT handling, waits for running job
  scripts/install-service.ts      node-windows (or NSSM wrapper) install
  scripts/uninstall-service.ts
  README.md                       operator instructions
```

## Files To Modify

- `tsconfig.json` (add `"backup-agent"` to `exclude`)
- `.gitignore`
- `eslint.config.mjs` (ignore agent dir) — only if lint scans it.

## Implementation Tasks

- [ ] Create `backup-agent/package.json` (own deps: `zod`, a small HTTP framework such as `fastify` or built-in `http`, `pino` or custom logger, `node-windows`; dev: `typescript`, `tsx`, `vitest`). Pin versions; use `npm ci`.
- [ ] Create `tsconfig.json` (strict, `moduleResolution: node16`, outDir `dist`).
- [ ] Implement `config.ts`: required vars `BACKUP_ROOT` (default `C:\NileLink\Backups`), `AGENT_PORT` (default 8787), `AGENT_BIND` (default `127.0.0.1`), `AGENT_HMAC_KEYS` (key-id → secret JSON or file path), `MONGO_URI_FILE` or `MONGODB_URI` (agent-only), `MONGO_TOOLS_DIR`, `TZ=Africa/Cairo`, `RETENTION_AUTOMATIC_COUNT` (30), `LOG_LEVEL`. Fail fast with a clear message listing missing names (never values).
- [ ] Implement `logger.ts`: JSON lines to `BACKUP_ROOT\logs\agent-YYYY-MM-DD.log`, daily rotation, size cap; all strings pass through `redact()`.
- [ ] Implement `redact.ts`: mask `mongodb(+srv)://user:pass@…`, `password=…`, `Bearer …`, HMAC signatures.
- [ ] Implement `server.ts`: bind to loopback only by default; request-id middleware; 1 MB JSON body cap on non-upload routes; no stack traces in responses.
- [ ] Implement `GET /v1/health` (unauthenticated minimal: `{status:"ok"}` only on loopback; authenticated detail variant in Task 07: version, free disk, tools versions, last backup status).
- [ ] Implement graceful shutdown: stop accepting jobs, wait for running job up to N seconds, otherwise mark job `interrupted` (see Task 16).
- [ ] Write `install-service.ts`: service name `NileLinkBackupAgent`, run as a **dedicated low-privilege account**, recovery: restart on failure (1 min, 1 min, 5 min), automatic start type.
- [ ] Add `npm run build`, `npm run start`, `npm run service:install`, `npm run service:uninstall`.
- [ ] Update root `tsconfig.json` exclude and `.gitignore`; run `npm run build` at repo root to confirm the Next build is unaffected.

## Security Requirements

- Listen on loopback only; exposure only through the tunnel/reverse proxy decided in Task 02/D1.
- Service account: not Administrator, no interactive logon, write access only to `C:\NileLink\Backups` and its own install dir.
- Config secrets from machine env vars or a file with restricted ACL — never from a repo file.
- Logs must never contain URIs, passwords, HMAC secrets.

## Error Handling

- Invalid/missing config → exit code 1 with redacted message; Windows service recovery will not loop-spam (backoff).
- Unhandled exception → log and exit so service recovery restarts; running job state recovered on boot (Task 16).

## Testing

- Unit: config validation (missing/invalid vars), redaction patterns.
- Smoke: start agent locally, `GET /v1/health` returns ok; stop with SIGTERM exits cleanly.

## Acceptance Criteria

- [ ] `backup-agent` builds independently; root Next build unaffected.
- [ ] Health endpoint works; logs written to `logs/`; secrets redacted.
- [ ] Service installs/uninstalls and restarts automatically after a forced kill (tested on a dev Windows machine).

## Depends On

- 02

## Blocks

- 04, 05, 06, 07, 13, 17

# Backup Agent API (v1)

All endpoints are under `/v1`, return JSON `{ ok, data? , error?: { code, message } }` and an `X-Request-Id` header.
The agent binds to loopback; expose it only through Cloudflare Tunnel.

## Authentication (every request except unauthenticated `GET /v1/health`)

| Header | Meaning |
|---|---|
| `X-NL-Key-Id` | Key id from `AGENT_HMAC_KEYS` (two ids may be active for rotation) |
| `X-NL-Timestamp` | Unix ms; rejected if more than 60 s from agent time |
| `X-NL-Nonce` | 16-64 chars `[A-Za-z0-9_-]`, single use for 5 minutes |
| `X-NL-Actor` | Optional base64url JSON `{"userId","email"}`. Informational only, never used for authorization |
| `X-NL-Signature` | hex `HMAC-SHA256(secret, canonical)` |

```
canonical = METHOD + "\n" + path+query + "\n" + timestamp + "\n" + nonce + "\n" + sha256hex(body)
```

`path+query` is exactly the request target (`/v1/backups?limit=10`). An empty body hashes the empty string.
Any failure returns `401 {"error":{"code":"UNAUTHORIZED","message":"Unauthorized"}}`; the reason is logged only on the agent.
Limits: 30 requests/min and one write per 10 s per key (`429`). Body max 64 KB (`413`).

`AGENT_HMAC_KEYS` example: `{"k1":"<64 hex chars>","k2":"<64 hex chars>"}` (secrets must be at least 32 characters).

## Endpoints

| Method and path | Purpose | Success |
|---|---|---|
| `GET /v1/health` | Unsigned: `{status}`. Signed: tools, disk, stats, scheduler | 200 |
| `GET /v1/backups?type=&limit=&cursor=` | List (metadata only) | 200 `{items,nextCursor}` |
| `GET /v1/backups/:id` | One backup | 200 |
| `POST /v1/backups` | Manual backup, body `{reason?}` | 202 `{jobId}` |
| `POST /v1/backups/:id/verify` | Re-verify size, SHA-256, gzip | 202 `{jobId}` |
| `POST /v1/backups/:id/protect` | Body `{protected:boolean}` | 200 |
| `DELETE /v1/backups/:id` | Delete (refuses protected, in-use, last valid) | 200 |
| `POST /v1/backups/:id/restore` | Task 11 | 501 |
| `POST /v1/backups/import` | Task 12 | 501 |
| `GET /v1/jobs/:jobId` | `{state, step, resultBackupId?, error?}` | 200 |
| `GET /v1/scheduler` | Next run (UTC + Cairo local), last result | 200 |
| `GET /v1/retention/preview` | Dry-run retention plan | 200 |

Job states: `queued`, `running`, `succeeded`, `failed`, `interrupted` (agent restarted mid-job).

## Errors

`BUSY` 409, `NOT_FOUND` 404, `INVALID_ID` / `INVALID_REQUEST` 400, `PROTECTED` 409, `CORRUPT_BACKUP` 409,
`NOT_IMPLEMENTED` 501, `PAYLOAD_TOO_LARGE` 413, `UNAUTHORIZED` 401, `RATE_LIMITED` 429, anything else 500 (request id only).

## Scheduler and retention

- Daily automatic backup at `BACKUP_SCHEDULE_TIME` in `BACKUP_TIMEZONE` (default `21:00` Africa/Cairo, DST-aware).
- One run per Cairo date; catch-up after restart within `MISSED_RUN_GRACE_MINUTES`; busy retry every 10 min; one retry 30 min after a failure.
- After each successful automatic backup, retention keeps the newest `RETENTION_AUTOMATIC_COUNT` (30) automatic backups,
  never deletes manual/import/protected/quarantined or the last valid backup, and deletes nothing if any entry is inconsistent.
- Safety backups are exempt from the "protected" rule: the newest `RETENTION_SAFETY_MIN_COUNT` (3) are kept, older ones expire after `RETENTION_SAFETY_MAX_AGE_DAYS`.

## Signing example (Node)

```js
const crypto = require("crypto")
const body = JSON.stringify({ reason: "before release" })
const ts = String(Date.now()), nonce = crypto.randomBytes(16).toString("hex")
const canonical = ["POST", "/v1/backups", ts, nonce, crypto.createHash("sha256").update(body).digest("hex")].join("\n")
const signature = crypto.createHmac("sha256", SECRET).update(canonical).digest("hex")
```

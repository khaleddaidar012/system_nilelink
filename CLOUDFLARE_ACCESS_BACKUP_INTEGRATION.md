# Cloudflare Access & Nile Link Backup System Integration Guide

## 1. Overview & Architecture

The **Nile Link Backup Management System** connects the Next.js application (running on Cloudflare Workers via OpenNext) to the dedicated Windows Backup Agent running as a Windows Service on the internal server.

Communication traverses two defense-in-depth security boundaries:
1. **Perimeter Authentication (Cloudflare Access & Tunnel):**
   - Cloudflare Tunnel exposes the local loopback service (`127.0.0.1:8787`) to `https://backup-agent.nilelinklogistics.com`.
   - Protected by a Cloudflare Access **Service Auth** application policy.
   - Next.js server-side HTTP client automatically attaches Cloudflare Access Service Token headers:
     - `CF-Access-Client-Id: <CLIENT_ID>`
     - `CF-Access-Client-Secret: <CLIENT_SECRET>`
2. **Cryptographic Authorization (HMAC-SHA256):**
   - Every request is cryptographically signed using Web Crypto HMAC-SHA256:
     - `X-NL-Key-Id: <KEY_ID>`
     - `X-NL-Timestamp: <EPOCH_MS>`
     - `X-NL-Nonce: <RANDOM_HEX>`
     - `X-NL-Signature: <HMAC_HEX>`
   - Replay protection with a 60-second clock skew tolerance and in-memory nonce store.
   - Optional actor attribution header: `X-NL-Actor: <BASE64URL_JSON>`.

---

## 2. Environment Variables & Secrets Reference

| Variable Name | Environment | Required | Description |
| :--- | :--- | :--- | :--- |
| `BACKUP_AGENT_URL` | Worker Secret / `.env.local` | **Yes** | Base endpoint URL (e.g. `https://backup-agent.nilelinklogistics.com` for production, `http://127.0.0.1:8787` for local dev). |
| `BACKUP_AGENT_KEY_ID` | Worker Secret / `.env.local` | **Yes** | HMAC key identifier configured on the agent (e.g. `k1`). |
| `BACKUP_AGENT_HMAC_SECRET` | Worker Secret / `.env.local` | **Yes** | 256-bit (64-character hex or min 32 chars) secret matching `AGENT_HMAC_KEYS` on the Windows agent. |
| `CF_ACCESS_CLIENT_ID` | Worker Secret / `.env.local` | **Yes** (Remote) | Cloudflare Access Service Token Client ID (`<id>.access`). Optional for local loopback. |
| `CF_ACCESS_CLIENT_SECRET` | Worker Secret / `.env.local` | **Yes** (Remote) | Cloudflare Access Service Token Client Secret. Optional for local loopback. |

> [!IMPORTANT]
> - **Never hardcode secrets in source code.**
> - **Never prefix with `NEXT_PUBLIC_`**: These credentials must only exist in server-side runtimes.
> - **Never commit secrets to Git repository**: All `.env*` files (except `.env.example`) and `.dev.vars` are ignored by git.
> - **Never log secrets**: Error messages and logs must redact or omit credentials.

---

## 3. Configuring Secrets

### A. Production & Cloudflare Workers (OpenNext)

Set the credentials as Cloudflare Worker encrypted secrets using Wrangler:

```bash
# 1. Base URL for the backup agent tunnel
npx wrangler secret put BACKUP_AGENT_URL
# Input: https://backup-agent.nilelinklogistics.com

# 2. HMAC Key Identifier
npx wrangler secret put BACKUP_AGENT_KEY_ID
# Input: k1

# 3. HMAC Shared Secret (min 32 characters)
npx wrangler secret put BACKUP_AGENT_HMAC_SECRET
# Input: <YOUR_SECURE_HMAC_SECRET>

# 4. Cloudflare Access Service Token Client ID
npx wrangler secret put CF_ACCESS_CLIENT_ID
# Input: <YOUR_SERVICE_TOKEN_CLIENT_ID>.access

# 5. Cloudflare Access Service Token Client Secret
npx wrangler secret put CF_ACCESS_CLIENT_SECRET
# Input: <YOUR_SERVICE_TOKEN_CLIENT_SECRET>
```

Alternatively, configure them in the **Cloudflare Dashboard**:
1. Navigate to **Workers & Pages** > `system-nilelink`.
2. Go to **Settings** > **Variables and Secrets**.
3. Under **Worker Secrets**, add each secret with encryption enabled.

### B. Local Development

#### Mode 1: Local Dev against Dev Mock Agent (or local agent)
If testing locally with `http://127.0.0.1:8787`:
Add to `.env.local`:
```env
BACKUP_AGENT_URL=http://127.0.0.1:8787
BACKUP_AGENT_KEY_ID=k1
BACKUP_AGENT_HMAC_SECRET=<YOUR_DEV_HMAC_SECRET>
```
*Cloudflare Access credentials are not required for loopback addresses (`127.0.0.1`, `localhost`).*

#### Mode 2: Local Dev against Remote Production Agent (via Cloudflare Tunnel)
If testing the local Next.js instance against the live Windows server through Cloudflare Tunnel:
Add to `.env.local`:
```env
BACKUP_AGENT_URL=https://backup-agent.nilelinklogistics.com
BACKUP_AGENT_KEY_ID=k1
BACKUP_AGENT_HMAC_SECRET=<YOUR_PRODUCTION_HMAC_SECRET>
CF_ACCESS_CLIENT_ID=<YOUR_SERVICE_TOKEN_CLIENT_ID>.access
CF_ACCESS_CLIENT_SECRET=<YOUR_SERVICE_TOKEN_CLIENT_SECRET>
```

---

## 4. Safe Verification Procedures (Zero-Risk)

To verify the integration without creating, modifying, or deleting any backups or databases:

### Step 1: Safe Health Verification via Next.js Web UI
1. Start the Next.js development server:
   ```bash
   npm run dev
   ```
2. Navigate to: `http://localhost:3000/en/admin/system/backups`
3. Sign in as an administrator (e.g. `manager@nilelink.com` or `super_admin`).
4. Inspect the **Backup Status Card**:
   - **Online:** Indicates successful Cloudflare Access authentication AND successful HMAC verification. Displays mongodump version, total backups, free disk space, and next scheduled run.
   - **Cloudflare Access Denied:** Indicates Cloudflare Access rejected the request (e.g. Service Token invalid, missing, or policy denied).
   - **HMAC Signature Rejected:** Indicates Cloudflare Access passed, but the agent rejected the HMAC signature (e.g. secret mismatch).
   - **Agent Offline:** Indicates network unreachable / tunnel offline.

### Step 2: Safe Health Verification via API Route
Send an authenticated GET request from the Next.js admin session:
```http
GET /api/admin/system/backups/health
```
**Expected Response:**
```json
{
  "online": true,
  "agent": {
    "version": "0.1.0",
    "uptimeSeconds": 1234,
    "freeDiskBytes": 104857600000,
    "diskLow": false
  },
  "tools": {
    "mongodump": "100.10.0"
  },
  "scheduler": {
    "enabled": true,
    "scheduleTime": "21:00",
    "timezone": "Africa/Cairo"
  }
}
```

### Step 3: Safe List Verification
```http
GET /api/admin/system/backups?limit=5
```
Returns metadata of existing backups without performing any write or delete operations.

---

## 5. Cloudflare Access Service Token Rotation Procedure

> [!WARNING]
> Because test credentials were exposed in preliminary testing sessions, they are considered compromised and **must be rotated** prior to public production launch.

To rotate the Service Token **with zero application code changes and zero downtime**:

1. **Generate New Service Token in Cloudflare Zero Trust:**
   - Log into [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
   - Go to **Access** > **Service Auth** (or **Service Tokens**).
   - Click **Create Service Token**.
   - Name: `nilelink-backup-agent-nextjs` (or similar).
   - Set validity (e.g. 1 year).
   - **Copy the Client ID and Client Secret immediately** (the secret is shown only once).

2. **Ensure Access Application Policy Includes the New Token:**
   - Go to **Access** > **Applications** > Select the application protecting `backup-agent.nilelinklogistics.com`.
   - Review **Policies** > Select the Service Auth policy.
   - Under **Include**, ensure the Service Token rule matches the new token (or add the new token to the policy before removing the old one).

3. **Update Secrets in Cloudflare Workers:**
   ```bash
   npx wrangler secret put CF_ACCESS_CLIENT_ID
   # Paste new Client ID

   npx wrangler secret put CF_ACCESS_CLIENT_SECRET
   # Paste new Client Secret
   ```

4. **Verify Live Connection:**
   - Call the safe health endpoint (`/api/admin/system/backups/health`).
   - Confirm status is `"online": true`.

5. **Revoke the Old Service Token:**
   - Return to Cloudflare Zero Trust > **Service Tokens**.
   - Delete / Revoke the previous compromised token.

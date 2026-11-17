// Diagnostic probe: signs a GET request like lib/backup/agent-client.ts and prints status + body.
// Usage: node --env-file=../.env.local backup-agent/scripts/probe-agent.mjs /v1/mail/status
// Secrets are read from the environment and never printed.
import crypto from "node:crypto"

const pathAndQuery = process.argv[2] || "/v1/health"
const url = (process.env.BACKUP_AGENT_URL || "").replace(/\/+$/, "")
const keyId = process.env.BACKUP_AGENT_KEY_ID
const secret = process.env.BACKUP_AGENT_HMAC_SECRET
if (!url || !keyId || !secret) {
  console.error("Missing BACKUP_AGENT_URL / BACKUP_AGENT_KEY_ID / BACKUP_AGENT_HMAC_SECRET")
  process.exit(2)
}
const timestamp = String(Date.now())
const nonce = crypto.randomBytes(16).toString("hex")
const bodyHash = crypto.createHash("sha256").update("").digest("hex")
const canonical = ["GET", pathAndQuery, timestamp, nonce, bodyHash].join("\n")
const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex")
const headers = { "x-nl-key-id": keyId, "x-nl-timestamp": timestamp, "x-nl-nonce": nonce, "x-nl-signature": signature }
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
  headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID
  headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET
}
const res = await fetch(url + pathAndQuery, { headers, redirect: "manual" })
const text = await res.text()
console.log(res.status, text.slice(0, 1500))

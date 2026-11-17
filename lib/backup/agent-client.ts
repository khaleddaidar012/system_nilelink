import { validateBackupAgentConfig } from "./config"
import { randomNonce, signRequest } from "./signing"

export class BackupApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface AgentActor {
  userId: string
  email: string
}

export interface MailEnableStatus {
  status: "online" | "degraded" | "offline" | "unknown"
  services: {
    smtp: { name: string; status: "running" | "stopped" | "not_installed" | "unknown"; details?: string }
    imap: { name: string; status: "running" | "stopped" | "not_installed" | "unknown"; details?: string }
  }
  connectivity: {
    smtp: { port: number; reachable: boolean; responseTimeMs?: number; banner?: string; error?: string }
    imap: { port: number; reachable: boolean; responseTimeMs?: number; banner?: string; error?: string }
  }
  queues: {
    inbound: number | null
    outbound: number | null
    badMail: number | null
    accessible: boolean
    error?: string
  }
  lastCheck: string
  lastSuccessfulCheck: string | null
  lastOutage: {
    startedAt: string
    endedAt: string | null
    reason: string
  } | null
  diagnostics: string[]
}

const SAFE_MESSAGES: Record<string, string> = {
  BUSY: "A backup operation is already running",
  NOT_FOUND: "Backup not found",
  PROTECTED: "This backup is protected and cannot be deleted",
  INVALID_ID: "Invalid backup id",
  INVALID_REQUEST: "Invalid request",
  CORRUPT_BACKUP: "This backup failed integrity checks",
  NOT_IMPLEMENTED: "This operation is not available yet",
  CF_ACCESS_DENIED: "Cloudflare Access rejected the request",
  AGENT_AUTH_FAILED: "The backup agent rejected the request signature",
}

function base64Url(text: string): string {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

let callAgentOverride: ((method: "GET" | "POST" | "DELETE", pathAndQuery: string, options?: { body?: unknown; actor?: AgentActor; timeoutMs?: number }) => Promise<any>) | null = null

export function setCallAgentOverrideForTesting(override: typeof callAgentOverride) {
  callAgentOverride = override
}

/**
 * Calls the Windows Backup Agent with an HMAC-signed request and Cloudflare Access service token.
 * Returns the agent `data` payload; throws BackupApiError with safe messages only (never agent URL, paths or internals).
 */
export async function callAgent<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  pathAndQuery: string,
  options: { body?: unknown; actor?: AgentActor; timeoutMs?: number } = {}
): Promise<T> {
  if (callAgentOverride) {
    return (await callAgentOverride(method, pathAndQuery, options)) as T
  }
  const validation = validateBackupAgentConfig()
  if (!validation.ok) {
    throw new BackupApiError(503, validation.code, validation.message)
  }
  const config = validation.config

  const body = options.body === undefined ? "" : JSON.stringify(options.body)
  const timestamp = String(Date.now())
  const nonce = randomNonce()
  const signature = await signRequest(config.secret, { method, pathAndQuery, timestamp, nonce, body })

  const headers: Record<string, string> = {
    "x-nl-key-id": config.keyId,
    "x-nl-timestamp": timestamp,
    "x-nl-nonce": nonce,
    "x-nl-signature": signature,
  }

  // Cloudflare Access Service Token authentication headers
  if (config.cfClientId && config.cfClientSecret) {
    headers["CF-Access-Client-Id"] = config.cfClientId
    headers["CF-Access-Client-Secret"] = config.cfClientSecret
  }

  if (body) headers["content-type"] = "application/json"
  if (options.actor) headers["x-nl-actor"] = base64Url(JSON.stringify(options.actor))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
  let res: Response
  try {
    res = await fetch(`${config.url}${pathAndQuery}`, { method, headers, body: body || undefined, signal: controller.signal, cache: "no-store" })
  } catch {
    throw new BackupApiError(503, "AGENT_UNAVAILABLE", "The backup agent is unreachable")
  } finally {
    clearTimeout(timer)
  }

  // Detect Cloudflare Access redirecting to interactive login (misconfigured Service Auth policy)
  if (res.redirected && (res.url.includes("cloudflareaccess.com") || res.url.includes("/cdn-cgi/access"))) {
    throw new BackupApiError(502, "CF_ACCESS_DENIED", "Cloudflare Access redirected to login: Service Auth policy required")
  }

  let json: { ok?: boolean; data?: T; error?: { code?: string; message?: string } } | null = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON response */
  }

  if (res.ok && json?.ok) return json.data as T

  const code = json?.error?.code ?? "AGENT_ERROR"
  if (res.status === 401) throw new BackupApiError(502, "AGENT_AUTH_FAILED", "The backup agent rejected the request signature")
  if (res.status === 403) throw new BackupApiError(502, "CF_ACCESS_DENIED", "Cloudflare Access rejected the request (Service Token unauthorized or expired)")
  if (res.status === 429) throw new BackupApiError(429, "RATE_LIMITED", "Too many backup requests, try again shortly")
  // A 404 on a monitoring route means the deployed agent build predates that route (not a missing backup).
  if (res.status === 404 && pathAndQuery.startsWith("/v1/mail/")) {
    throw new BackupApiError(
      502,
      "MAIL_ENDPOINT_MISSING",
      "The deployed agent does not expose /v1/mail/status. Rebuild and restart the Windows agent with the latest code."
    )
  }
  if (res.status >= 400 && res.status < 500 && SAFE_MESSAGES[code]) {
    throw new BackupApiError(res.status, code, SAFE_MESSAGES[code])
  }
  const requestId = res.headers.get("x-request-id") ?? "unknown"
  throw new BackupApiError(502, "AGENT_ERROR", `The backup agent returned an error (request ${requestId})`)
}


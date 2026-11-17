import { createHmac, randomUUID } from "node:crypto"
export interface MailboxEnvironment { MAILBOX_AGENT_URL?: string; MAILBOX_AGENT_HMAC_KEY?: string; MAILBOX_ENCRYPTION_KEY?: string }
export function mailboxConfigured(env: MailboxEnvironment): boolean {
  try {
    const url = new URL(env.MAILBOX_AGENT_URL || "")
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && !/^(localhost|127\.|0\.|\[|10\.|192\.168\.)/i.test(url.hostname) && /^[a-f0-9]{64}$/.test(env.MAILBOX_AGENT_HMAC_KEY || "") && /^[a-f0-9]{64}$/.test(env.MAILBOX_ENCRYPTION_KEY || "")
  } catch { return false }
}
export class MailboxApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status = 502) { super(code); this.code = code; this.status = status }
}
export async function callMailboxAgent<T = Record<string, unknown>>(env: MailboxEnvironment, payload: Record<string, unknown>): Promise<T> {
  if (!mailboxConfigured(env)) throw new MailboxApiError("MAILBOX_NOT_CONFIGURED", 503)
  const body = JSON.stringify(payload), time = String(Date.now()), nonce = randomUUID()
  const signature = createHmac("sha256", Buffer.from(env.MAILBOX_AGENT_HMAC_KEY!, "hex")).update(`POST\n/mailbox\n${time}\n${nonce}\n${body}`).digest("hex")
  let response: Response
  try { response = await fetch(new URL("/mailbox", env.MAILBOX_AGENT_URL), { method: "POST", headers: { "content-type": "application/json", "x-nl-mail-time": time, "x-nl-mail-nonce": nonce, "x-nl-mail-signature": signature }, body, redirect: "manual", signal: AbortSignal.timeout(30000), cache: "no-store" }) }
  catch { throw new MailboxApiError(payload.action === "send" ? "SEND_OUTCOME_UNKNOWN" : "MAIL_SERVER_UNAVAILABLE", 502) }
  // Edge runtimes support manual redirects. Reject 3xx without forwarding credentials.
  if (response.status >= 300 && response.status < 400) throw new MailboxApiError("MAIL_SERVER_UNAVAILABLE", 502)
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true) {
    const allowed = ["MAILBOX_CHANGED", "MESSAGE_NOT_FOUND", "MESSAGE_TOO_LARGE", "ATTACHMENT_NOT_FOUND", "ATTACHMENTS_TOO_LARGE", "REQUEST_CONFLICT", "SEND_OUTCOME_UNKNOWN", "SEND_REJECTED", "DOMAIN_NOT_ALLOWED", "INVALID_REQUEST", "RATE_LIMIT", "BUSY"]
    throw new MailboxApiError(allowed.includes(result?.error?.code) ? result.error.code : "MAIL_SERVER_UNAVAILABLE", [400, 403, 404, 409, 413, 429].includes(response.status) ? response.status : 502)
  }
  return result.data
}

import crypto from "node:crypto"

export const MAX_SKEW_MS = 60_000

export interface SignatureInput {
  method: string
  /** Path plus query string exactly as sent (e.g. /v1/backups?limit=10). */
  pathAndQuery: string
  timestamp: string
  nonce: string
  body: Buffer | string
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex")
}

/** Canonical string: METHOD \n path+query \n timestamp \n nonce \n sha256(body) */
export function canonicalString(input: SignatureInput): string {
  return [input.method.toUpperCase(), input.pathAndQuery, input.timestamp, input.nonce, sha256Hex(input.body)].join("\n")
}

export function sign(secret: string, input: SignatureInput): string {
  return crypto.createHmac("sha256", secret).update(canonicalString(input)).digest("hex")
}

/** Parses AGENT_HMAC_KEYS ({"k1":"<secret>", ...}). Secrets shorter than 32 chars are rejected (>= 256-bit expected). */
export function parseKeys(raw: string | undefined): Map<string, string> {
  const keys = new Map<string, string>()
  if (!raw) return keys
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return keys
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return keys
  for (const [id, secret] of Object.entries(parsed as Record<string, unknown>)) {
    if (/^[A-Za-z0-9_-]{1,32}$/.test(id) && typeof secret === "string" && secret.length >= 32) keys.set(id, secret)
  }
  return keys
}

export type AuthFailure = "missing_headers" | "unknown_key" | "stale_timestamp" | "bad_signature" | "replayed_nonce"

export interface AuthResult {
  ok: boolean
  keyId?: string
  reason?: AuthFailure
}

export interface NonceCheck {
  seen(keyId: string, nonce: string, nowMs: number): boolean
}

/** Verifies signature, timestamp window and nonce replay. Callers must respond with a generic 401 on !ok. */
export function verifyRequest(
  headers: Record<string, string | string[] | undefined>,
  req: { method: string; pathAndQuery: string; body: Buffer },
  keys: Map<string, string>,
  nonces: NonceCheck,
  nowMs: number = Date.now()
): AuthResult {
  const h = (name: string) => {
    const v = headers[name]
    return typeof v === "string" ? v : undefined
  }
  const keyId = h("x-nl-key-id")
  const timestamp = h("x-nl-timestamp")
  const nonce = h("x-nl-nonce")
  const signature = h("x-nl-signature")
  if (!keyId || !timestamp || !nonce || !signature) return { ok: false, reason: "missing_headers" }
  if (!/^[a-f0-9]{64}$/i.test(signature) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^\d{10,16}$/.test(timestamp)) {
    return { ok: false, reason: "bad_signature" }
  }

  const secret = keys.get(keyId)
  if (!secret) return { ok: false, reason: "unknown_key" }

  if (Math.abs(nowMs - Number(timestamp)) > MAX_SKEW_MS) return { ok: false, reason: "stale_timestamp" }

  const expected = Buffer.from(sign(secret, { ...req, timestamp, nonce }), "hex")
  const given = Buffer.from(signature, "hex")
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" }
  }

  // Only a valid signature may consume a nonce (prevents nonce-store flooding by unauthenticated callers)
  if (nonces.seen(keyId, nonce, nowMs)) return { ok: false, reason: "replayed_nonce" }
  return { ok: true, keyId }
}

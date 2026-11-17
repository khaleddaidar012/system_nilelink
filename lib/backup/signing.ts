/** Web Crypto based signing (works on Cloudflare Workers and Node). Must match backup-agent/src/auth/hmac.ts. */
const encoder = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)))
}

export async function canonicalString(input: {
  method: string
  pathAndQuery: string
  timestamp: string
  nonce: string
  body: string
}): Promise<string> {
  return [input.method.toUpperCase(), input.pathAndQuery, input.timestamp, input.nonce, await sha256Hex(input.body)].join("\n")
}

export async function signRequest(
  secret: string,
  input: { method: string; pathAndQuery: string; timestamp: string; nonce: string; body: string }
): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(await canonicalString(input)))
  return toHex(sig)
}

export function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Masks anything that looks like a secret before it reaches a log, an API response or metadata.
 * Applied to every log line (see logger.ts).
 */
const PATTERNS: Array<[RegExp, string]> = [
  // Full MongoDB connection strings (credentials + hosts)
  [/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "mongodb://[REDACTED]"],
  // Bearer tokens
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]"],
  // key=value / "key":"value" for sensitive keys
  [
    /(password|passwd|pwd|secret|token|api[_-]?key|signature|hmac)(["']?\s*[:=]\s*)(["']?)[^\s,"'&}]+/gi,
    "$1$2$3[REDACTED]",
  ],
]

export function redact(input: string): string {
  let out = input
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

export function redactError(err: unknown): string {
  if (err instanceof Error) return redact(err.message)
  return redact(String(err))
}

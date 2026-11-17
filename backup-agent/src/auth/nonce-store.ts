/** In-memory replay cache. A restart clears it, but the 60 s timestamp window bounds the exposure. */
export class NonceStore {
  private readonly seenAt = new Map<string, number>()

  constructor(private readonly ttlMs: number = 5 * 60_000) {}

  /** Returns true if the nonce was already used (replay); otherwise records it and returns false. */
  seen(keyId: string, nonce: string, nowMs: number = Date.now()): boolean {
    this.purge(nowMs)
    const k = `${keyId}:${nonce}`
    if (this.seenAt.has(k)) return true
    this.seenAt.set(k, nowMs + this.ttlMs)
    return false
  }

  get size(): number {
    return this.seenAt.size
  }

  private purge(nowMs: number): void {
    for (const [k, expires] of this.seenAt) {
      if (expires <= nowMs) this.seenAt.delete(k)
      else break // insertion order == expiry order
    }
  }
}

/** Token bucket per key id: general requests per minute plus a minimum gap between write operations. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number; lastWriteAt: number }>()

  constructor(
    private readonly perMinute = 30,
    private readonly writeGapMs = 10_000
  ) {}

  allow(keyId: string, isWrite: boolean, nowMs: number = Date.now()): boolean {
    const b = this.buckets.get(keyId) ?? { tokens: this.perMinute, updatedAt: nowMs, lastWriteAt: 0 }
    b.tokens = Math.min(this.perMinute, b.tokens + ((nowMs - b.updatedAt) / 60_000) * this.perMinute)
    b.updatedAt = nowMs
    this.buckets.set(keyId, b)
    if (b.tokens < 1) return false
    if (isWrite && nowMs - b.lastWriteAt < this.writeGapMs) return false
    b.tokens -= 1
    if (isWrite) b.lastWriteAt = nowMs
    return true
  }
}

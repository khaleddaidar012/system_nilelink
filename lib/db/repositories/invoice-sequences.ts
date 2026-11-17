import type { D1Binding } from "../d1"

function validateKey(key: string): void {
  if (!key || key.length > 100) throw new Error("Invalid invoice sequence key")
}

/** One SQL statement increments and returns the counter, including first use. */
export class D1InvoiceSequencesRepository {
  private readonly db: D1Binding

  constructor(db: D1Binding) { this.db = db }

  async next(key: string, now = new Date()): Promise<number> {
    validateKey(key)
    const updatedAt = now.toISOString()
    const data = JSON.stringify({ _id: key, seq: 1, updatedAt })
    const row = await this.db.prepare(`
      INSERT INTO invoice_sequences (id, data) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = json_set(invoice_sequences.data, '$.seq', invoice_sequences.seq + 1, '$.updatedAt', ?),
        revision = invoice_sequences.revision + 1
      RETURNING seq
    `).bind(key, data, updatedAt).first<{ seq: number }>()
    if (!row || !Number.isSafeInteger(row.seq) || row.seq < 1) {
      throw new Error("D1 failed to allocate a valid invoice sequence")
    }
    return row.seq
  }

  async peek(key: string): Promise<number> {
    validateKey(key)
    const row = await this.db.prepare(
      "SELECT seq FROM invoice_sequences WHERE id = ?"
    ).bind(key).first<{ seq: number }>()
    const current = row?.seq ?? 0
    if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Invoice sequence is exhausted or invalid")
    }
    return current + 1
  }
}

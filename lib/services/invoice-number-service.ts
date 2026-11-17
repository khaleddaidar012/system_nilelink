import { connectDB } from "@/lib/mongodb"
import InvoiceSequence from "@/lib/models/InvoiceSequence"

export interface GenerateInvoiceNumberOptions {
  year?: number
  prefix?: string
}

/**
 * Atomically generates the next sequential invoice number for a given calendar year.
 * Concurrency-safe across concurrent server requests.
 * Format: INV-YYYY-NNNNNN (e.g. INV-2026-000001)
 */
export async function generateNextInvoiceNumber(
  options: GenerateInvoiceNumberOptions = {}
): Promise<string> {
  await connectDB()

  const currentYear = options.year || new Date().getFullYear()
  const prefix = options.prefix || "INV"
  const sequenceKey = `${prefix}_${currentYear}`

  const sequenceDoc = await InvoiceSequence.findOneAndUpdate(
    { _id: sequenceKey },
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean()

  const sequenceNumber = sequenceDoc?.seq || 1
  const paddedSeq = String(sequenceNumber).padStart(6, "0")

  return `${prefix}-${currentYear}-${paddedSeq}`
}

/**
 * Peeks the anticipated next invoice number without incrementing the counter.
 * Used for UI form display and preview purposes.
 */
export async function peekNextInvoiceNumber(
  options: GenerateInvoiceNumberOptions = {}
): Promise<string> {
  await connectDB()

  const currentYear = options.year || new Date().getFullYear()
  const prefix = options.prefix || "INV"
  const sequenceKey = `${prefix}_${currentYear}`

  const sequenceDoc = await InvoiceSequence.findById(sequenceKey).lean()
  const nextSeq = (sequenceDoc?.seq || 0) + 1
  const paddedSeq = String(nextSeq).padStart(6, "0")

  return `${prefix}-${currentYear}-${paddedSeq}`
}

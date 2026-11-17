import { z } from "zod"
import { WorkflowStore, WorkflowError, body, now, reject, requireStaff, response, timestamped } from "./runtime"
import type { Actor, Data, WorkflowInput } from "./runtime"

const paymentSchema = z.object({
  customerId: z.string().regex(/^[a-f\d]{24}$/i),
  invoiceId: z.string().regex(/^[a-f\d]{24}$/i),
  amount: z.number().finite().positive(),
  currency: z.enum(["EGP", "USD", "EUR"]).default("EGP"),
  paymentMethod: z.enum(["bank_transfer", "credit_card", "cash", "cheque", "other"]).default("bank_transfer"),
  paymentDate: z.string().datetime({ offset: true }).optional(),
  referenceNumber: z.string().max(200).optional(),
  notes: z.string().max(2000).default(""),
})

/** Reject ambiguous source amounts rather than silently rounding migrated financial data. */
export function minorUnits(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return reject(409, "Financial amount requires review")
  const units = Math.round(value * 100)
  if (!Number.isSafeInteger(units) || Math.abs(value - units / 100) > 1e-9) return reject(409, "Financial amount requires review")
  return units
}

export async function handleFinance(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  requireStaff(actor.user)
  if (args.action !== "payment-record") return reject(404, "Unknown finance operation")
  const key = args.request.headers.get("Idempotency-Key")
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return reject(400, "A unique Idempotency-Key header (16-128 characters) is required")
  const parsed = paymentSchema.safeParse(await body(args))
  if (!parsed.success) return response({ error: "Validation failed", details: parsed.error.format() }, 400)
  const input = parsed.data
  const amount = minorUnits(input.amount)
  if (!amount) return reject(400, "Payment must be at least one minor currency unit")
  // Explicitly omitted dates remain omitted in the fingerprint so retries are stable.
  const fingerprint = JSON.stringify(input)
  const previous = async (): Promise<Data | null> => {
    const rows = await store.list("payments", "json_extract(data, '$.d1IdempotencyKey') = ?", [key])
    if (!rows.length) return null
    const payment = rows[0].data
    if (payment.d1RequestFingerprint !== fingerprint) return reject(409, "Idempotency key already belongs to a different payment")
    return payment
  }
  const result = (payment: Data, replayed: boolean) => response({ success: true, message: "Payment successfully recorded", payment,
    invoice: payment.d1InvoiceResult, replayed }, replayed ? 200 : 201)
  const existing = await previous()
  if (existing) return result(existing, true)
  const customer = await store.read("customers", input.customerId)
  const invoice = await store.read("invoices", input.invoiceId)
  if (!customer || !invoice) return reject(404, "Customer or invoice not found")
  const source = invoice.data
  if (source.customerId !== customer.id) return reject(409, "Invoice does not belong to this customer")
  if (source.currency !== input.currency) return reject(409, "Payment currency must match invoice currency")
  if (!["confirmed", "sent", "overdue", "partially_paid"].includes(source.status)) return reject(409, "Invoice is not payable")
  const total = minorUnits(source.totalAmount), paid = minorUnits(source.paidAmount), remaining = minorUnits(source.remainingAmount)
  if (paid > total || total - paid !== remaining) return reject(409, "Invoice balance requires reconciliation before payment")
  const priorPayments = await store.list("payments", "invoiceId = ?", [invoice.id])
  let recordedPaid = 0
  for (const prior of priorPayments) {
    if (prior.data.customerId !== customer.id || prior.data.currency !== source.currency || prior.data.status === "cancelled") {
      return reject(409, "Payment history requires reconciliation before payment")
    }
    recordedPaid += minorUnits(prior.data.amount)
    if (!Number.isSafeInteger(recordedPaid)) return reject(409, "Payment history exceeds supported precision")
  }
  if (recordedPaid !== paid) return reject(409, "Recorded payments do not match invoice paid balance")
  if (amount > remaining) return reject(409, "Payment exceeds invoice balance")
  const nextPaid = paid + amount
  if (!Number.isSafeInteger(nextPaid)) return reject(409, "Payment amount exceeds supported precision")
  const patch = { paidAmount: nextPaid / 100, remainingAmount: (total - nextPaid) / 100,
    status: nextPaid === total ? "paid" : "partially_paid" }
  const payment = timestamped({ ...input, paymentDate: input.paymentDate ? new Date(input.paymentDate).toISOString() : now(),
    referenceNumber: input.referenceNumber || null, d1IdempotencyKey: key, d1RequestFingerprint: fingerprint,
    d1InvoiceResult: { id: invoice.id, ...patch } })
  const log = timestamped({ invoiceId: invoice.id, customerId: customer.id, actorId: actor.user._id,
    actorName: `${actor.user.firstName} ${actor.user.lastName}`.trim(), actorRole: actor.user.role,
    action: "payment_recorded", paymentId: payment._id, previousState: { paidAmount: source.paidAmount, remainingAmount: source.remainingAmount, status: source.status },
    newState: patch, notes: `Payment of ${input.amount} ${input.currency} recorded via ${input.paymentMethod}.` })
  try {
    await store.commit({ checks: [actor.snapshot, customer], updates: [{ before: invoice, patch }],
      inserts: [{ table: "payments", data: payment }, { table: "invoice_activity_logs", data: log }] })
  } catch (error) {
    // Also resolve a response lost after a successful commit; never blindly retry the write.
    const committed = await previous()
    if (committed) return result(committed, true)
    if (error instanceof WorkflowError) throw error
    throw error
  }
  return result(payment, false)
}

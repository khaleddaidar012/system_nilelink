import { createHash, randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { getInvoiceEmailTemplate } from "../email/templates/invoice-email"
import { getStatementEmailTemplate } from "../email/templates/statement-email"
import { clientInvoice, financialRenderers } from "./financial-views"
import { WorkflowError, now, reject, timestamped } from "./runtime"
import type { Change, Data, Snapshot, WorkflowStore } from "./runtime"

export interface DeliveryMessage { to: string; subject: string; html: string; attachment: { filename: string; contentBase64: string; contentType: "application/pdf" } }
export interface DeliveryTransport {
  mode: "preview" | "live"
  /** The stable key must be passed to any external provider that supports idempotency. */
  deliver(message: DeliveryMessage, key: string): Promise<{ receiptId: string }>
}
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

/** Local sink only. This default transport has no network or mail provider. */
export const previewDeliveryTransport: DeliveryTransport = {
  mode: "preview",
  async deliver(message, key) {
    if (process.env.NODE_ENV === "production") throw new Error("Local email previews are unavailable in production")
    const directory = path.resolve(process.cwd(), ".private", "d1-migration", "delivery-previews")
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const filename = hash(key) + ".json"
    await writeFile(path.join(directory, filename), JSON.stringify({ mode: "preview", createdAt: now(), ...message }), { flag: "wx", mode: 0o600 })
    return { receiptId: filename }
  },
}

/** Single job, one owner. Processing/uncertain jobs are never reclaimed or blindly resent. */
export async function processDeliveryJob(store: WorkflowStore, id: string, transport: DeliveryTransport = previewDeliveryTransport) {
  if (!["preview", "live"].includes(transport.mode) || typeof transport.deliver !== "function") return reject(400, "Invalid delivery transport")
  const job = await store.read("_nilelink_delivery_jobs", id)
  if (!job) return reject(404, "Delivery job not found")
  if (["sent", "previewed"].includes(job.data.state)) return { deliveryId: id, state: job.data.state, replayed: true }
  if (job.data.state !== "pending") return reject(409, "Delivery requires operator reconciliation; it will not be resent automatically")
  if (transport.mode === "live" && job.data.previewOnly !== false) return reject(409, "Preview jobs cannot be sent through a live transport")
  const user = await store.read("users", job.data.requestedBy)
  const allowed = user?.data.status === "active" && (user.data.role === "super_admin" || (user.data.role === "staff" && user.data.staffPermissions?.sendFinancialDocuments))
  if (!allowed) return reject(403, "Delivery permission has been revoked")
  if (!z.string().email().max(254).safeParse(job.data.recipient).success) return reject(409, "Recipient requires review")
  let invoice: Snapshot | null = null, customer: Snapshot | null = null
  if (job.data.kind === "invoice-send") {
    invoice = await store.read("invoices", job.data.invoiceId)
    if (!invoice || !["confirmed", "sent", "overdue", "partially_paid", "paid"].includes(invoice.data.status) || invoice.data.archivedAt) return reject(409, "Invoice is no longer available for delivery")
    if (invoice.data.documentType === "tax_invoice" && user!.data.role !== "super_admin" && !user!.data.staffPermissions?.issueTaxInvoice) return reject(403, "Tax invoice permission has been revoked")
    customer = invoice.data.customerId ? await store.read("customers", invoice.data.customerId) : null
    if (JSON.stringify(clientInvoice(invoice.data, customer?.data)) !== JSON.stringify(job.data.payload?.invoice)) return reject(409, "Invoice changed since queueing. Review it and create a new delivery request")
  } else if (job.data.kind !== "statement-send" || job.data.payload?.statement?.customer?.id !== job.data.customerId) return reject(409, "Delivery snapshot requires review")
  const attemptId = randomUUID()
  await store.commit({ checks: [user!, ...(customer ? [customer] : [])], updates: [{ before: job, patch: { state: "processing", attemptId, startedAt: now(), transportMode: transport.mode } }, ...(invoice ? [{ before: invoice, patch: {} }] : [])] })
  let sent = false
  try {
    let bytes: Uint8Array, subject: string, html: string, filename: string
    if (job.data.kind === "invoice-send") {
      const data = job.data.payload.invoice as Data
      bytes = await financialRenderers.invoice(data)
      subject = `Invoice ${String(data.invoiceNumber).replace(/[\r\n]/g, " ")} — Nile Link Logistics`
      filename = String(data.invoiceNumber).replace(/[^A-Za-z0-9_.-]/g, "_") + ".pdf"
      html = getInvoiceEmailTemplate({ customerName: escape(data.customerSnapshot?.companyName), invoiceNumber: escape(data.invoiceNumber),
        currency: escape(data.currency), totalAmount: data.totalAmount, dueDate: data.dueDate, token: encodeURIComponent(String(data.token)) })
    } else {
      const statement = job.data.payload.statement
      bytes = await financialRenderers.statement(statement)
      subject = "Customer account statement — Nile Link Logistics"; filename = "statement.pdf"
      html = getStatementEmailTemplate({ customerName: escape(statement.customer.companyName), periodStr: escape(`${statement.period.from || "Start"} — ${statement.period.to || "Present"}`),
        ...statement.summary, currency: escape(statement.summary.currency), customMessage: escape(job.data.payload.customMessage) })
    }
    if (bytes.length > 5_000_000 || Buffer.from(bytes).subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid or oversized rendered PDF")
    const message: DeliveryMessage = { to: job.data.recipient, subject, html, attachment: { filename, contentBase64: Buffer.from(bytes).toString("base64"), contentType: "application/pdf" } }
    // A render error is safe to review/requeue; an exception after this point may
    // mean a provider accepted the message even when its response was lost.
    sent = true
    const receipt = await transport.deliver(message, `nilelink-delivery-${id}`)
    if (!receipt.receiptId || typeof receipt.receiptId !== "string" || receipt.receiptId.length > 500) throw new Error("Missing transport receipt")
    const current = await store.read("_nilelink_delivery_jobs", id)
    if (!current || current.data.state !== "processing" || current.data.attemptId !== attemptId) return reject(409, "Delivery ownership requires reconciliation")
    const state = transport.mode === "preview" ? "previewed" : "sent", completedAt = now()
    const updates: Change[] = [{ before: current, patch: { state, completedAt, receiptId: receipt.receiptId, attachmentSha256: createHash("sha256").update(bytes).digest("hex") } }]
    const inserts: { table: "invoice_activity_logs"; data: Data }[] = []
    if (invoice) {
      const latest = await store.read("invoices", invoice.id)
      if (!latest) throw new Error("Invoice missing after transport receipt")
      if (transport.mode === "live") {
        if (latest.data.status === "cancelled" || latest.data.archivedAt) throw new Error("Invoice cancelled during delivery")
        updates.push({ before: latest, patch: { ...(latest.data.status === "confirmed" ? { status: "sent" } : {}), sentAt: completedAt, sentBy: user!.id, recipientEmail: job.data.recipient } })
      }
      inserts.push({ table: "invoice_activity_logs", data: timestamped({ invoiceId: invoice.id, customerId: job.data.customerId,
        actorId: user!.id, actorName: `${user!.data.firstName} ${user!.data.lastName}`.trim(), actorRole: user!.data.role,
        action: transport.mode === "live" ? "send" : "delivery_previewed", notes: transport.mode === "live" ? "Transport accepted financial document; recipient delivery is not yet confirmed." : "Local preview generated; no email was sent.", newState: { deliveryId: id, state, receiptId: receipt.receiptId } }) })
    }
    await store.commit({ updates, inserts })
    return { deliveryId: id, state, replayed: false }
  } catch (error) {
    // A successful receipt transaction may itself have lost its response.
    try {
      const current = await store.read("_nilelink_delivery_jobs", id)
      if (current && ["sent", "previewed"].includes(current.data.state)) return { deliveryId: id, state: current.data.state, replayed: true }
      if (current?.data.state === "processing" && current.data.attemptId === attemptId) {
        await store.commit({ updates: [{ before: current, patch: { state: sent ? "uncertain" : "render_failed", failedAt: now(), failureCode: sent ? "TRANSPORT_OR_RECEIPT_UNCERTAIN" : "PDF_RENDER_FAILED" } }] })
      }
    } catch { /* Leave processing intact when the database is unavailable. Never guess or resend. */ }
    if (error instanceof WorkflowError) throw error
    return reject(503, sent ? "Delivery outcome requires reconciliation; automatic resend disabled" : "PDF rendering failed; review before retrying")
  }
}

import { createHash } from "node:crypto"
import { z } from "zod"
import { body, reject, response, timestamped, WorkflowError } from "./runtime"
import type { Actor, Snapshot, WorkflowInput, WorkflowStore } from "./runtime"
import { invoicePermission } from "./invoices"
import { clientInvoice, customerStatement } from "./financial-views"
import { liveEmailConfigured } from "../email/readiness"

/** Preview outbox only: enqueue never claims that an email has been sent. */
export async function queueFinancialDelivery(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  invoicePermission(actor, "sendFinancialDocuments")
  if (!args.id) reject(400, "Document ID required")
  const key = args.request.headers.get("Idempotency-Key")
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) reject(400, "A unique Idempotency-Key header (16-128 characters) is required")
  const input = args.request.body === null && !args.input ? {} : await body(args)
  const parsed = z.object({ fromDate: z.string().optional(), toDate: z.string().optional(), currency: z.enum(["EGP", "USD", "EUR"]).default("EGP"), recipientEmail: z.string().email().max(254).optional(), customMessage: z.string().max(2000).default("") }).strict().safeParse(input)
  if (!parsed.success) reject(400, "Invalid financial delivery request")
  if (args.action === "invoice-send" && Object.keys(input).length) reject(400, "Invoice delivery does not accept recipient or content overrides")
  const requestHash = createHash("sha256").update(JSON.stringify([args.action, args.id, parsed.data])).digest("hex")
  const live = liveEmailConfigured()
  async function deliver(id: string) {
    const { processDeliveryJob } = await import("./delivery-worker")
    const { liveEmailTransport } = await import("./live-email-transport")
    const result = await processDeliveryJob(store, id, liveEmailTransport)
    return response({ success: true, queued: false, deliveryStatus: result.state, deliveryId: id, replayed: result.replayed, message: "Email accepted by the provider; inbox delivery is not yet confirmed" })
  }
  const replay = async () => {
    const existing = (await store.list("_nilelink_delivery_jobs", "requestKey = ?", [key]))[0]
    if (!existing) return null
    if (existing.data.requestHash !== requestHash) reject(409, "Idempotency key belongs to another delivery request")
    if (live && existing.data.previewOnly === false) return deliver(existing.id)
    return response({ success: true, queued: true, deliveryStatus: existing.data.state, deliveryId: existing.id, replayed: true, message: "Delivery request already queued; no email has been sent by the preview" }, 202)
  }
  const existing = await replay()
  if (existing) return existing
  const checks: Snapshot[] = [actor.snapshot]
  let payload: Record<string, any>, recipient: string, customerId: string | null, invoice: Snapshot | null = null
  if (args.action === "invoice-send") {
    // Recipient and snapshot come from the confirmed document, not arbitrary request fields.
    invoice = await store.read("invoices", args.id)
    if (!invoice) reject(404, "Invoice not found")
    if (invoice.data.documentType === "tax_invoice") invoicePermission(actor, "issueTaxInvoice")
    if (!["confirmed", "sent", "overdue", "partially_paid", "paid"].includes(invoice.data.status) || invoice.data.archivedAt) reject(409, "Only issued invoices may be queued")
    const customer = invoice.data.customerId ? await store.read("customers", invoice.data.customerId) : null
    const view = clientInvoice(invoice.data, customer?.data)
    recipient = view.customerSnapshot?.contactEmail
    customerId = invoice.data.customerId || null
    payload = { invoice: view }
    checks.push(invoice, ...(customer ? [customer] : []))
  } else if (args.action === "statement-send") {
    const url = new URL(args.request.url)
    url.search = ""
    for (const [key, value] of Object.entries({ fromDate: parsed.data.fromDate, toDate: parsed.data.toDate, currency: parsed.data.currency })) if (value) url.searchParams.set(key, value)
    const statement = await customerStatement(store, actor, { ...args, request: new Request(url) })
    recipient = parsed.data.recipientEmail || statement.customer.contactEmail
    customerId = statement.customer.id
    payload = { statement, customMessage: parsed.data.customMessage }
  } else return reject(404, "Unknown delivery operation")
  if (!z.string().email().max(254).safeParse(recipient).success) reject(400, "A valid recipient email is required")
  const job = timestamped({ requestKey: key, requestHash, kind: args.action, state: "pending", recipient,
    customerId, invoiceId: invoice?.id || null, requestedBy: actor.user._id, payload, previewOnly: !live })
  if (new TextEncoder().encode(JSON.stringify(job)).length > 1_000_000) reject(413, "Delivery snapshot exceeds preview limit")
  try {
    await store.commit({ checks, inserts: [{ table: "_nilelink_delivery_jobs", data: job }, ...(invoice ? [{ table: "invoice_activity_logs" as const,
      data: timestamped({ invoiceId: invoice.id, customerId, actorId: actor.user._id, actorName: `${actor.user.firstName} ${actor.user.lastName}`.trim(), actorRole: actor.user.role,
        action: "send_queued", notes: live ? "Email delivery requested; provider receipt pending." : "Preview delivery queued; email not sent.", newState: { deliveryId: job._id, deliveryStatus: "pending" } }) }] : [])] })
  } catch (error) {
    const committed = await replay()
    if (committed) return committed
    if (error instanceof WorkflowError) throw error
    throw error
  }
  if (live) return deliver(job._id)
  return response({ success: true, queued: true, deliveryStatus: "pending", deliveryId: job._id, message: "Delivery queued locally; no email has been sent" }, 202)
}

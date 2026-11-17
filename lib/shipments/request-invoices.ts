import {isAccountingInvoice} from "./invoice-kind"
import { z } from "zod"
import { getD1 } from "../db/d1"
import { WorkflowStore, actorFor, requireCustomer, reject, response as workflowResponse } from "../workflows/runtime"
import type { Actor, Snapshot } from "../workflows/runtime"
import { accountingPermissions, shipmentInvoiceError } from "../workflows/shipment-invoices"
import { invoiceRequestMatches, requestInvoiceReplacement } from "./request-invoice-link"
import { newInvoiceReference } from "../references/numbering"
export { invoiceRequestMatches } from "./request-invoice-link"
function response(data: unknown) {
  const result = workflowResponse(data)
  result.headers.set("Cache-Control", "private, no-store")
  return result
}

export async function linkRequestInvoice(store: WorkflowStore, actor: Actor, invoice: Snapshot, request: Snapshot) {
  invoiceRequestMatches(invoice, request)
  if (!accountingPermissions(actor).canEdit) reject(403, "Invoice editing permission required")
  const replacement = await requestInvoiceReplacement(store, actor, invoice, request, true)
  if (!replacement.updates.length) return
  const customer = await store.read("customers", request.data.customerId)
  if (!customer) reject(404, "Customer not found")
  const numbering = invoice.data.numberingRequestId === request.id && invoice.data.referenceNumber ? {} : await newInvoiceReference(store.db, customer, request)
  await store.commit({ checks: [actor.snapshot, customer], updates: [...replacement.updates, { before: invoice, patch: { relatedRequestId: request.id, ...numbering } }], inserts: replacement.inserts })
}
function summary(row: Snapshot, customer = false) {
  const value = row.data
  const latest = value.shipmentAccounting?.publications?.at(-1)
  return { id: row.id, invoiceNumber: value.invoiceNumber, referenceNumber: value.referenceNumber, shipmentId: value.shipmentRecordId ?? null, accounting:isAccountingInvoice(value),
    booking: value.shipmentSnapshot?.trackingNumber ?? "", currency: value.currency,
    status: value.status === "draft" ? "draft" : "published", linked: Boolean(value.relatedRequestId),
    ...(customer ? { total: latest?.total ?? String(value.totalAmount), token: value.token } : {}) }
}
export async function requestInvoicesRoute(http: Request, requestId: string, portal = false) {
  try {
    const store = new WorkflowStore(await getD1()), actor = await actorFor(store, http)
    const parent = await store.read("customer_requests", requestId)
    if (portal) {
      const customer = requireCustomer(actor)
      if (!parent || parent.data.customerId !== customer.id) reject(404, "Request not found")
      const rows = await store.list("invoices", "customerId=? AND relatedRequestId=? AND status IN ('confirmed','sent','paid','partially_paid','overdue') AND json_extract(data,'$.archivedAt') IS NULL", [customer.id, parent.id])
      return response({ invoices: rows.filter(row => !isAccountingInvoice(row.data) || row.data.shipmentAccounting?.publications?.length).map(row => summary(row, true)) })
    }
    const permissions = accountingPermissions(actor)
    if (!parent) reject(404, "Request not found")
    if (http.method === "POST") {
      if (http.headers.get("origin") !== new URL(http.url).origin) reject(403, "Invalid origin")
      if (!permissions.canEdit) reject(403, "Invoice editing permission required")
      const input = z.object({ invoiceId: z.string().regex(/^[a-f\d]{24}$/i) }).strict().safeParse(await http.json())
      if (!input.success) reject(400, "Invalid invoice link")
      const invoice = await store.read("invoices", input.data.invoiceId)
      if (!invoice) reject(404, "Invoice not found")
      store.activity = { user: actor.user, action: "invoice-request-link" }
      await linkRequestInvoice(store, actor, invoice, parent)
      return response({ success: true })
    }
    const rows = await store.list("invoices", "customerId=? AND (relatedRequestId IS NULL OR relatedRequestId=?) AND status!='cancelled' AND json_extract(data,'$.archivedAt') IS NULL", [parent.data.customerId, parent.id])
    const q = (new URL(http.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100)
    return response({ permissions, invoices: rows.filter(row => row.data.relatedRequestId === parent.id).map(row => summary(row)),
      candidates: rows.filter(row => !row.data.relatedRequestId && `${row.data.invoiceNumber} ${row.data.referenceNumber ?? ""} ${(row.data.previousReferenceNumbers || []).join(" ")} ${row.data.shipmentSnapshot?.trackingNumber ?? ""}`.toLowerCase().includes(q)).slice(0, 100).map(row => summary(row)) })
  } catch (error) { const result = shipmentInvoiceError(error); result.headers.set("Cache-Control", "private, no-store"); return result }
}

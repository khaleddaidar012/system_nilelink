import {isAccountingInvoice} from "./invoice-kind"
import { now, reject, timestamped, notification } from "../workflows/runtime"
import type { Actor, Change, Snapshot, WorkflowStore } from "../workflows/runtime"

export function invoiceRequestMatches(invoice: Snapshot, request: Snapshot) {
  if (invoice.data.customerId !== request.data.customerId) reject(409, "Invoice and request must belong to the same customer")
  if (invoice.data.relatedRequestId && invoice.data.relatedRequestId !== request.id) reject(409, "Invoice is already linked to another request")
  if (invoice.data.archivedAt || invoice.data.status === "cancelled") reject(409, "Archived or cancelled invoices cannot be linked")
}
/** Caller combines these changes with creation/update in one guarded transaction. */
export async function requestInvoiceReplacement(store: WorkflowStore, actor: Actor, invoice: Snapshot, request: Snapshot, canReplace: boolean, creating = false) {
  invoiceRequestMatches(invoice, request)
  const previous = (await store.list("invoices", "relatedRequestId=?", [request.id])).filter(row => row.id !== invoice.id)
  if (previous.length && !canReplace) reject(403, "Invoice editing permission required to replace the request invoice")
  const changed = creating || previous.length > 0 || invoice.data.relatedRequestId !== request.id
  if (!changed) return { updates: [] as Change[], inserts: [] as { table: "invoice_activity_logs" | "notifications"; data: ReturnType<typeof timestamped> }[], previous }
  const updates: Change[] = [
    ...previous.map(before => ({ before, patch: { relatedRequestId: null } })),
    { before: request, patch: { invoiceLinkUpdatedAt: now() } },
  ]
  const event = (row: Snapshot, action: string, next: string | null) => ({ table: "invoice_activity_logs" as const, data: timestamped({
    invoiceId: row.id, customerId: row.data.customerId, actorId: actor.user._id,
    actorName: `${actor.user.firstName} ${actor.user.lastName}`.trim(), actorRole: actor.user.role, action,
    previousState: { relatedRequestId: row.id === invoice.id ? null : request.id },
    newState: { relatedRequestId: next, replacementInvoiceId: invoice.id }, notes: "Request invoice assignment changed; financial documents retained",
  }) })
  const published=["confirmed","sent","paid","partially_paid","overdue"].includes(invoice.data.status)&&(!isAccountingInvoice(invoice.data)||invoice.data.shipmentAccounting?.publications?.length)
  const assignmentNotice=published?[{table:"notifications" as const,data:notification({recipientCustomerId:request.data.customerId,type:"invoice_assigned",
    title:"تم تعيين فاتورة لطلبك / Invoice assigned to your request",message:`${invoice.data.invoiceNumber} — ${request.data.trackingNumber}. الفاتورة منشورة ويمكن معاينتها / The published invoice is ready to view.`,
    relatedInvoiceId:invoice.id,relatedRequestId:request.id,actionUrl:`/portal/requests/${request.id}`})}]:[]
  return { updates, inserts: [...previous.map(row => event(row, "invoice_request_unlinked", null)), event(invoice, "invoice_request_linked", request.id),...assignmentNotice], previous }
}

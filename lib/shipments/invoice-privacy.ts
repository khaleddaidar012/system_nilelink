import { accountingDraft, customerSaleItems, totals } from "./accounting"
import type { Accounting } from "./accounting"
import type { Data } from "../workflows/runtime"
import type { WorkflowStore } from "../workflows/runtime"

export async function shipmentAudit(store: WorkflowStore, invoiceId: string) {
  // Audit states remain in storage. The activity view reads bounded metadata,
  // so long-running drafts cannot load every historical financial document.
  const rows = await store.db.prepare(`SELECT id AS _id, createdAt,
    json_extract(data,'$.action') AS action, json_extract(data,'$.actorName') AS actorName,
    json_extract(data,'$.actorId') AS actorId FROM invoice_activity_logs
    WHERE invoiceId=? ORDER BY createdAt DESC,id DESC LIMIT 100`).bind(invoiceId).all()
  return rows.results
}

/** Legacy staff endpoints must never serialize the accounting object or audit states. */
export function withoutAccounting(value: Data): Data {
  const invoice = { ...value }
  delete invoice.shipmentAccounting
  return invoice
}
export function accountingStaffView(value: Data, revision: number, sensitive: boolean) {
  const accounting = value.shipmentAccounting as Accounting
  const resolvedDraft = accountingDraft(accounting)
  const summary = totals(resolvedDraft, value.currency)
  const { internalSellingPrice, ...draft } = resolvedDraft
  return { id: value._id, invoiceNumber: value.invoiceNumber, referenceNumber: value.referenceNumber as string | undefined, customerCode: value.customerCode as string | undefined, shipmentId: value.shipmentRecordId,
    booking: value.shipmentSnapshot.trackingNumber, customerId: value.customerId, relatedRequestId: value.relatedRequestId ?? null,
    customerName: value.customerSnapshot.companyName, currency: value.currency, revision,
    status: accounting.publications.length ? "published" : "draft", pendingRevision: accounting.pendingRevision, approvalRequest: accounting.approvalRequest ?? null,
    draft: { ...draft, customerItems: customerSaleItems(resolvedDraft, value.currency), sellingPrice: internalSellingPrice, ...(sensitive ? { internalSellingPrice } : {}) },
    totals: { perStage: summary.perStage, perStageSales: summary.perStageSales, totalCosts: summary.totalCosts, customerTotal: summary.customerTotal,
      ...(sensitive ? { expectedProfit: summary.expectedProfit } : {}) },
    publications: accounting.publications }
}

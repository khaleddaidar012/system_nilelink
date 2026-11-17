import {isAccountingInvoice} from "../shipments/invoice-kind"
import { WorkflowStore, actorFor, fields, reject, requireCustomer, requireStaff, response } from "./runtime"
import type { Actor, Data, WorkflowInput } from "./runtime"
import { minorUnits } from "./finance"
import { invoiceDate, invoicePermission } from "./invoices"
import { getDocumentTitle } from "../services/document-type-helper"
import type { ICustomerStatement, ICustomerLedgerEntry } from "../../types/customer-statement"

export const financialRenderers = {
  async invoice(data: Data, type?: "invoice" | "statement" | "tax_invoice"): Promise<Uint8Array> {
    const { generateInvoicePdfBuffer } = await import("../services/invoice-pdf-generator")
    return generateInvoicePdfBuffer(data as any, type)
  },
  async statement(data: ICustomerStatement): Promise<Uint8Array> {
    const { generateCustomerStatementPdfBuffer } = await import("../services/statement-pdf-generator")
    return generateCustomerStatementPdfBuffer(data)
  },
}

/** Keep staff annotations, actors, idempotency metadata and unknown source fields private. */
export function clientInvoice(value: Data, customer?: Data): Data {
  const invoice = { ...fields(value, ["_id", "invoiceNumber", "referenceNumber", "customerCode", "token", "customerId", "relatedRequestId", "relatedQuoteId", "shipmentRecordId", "documentType", "currency", "status", "issueDate", "dueDate", "subtotal", "taxRate", "tax", "discount", "additionalCharges", "totalAmount", "paidAmount", "remainingAmount", "notes", "createdAt", "updatedAt", "confirmedAt"]), _id: value._id }
  const result: Data = invoice
  if (isAccountingInvoice(value)) {
    const publications = value.shipmentAccounting?.publications
    const latest = Array.isArray(publications) ? publications[publications.length - 1] : null
    result.publishedVersion = latest?.version ?? null
    result.publishedAt = latest?.publishedAt ?? null
    if (Array.isArray(latest?.groups)) result.groups = latest.groups.map((group: Data) => ({
      stage: group.stage, total: group.total,
      items: group.items.map((item: Data) => ({...fields(item, ["description", "amount"]),...(Array.isArray(item.tiers)?{tiers:item.tiers.map((tier:Data)=>fields(tier,["label","quantity","unitPrice","currency","subtotal"]))}:{})})),
    }))
  }
  result.items = (Array.isArray(value.items) ? value.items : []).map(item => fields(item, ["description", "quantity", "unitPrice", "total"]))
  for (const [key, names] of [
    ["customerSnapshot", ["companyName", "commercialRegisterNumber", "taxCardNumber", "address", "city", "country", "contactPhone", "contactEmail"]],
    ["shipmentSnapshot", ["requestId", "trackingNumber", "serviceType", "origin", "destination", "complianceType", "complianceNumber"]],
    ["issuerSnapshot", ["legalName", "address", "taxId", "phone", "email", "bankName", "bankAccountName", "bankIban", "bankSwift"]],
  ] as [string, string[]][]) {
    const source = value[key] || (key === "customerSnapshot" && customer?._id === value.customerId ? customer : null)
    result[key] = source ? fields(source, names) : null
  }
  return result
}
function visibleInvoice(data: Data): boolean { return data.status !== "draft" && !data.archivedAt }
function financialJson(value: unknown): Response {
  const result = response(value)
  result.headers.set("Cache-Control", "no-store")
  return result
}
function pdf(bytes: Uint8Array, name: string, inline = false): Response {
  const filename = name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 140)
  return new Response(bytes as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}.pdf"`, "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "X-Content-Type-Options": "nosniff" } })
}
export async function publicInvoice(store: WorkflowStore, args: WorkflowInput): Promise<Response> {
  if (!args.id || args.id.length > 256) reject(404, "Invoice not found")
  // One batch provides a consistent invoice/payment view during a concurrent payment.
  const results = await store.db.batch<{ data: string }>([
    store.db.prepare("SELECT data FROM invoices WHERE token = ? AND status != 'draft' AND json_extract(data, '$.archivedAt') IS NULL").bind(args.id),
    store.db.prepare("SELECT p.data FROM payments p JOIN invoices i ON i.id = p.invoiceId WHERE i.token = ? AND i.status != 'draft' AND json_extract(i.data, '$.archivedAt') IS NULL ORDER BY p.paymentDate DESC, p.id DESC").bind(args.id),
    store.db.prepare("SELECT c.data FROM customers c JOIN invoices i ON i.customerId = c.id WHERE i.token = ? AND i.status != 'draft' AND json_extract(i.data, '$.archivedAt') IS NULL").bind(args.id),
  ])
  if (!results[0].results.length) reject(404, "Invoice not found")
  const invoice: Data = JSON.parse(results[0].results[0].data)
  if (isAccountingInvoice(invoice)) {
    const actor = await actorFor(store, args.request)
    if (requireCustomer(actor).id !== invoice.customerId) reject(404, "Invoice not found")
  }
  const payments = results[1].results.map(row => JSON.parse(row.data) as Data)
  if (payments.some(payment => payment.customerId !== invoice.customerId || payment.currency !== invoice.currency)) reject(409, "Invoice payment relationships require reconciliation")
  const customer = results[2].results[0] ? JSON.parse(results[2].results[0].data) as Data : undefined
  return financialJson({ success: true, invoice: clientInvoice(invoice, customer), payments: payments.map(payment => fields(payment, ["_id", "amount", "currency", "paymentMethod", "paymentDate", "referenceNumber"])) })
}

export async function handleFinancialViews(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  if (args.action === "portal-financials") {
    const customer = requireCustomer(actor)
    const invoices = (await store.list("invoices", "customerId = ? AND status != 'draft' AND json_extract(data, '$.archivedAt') IS NULL", [customer.id], "createdAt DESC, id DESC")).map(row => row.data)
    const byCurrency: Record<string, { totalInvoicesValue: number | null; totalPaid: number | null; totalRemaining: number | null; reconciliationRequired?: boolean }> = Object.create(null)
    for (const invoice of invoices) if (invoice.status !== "cancelled") {
      const group = byCurrency[invoice.currency || "UNKNOWN"] ??= { totalInvoicesValue: 0, totalPaid: 0, totalRemaining: 0 }
      if (group.reconciliationRequired) continue
      try {
        group.totalInvoicesValue! += minorUnits(invoice.totalAmount); group.totalPaid! += minorUnits(invoice.paidAmount); group.totalRemaining! += minorUnits(invoice.remainingAmount)
        if (![group.totalInvoicesValue, group.totalPaid, group.totalRemaining].every(Number.isSafeInteger)) reject(409, "Summary requires reconciliation")
      } catch { Object.assign(group, { totalInvoicesValue: null, totalPaid: null, totalRemaining: null, reconciliationRequired: true }) }
    }
    for (const group of Object.values(byCurrency)) for (const key of ["totalInvoicesValue", "totalPaid", "totalRemaining"] as const) if (group[key] !== null) group[key]! /= 100
    const groups = Object.values(byCurrency)
    return financialJson({ success: true, invoices: invoices.map(invoice => clientInvoice(invoice, customer.data)), metrics: { ...(groups.length === 1 ? groups[0] : { totalInvoicesValue: groups.length ? null : 0, totalPaid: groups.length ? null : 0, totalRemaining: groups.length ? null : 0 }), byCurrency } })
  }
  if (args.action === "statement-view" || args.action === "statement-pdf") {
    invoicePermission(actor, args.action === "statement-pdf" ? "exportCustomerStatements" : "viewCustomerStatements")
    const statement = await customerStatement(store, actor, args)
    return args.action === "statement-pdf" ? pdf(await financialRenderers.statement(statement), `Statement_${statement.customer.id}`, true) : financialJson({ success: true, statement })
  }
  if (args.action === "admin-invoice-pdf" || args.action === "portal-invoice-pdf") {
    const admin = args.action === "admin-invoice-pdf"
    if (admin) requireStaff(actor.user); else requireCustomer(actor)
    const row = args.id ? await store.read("invoices", args.id) : null
    if (!row || (!admin && (!visibleInvoice(row.data) || row.data.customerId !== actor.customer!.id))) reject(404, "Invoice not found")
    const invoice = row.data
    const override = admin ? new URL(args.request.url).searchParams.get("type") : null
    const type = override || invoice.documentType || "statement"
    if (!["statement", "invoice", "tax_invoice"].includes(type)) reject(400, "Invalid document type")
    if (admin && (type === "tax_invoice" || invoice.documentType === "tax_invoice")) invoicePermission(actor, "issueTaxInvoice")
    // Rendering consumes immutable snapshots; never substitutes another customer's live details.
    const customer = !invoice.customerSnapshot && invoice.customerId ? await store.read("customers", invoice.customerId) : null
    return pdf(await financialRenderers.invoice(clientInvoice(invoice, customer?.data), type as any), `${type}_${invoice.invoiceNumber}`, admin)
  }
  return reject(404, "Unknown financial view")
}

function add(a: number, b: number): number {
  const result = a + b
  if (!Number.isSafeInteger(result)) reject(409, "Statement exceeds supported precision")
  return result
}
/** Independent currency ledger, using integer minor units and one consistent SQL batch. */
export async function customerStatement(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<ICustomerStatement> {
  if (!args.id) return reject(400, "Customer ID required")
  const url = new URL(args.request.url), currency = url.searchParams.get("currency") || "EGP", filter = url.searchParams.get("type") || "all"
  if (!["EGP", "USD", "EUR"].includes(currency) || !["all", "shipments", "invoices", "payments"].includes(filter)) reject(400, "Invalid statement filters")
  const from = url.searchParams.get("fromDate"), to = url.searchParams.get("toDate")
  // Date-only filters use UTC days consistently across local and Workers runtimes.
  const boundary = (value: string, end: boolean) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return reject(400, "Statement dates must use YYYY-MM-DD")
    return invoiceDate(value + (end ? "T23:59:59.999Z" : "T00:00:00.000Z"))
  }
  const start = from ? boundary(from, false) : null, end = to ? boundary(to, true) : null
  if (start && end && start > end) reject(400, "From date must not follow to date")
  const result = await store.db.batch<any>([
    store.db.prepare("SELECT data FROM customers WHERE id = ?").bind(args.id),
    store.db.prepare("SELECT i.data, r.trackingNumber AS requestTracking, r.customerId AS requestCustomer FROM invoices i LEFT JOIN customer_requests r ON r.id = i.relatedRequestId WHERE i.customerId = ? ORDER BY i.id").bind(args.id),
    store.db.prepare(`SELECT p.data, i.customerId AS linkedCustomerId, i.currency AS linkedCurrency, i.invoiceNumber AS linkedInvoiceNumber,
      i.status AS linkedStatus FROM payments p LEFT JOIN invoices i ON i.id = p.invoiceId
      WHERE p.customerId = ? OR i.customerId = ? ORDER BY p.id`).bind(args.id, args.id),
  ])
  if (!result[0].results.length) reject(404, "Customer not found")
  const customer = JSON.parse(result[0].results[0].data) as Data
  const raw: (ICustomerLedgerEntry & { units: number })[] = []
  for (const row of result[1].results) {
    const invoice = JSON.parse(row.data) as Data
    if (["draft", "cancelled"].includes(invoice.status) || invoice.archivedAt || invoice.currency !== currency) continue
    if (row.requestCustomer && row.requestCustomer !== args.id) reject(409, "Shipment relationship requires reconciliation")
    const date = invoiceDate(invoice.issueDate || invoice.createdAt), tracking = invoice.shipmentSnapshot?.trackingNumber || row.requestTracking || undefined
    const label = getDocumentTitle(invoice.documentType, true)
    raw.push({ id: invoice._id, date, type: "invoice", description: tracking ? `${label} - شحنة (${tracking})` : `${label} - خدمات لوجستية`,
      reference: invoice.invoiceNumber, relatedShipmentTracking: tracking, relatedInvoiceNumber: invoice.invoiceNumber, debit: invoice.totalAmount, credit: 0,
      balance: 0, currency, status: invoice.status, notes: invoice.notes, units: minorUnits(invoice.totalAmount) })
  }
  for (const row of result[2].results) {
    const payment = JSON.parse(row.data) as Data
    if (payment.currency !== currency && row.linkedCurrency !== currency) continue
    if (payment.customerId !== args.id || row.linkedCustomerId !== args.id || payment.currency !== row.linkedCurrency || ["draft", "cancelled"].includes(row.linkedStatus) || payment.status === "cancelled") reject(409, "Payment history requires reconciliation before generating a statement")
    const units = minorUnits(payment.amount)
    raw.push({ id: payment._id, date: invoiceDate(payment.paymentDate || payment.createdAt), type: "payment", description: `سداد دفعة للفاتورة ${row.linkedInvoiceNumber}`,
      reference: payment.referenceNumber || row.linkedInvoiceNumber || "PAY-REF", relatedInvoiceNumber: row.linkedInvoiceNumber,
      debit: 0, credit: payment.amount, balance: 0, currency, notes: payment.notes, units: -units })
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.id.localeCompare(b.id) : a.type === "invoice" ? -1 : 1))
  let opening = 0, debit = 0, credit = 0
  for (const row of raw) if (start && row.date < start) opening = add(opening, row.units)
  let running = opening
  const entries: ICustomerLedgerEntry[] = []
  for (const row of raw) {
    if ((start && row.date < start) || (end && row.date > end)) continue
    running = add(running, row.units)
    if (row.type === "invoice") debit = add(debit, row.units); else credit = add(credit, -row.units)
    const { units, ...entry } = row
    void units
    entry.balance = running / 100
    if (filter === "all" || (filter === "shipments" ? !!entry.relatedShipmentTracking : filter === "invoices" ? entry.type === "invoice" : entry.type === "payment")) entries.push(entry)
  }
  return { customer: { id: customer._id, companyName: customer.companyName, contactEmail: customer.contactEmail,
    ...fields(customer, ["commercialRegisterNumber", "taxCardNumber", "contactPhone", "address", "city", "country"]) }, period: { from: from || undefined, to: to || undefined },
    generatedAt: new Date().toISOString(), generatedBy: { id: actor.user._id, name: `${actor.user.firstName} ${actor.user.lastName}`.trim(), email: actor.user.email },
    summary: { openingBalance: opening / 100, totalDebit: debit / 100, totalCredit: credit / 100, closingBalance: running / 100, currency, periodStart: from || undefined, periodEnd: to || undefined, totalTransactions: entries.length }, entries }
}

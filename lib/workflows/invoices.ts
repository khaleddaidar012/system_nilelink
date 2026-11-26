import {isAccountingInvoice} from "../shipments/invoice-kind"
import { randomUUID } from "node:crypto"
import { CreateInvoiceSchema, UpdateInvoiceSchema } from "../validations/invoice-validation"
import { calculateInvoiceTotals } from "../engine/invoice-calculator"
import { WorkflowStore, body, fields, now, notification, paging, reject, requireStaff, response, timestamped, validDate } from "./runtime"
import type { Actor, Data, Snapshot, WorkflowInput } from "./runtime"
import { minorUnits } from "./finance"
import { shipmentAudit, withoutAccounting } from "../shipments/invoice-privacy"
import { requestInvoiceReplacement } from "../shipments/request-invoice-link"
import { newInvoiceReference } from "../references/numbering"
import { staffCategoryOf } from "../auth/staff-categories"
import { matchesSmartQuery } from "../shipments/smart-search"

export function invoicePermission(actor: Actor, key: "createInvoice" | "editInvoice" | "issueTaxInvoice" | "viewCustomerStatements" | "exportCustomerStatements" | "sendFinancialDocuments") {
  requireStaff(actor.user)
  if (actor.user.role !== "super_admin" && !actor.user.staffPermissions?.[key]) reject(403, `Missing permission: ${key}`)
}
const permission = invoicePermission
function yearValue(value: unknown): number {
  const year = Number(value ?? new Date().getUTCFullYear())
  if (!Number.isInteger(year) || year < 1900 || year > 9999) return reject(400, "Invalid invoice year")
  return year
}
/** Allocation incorporates both the imported counter and existing invoice suffixes. */
export async function invoiceNumber(store: WorkflowStore, year: number, allocate: boolean): Promise<string> {
  const prefix = `INV-${year}-`, key = `INV_${year}`
  const maximum = `SELECT coalesce(max(CAST(substr(invoiceNumber, ?) AS INTEGER)), 0) AS n FROM invoices
    WHERE substr(invoiceNumber, 1, ?) = ? AND substr(invoiceNumber, ?) != '' AND substr(invoiceNumber, ?) NOT GLOB '*[^0-9]*'`
  const values = [prefix.length + 1, prefix.length, prefix, prefix.length + 1, prefix.length + 1]
  let seq: number
  if (allocate) {
    const row = await store.db.prepare(`INSERT INTO invoice_sequences (id, data)
      SELECT ?, json_object('_id', ?, 'seq', n + 1, 'createdAt', ?, 'updatedAt', ?) FROM (${maximum})
      WHERE n < 9007199254740991 ON CONFLICT(id) DO UPDATE SET
        data = json_set(invoice_sequences.data, '$.seq', max(invoice_sequences.seq, json_extract(excluded.data, '$.seq') - 1) + 1, '$.updatedAt', ?),
        revision = invoice_sequences.revision + 1 WHERE invoice_sequences.seq < 9007199254740991 RETURNING seq`)
      .bind(key, key, now(), now(), ...values, now()).first<{ seq: number }>()
    seq = row?.seq ?? NaN
  } else {
    const row = await store.db.prepare(`SELECT max(coalesce((SELECT seq FROM invoice_sequences WHERE id = ?), 0), (SELECT n FROM (${maximum}))) + 1 AS seq`)
      .bind(key, ...values).first<{ seq: number }>()
    seq = row?.seq ?? NaN
  }
  if (!Number.isSafeInteger(seq) || seq < 1) return reject(409, "Invoice sequence requires review")
  return prefix + String(seq).padStart(6, "0")
}
function audit(actor: Actor, invoice: Data, action: string, previousState: unknown, newState: unknown): Data {
  return timestamped({ invoiceId: invoice._id, customerId: invoice.customerId ?? null, actorId: actor.user._id,
    meaningfulChange:action!=="edit"||Object.entries(newState as Record<string,unknown>).some(([key,value])=>key!=="updatedBy"&&JSON.stringify(invoice[key])!==JSON.stringify(value)),
    actorName: `${actor.user.firstName} ${actor.user.lastName}`.trim(), actorRole: actor.user.role,
    action, previousState, newState, notes: `Invoice ${invoice.invoiceNumber}: ${action}.` })
}
function customerSnapshot(data: Data): Record<string, any> {
  return { companyName: data.companyName, commercialRegisterNumber: data.commercialRegisterNumber || "",
    taxCardNumber: data.taxCardNumber || "", address: data.address || "", city: data.city || "", country: data.country || "Egypt",
    contactPhone: data.contactPhone || data.phone || "", contactEmail: data.contactEmail || data.billingEmail || "" }
}
async function relationships(store: WorkflowStore, value: Record<string, any>) {
  const checks: Snapshot[] = []
  let snapshot = value.customerSnapshot
  if (value.customerId) {
    const customer = await store.read("customers", value.customerId)
    if (!customer) return reject(404, "Customer not found")
    checks.push(customer)
    snapshot = { ...snapshot, ...customerSnapshot(customer.data) }
  } else if (!snapshot?.companyName?.trim()) return reject(400, "Customer details required")
  let request: Snapshot | null = null
  if (value.relatedRequestId) {
    request = await store.read("customer_requests", value.relatedRequestId)
    if (!request || !value.customerId || request.data.customerId !== value.customerId) return reject(409, "Invoice request/customer relationship is invalid")
    checks.push(request)
  }
  if (value.relatedQuoteId) {
    const quote = await store.read("quotes", value.relatedQuoteId)
    if (!quote || !value.customerId || quote.data.customerId !== value.customerId || !request || quote.data.requestId !== request.id || quote.data.currency !== value.currency) {
      return reject(409, "Invoice quote/request/customer/currency relationship is invalid")
    }
    checks.push(quote)
  }
  return { checks, snapshot, request }
}
function calculated(value: Record<string, any>, oldItems: Record<string, any>[] = []): Record<string, any> & { items: Record<string, any>[] } {
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100) return reject(400, "Invoice requires 1-100 items")
  for (const item of value.items) {
    if (typeof item.description !== "string" || !item.description.trim() || item.description.length > 500 ||
        !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
        !Number.isFinite(item.quantity * item.unitPrice)) return reject(400, "Invalid invoice item")
  }
  for (const key of ["taxRate", "discount", "additionalCharges"]) if (!Number.isFinite(value[key]) || value[key] < 0) reject(400, "Invalid invoice rates")
  if (value.taxRate > 100) reject(400, "Invalid tax rate")
  const result = calculateInvoiceTotals(value as any)
  if (!result.isValid) return reject(400, result.errors.join(" "))
  for (const item of result.items) minorUnits(item.total)
  for (const key of ["subtotal", "tax", "discount", "additionalCharges", "totalAmount", "remainingAmount"] as const) minorUnits(result[key])
  return { ...fields(result, ["subtotal", "taxRate", "tax", "discount", "additionalCharges", "totalAmount", "paidAmount", "remainingAmount"]),
    items: result.items.map((item, index) => ({ ...oldItems[index], ...item })) }
}
export function invoiceDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return reject(400, "Invalid invoice date")
  const day = value.slice(0, 10), parsed = new Date(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return reject(400, "Invalid calendar date")
  return validDate(value)
}
function dates(value: Record<string, any>) {
  const issueDate = invoiceDate(value.issueDate), dueDate = invoiceDate(value.dueDate)
  yearValue(new Date(issueDate).getUTCFullYear())
  if (dueDate < issueDate) reject(400, "Due date must not precede issue date")
  return { issueDate, dueDate }
}
async function draftGuard(store: WorkflowStore, invoice: Snapshot) {
  if (invoice.data.status !== "draft" || invoice.data.archivedAt) reject(409, "Only active draft invoices can be changed")
  if (minorUnits(invoice.data.paidAmount) !== 0 || (await store.list("payments", "invoiceId = ?", [invoice.id])).length) {
    reject(409, "Draft invoice contains payments and requires reconciliation")
  }
}
async function populated(store: WorkflowStore, value: Data): Promise<Data> {
  const result = { ...withoutAccounting(value) }
  if (value.customerId) {
    const row = await store.read("customers", value.customerId)
    result.customerId = row ? { _id: row.id, ...fields(row.data, ["companyName", "commercialRegisterNumber", "taxCardNumber", "contactEmail", "contactPhone", "address", "city", "country"]) } : null
  }
  if (value.relatedRequestId) {
    const row = await store.read("customer_requests", value.relatedRequestId)
    result.relatedRequestId = row ? { _id: row.id, ...fields(row.data, ["trackingNumber", "serviceType", "status"]) } : null
  }
  for (const key of ["createdBy", "confirmedBy", "sentBy"]) if (value[key]) {
    const row = await store.read("users", value[key])
    result[key] = row ? { _id: row.id, ...fields(row.data, ["firstName", "lastName", "email"]) } : null
  }
  return result
}

export async function handleInvoices(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  requireStaff(actor.user)
  if (args.action === "invoice-next-number") {
    const year = yearValue(new URL(args.request.url).searchParams.get("year") ?? undefined)
    return response({ success: true, nextNumber: await invoiceNumber(store, year, false), year })
  }
  if (args.action === "invoices-list") return listInvoices(store, actor, args)
  if (args.action === "invoice-create") {
    permission(actor, "createInvoice")
    const parsed = CreateInvoiceSchema.safeParse(await body(args))
    if (!parsed.success) return response({ error: "Validation failed", details: parsed.error.format() }, 400)
    const input = parsed.data
    if (input.documentType === "tax_invoice") permission(actor, "issueTaxInvoice")
    if (input.customerId && input.externalCustomer) reject(400, "Select one customer source")
    const dateValues = dates(input)
    const external = input.externalCustomer
    const resolved = await relationships(store, { ...input, customerSnapshot: external ? { ...external, companyName: external.companyName.trim(), commercialRegisterNumber: "" } : null })
    const totals = calculated(input)
    const customer = resolved.checks.find(row => row.table === "customers")
    const numbering = customer ? await newInvoiceReference(store.db, customer, resolved.request) : null
    const number = numbering?.referenceNumber || await invoiceNumber(store, new Date(dateValues.issueDate).getUTCFullYear(), true)
    const invoice = timestamped({ ...fields(input, ["documentType", "currency", "notes", "internalNotes"]), ...dateValues, ...totals,
      customerId: input.customerId || null, customerSnapshot: resolved.snapshot, relatedRequestId: input.relatedRequestId || null,
      relatedQuoteId: input.relatedQuoteId || null, invoiceNumber: number, ...numbering, token: randomUUID(), status: "draft", createdBy: actor.user._id,
      shipmentSnapshot: null, issuerSnapshot: null, confirmedAt: null, confirmedBy: null, sentAt: null, sentBy: null, pdfUrl: null })
    const parent = resolved.checks.find(row => row.table === "customer_requests")
    const replacement = parent ? await requestInvoiceReplacement(store, actor, { table: "invoices", id: invoice._id, revision: 0, data: invoice }, parent, actor.user.role === "super_admin" || actor.user.staffPermissions?.editInvoice === true, true) : { updates: [], inserts: [] }
    await store.commit({ checks: [actor.snapshot, ...resolved.checks], updates: replacement.updates, inserts: [{ table: "invoices", data: invoice },
      { table: "invoice_activity_logs", data: audit(actor, invoice, "create", null, invoice) }, ...replacement.inserts] })
    return response({ success: true, invoice }, 201)
  }
  if (!args.id) return reject(400, "Invoice ID required")
  const source = await store.read("invoices", args.id)
  if (!source) return reject(404, "Invoice not found")
  const invoice = source.data
  if (args.action === "invoice-detail") {
    return response({ success: true, invoice: await populated(store, invoice),
      payments: (await store.list("payments", "invoiceId = ?", [source.id], "paymentDate DESC, id DESC")).map(row => row.data),
      activityLogs: isAccountingInvoice(invoice) ? await shipmentAudit(store, source.id)
        : (await store.list("invoice_activity_logs", "invoiceId = ?", [source.id], "createdAt DESC, id DESC")).slice(0, 30).map(row => row.data) })
  }
  if (isAccountingInvoice(invoice)) reject(409, "Use the shipment accounting workflow to change this invoice")
  permission(actor, "editInvoice")
  if (invoice.documentType === "tax_invoice") permission(actor, "issueTaxInvoice")
  if (args.action === "invoice-cancel") {
    if (!["confirmed", "sent", "overdue"].includes(invoice.status) || invoice.archivedAt) reject(409, "Only unpaid issued invoices can be cancelled; archive drafts separately")
    const payments = await store.list("payments", "invoiceId = ?", [source.id])
    const sending = await store.list("_nilelink_delivery_jobs", "json_extract(data, '$.invoiceId') = ? AND state IN ('processing','uncertain')", [source.id])
    if (sending.length) reject(409, "Delivery is in progress or uncertain; reconcile it before cancellation")
    if (minorUnits(invoice.paidAmount) !== 0 || payments.length || minorUnits(invoice.totalAmount) !== minorUnits(invoice.remainingAmount)) reject(409, "Invoice requires payment reconciliation or reversal before cancellation")
    const input = args.request.body === null && !args.input ? {} : await body(args)
    const reason = input.reason ?? "Cancelled by Nile Link staff"
    if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) reject(400, "Invalid cancellation reason")
    const patch = { status: "cancelled", cancelledAt: now(), cancelledBy: actor.user._id, cancellationReason: reason.trim() }
    await store.commit({ checks: [actor.snapshot], updates: [{ before: source, patch }],
      inserts: [{ table: "invoice_activity_logs", data: { ...audit(actor, invoice, "cancel", invoice, patch), notes: reason.trim() } }] })
    return response({ success: true, invoice: (await store.read("invoices", source.id))!.data })
  }
  await draftGuard(store, source)
  if (args.action === "invoice-archive") {
    const patch = { archivedAt: now(), archivedBy: actor.user._id, status: "cancelled" }
    await store.commit({ checks: [actor.snapshot], updates: [{ before: source, patch }], inserts: [{ table: "invoice_activity_logs", data: audit(actor, invoice, "archive", invoice, patch) }] })
    return response({ success: true, message: `Draft invoice ${invoice.invoiceNumber} archived; history retained.` })
  }
  if (args.action === "invoice-update") {
    const parsed = UpdateInvoiceSchema.safeParse(await body(args))
    if (!parsed.success) return response({ error: "Validation failed", details: parsed.error.format() }, 400)
    const input = parsed.data
    if (input.documentType === "tax_invoice") permission(actor, "issueTaxInvoice")
    const merged: Record<string, any> = { ...invoice, ...input }
    if (input.externalCustomer) {
      if (input.customerId) reject(400, "Select one customer source")
      merged.customerId = null
      merged.customerSnapshot = { ...input.externalCustomer, commercialRegisterNumber: "" }
    }
    if (input.customerId === null && !input.externalCustomer && invoice.customerId) reject(400, "External customer details required when clearing customer")
    const resolved = await relationships(store, merged)
    const patch: Record<string, any> = { ...fields(input, ["customerId", "relatedRequestId", "relatedQuoteId", "currency", "documentType", "notes", "internalNotes"]),
      ...dates(merged), customerId: merged.customerId || null, relatedRequestId: merged.relatedRequestId || null,
      relatedQuoteId: merged.relatedQuoteId || null, customerSnapshot: resolved.snapshot, updatedBy: actor.user._id }
    if (["items", "taxRate", "discount", "additionalCharges"].some(key => Object.hasOwn(input, key))) Object.assign(patch, calculated(merged, invoice.items))
    const numberedCustomer = resolved.checks.find(row => row.table === "customers")
    if (numberedCustomer && (invoice.customerId !== merged.customerId || invoice.numberingRequestId !== (resolved.request?.id || null) || !invoice.referenceNumber)) {
      Object.assign(patch, await newInvoiceReference(store.db, numberedCustomer, resolved.request))
    } else if (!numberedCustomer) {
      Object.assign(patch, { referenceNumber: null, customerCode: null, numberingRequestId: null, invoiceSequence: null })
    }
    const parent = resolved.checks.find(row => row.table === "customer_requests")
    const replacement = parent ? await requestInvoiceReplacement(store, actor, { ...source, data: { ...invoice, customerId: merged.customerId } }, parent, true) : { updates: [], inserts: [] }
    const oldParent = !parent && invoice.relatedRequestId ? await store.read("customer_requests", invoice.relatedRequestId) : null
    await store.commit({ checks: [actor.snapshot, ...resolved.checks], updates: [...replacement.updates, ...(oldParent ? [{ before: oldParent, patch: { invoiceLinkUpdatedAt: now() } }] : []), { before: source, patch }], inserts: [{ table: "invoice_activity_logs", data: audit(actor, invoice, "edit", invoice, patch) }, ...replacement.inserts] })
    return response({ success: true, invoice: (await store.read("invoices", source.id))!.data })
  }
  if (args.action === "invoice-confirm") {
    dates(invoice)
    const total = minorUnits(invoice.totalAmount)
    if (minorUnits(invoice.remainingAmount) !== total) reject(409, "Invoice balance requires reconciliation")
    // Compare stored draft calculations before confirmation, without rewriting historical values.
    const totals = calculated(invoice)
    for (const key of ["subtotal", "tax", "discount", "additionalCharges", "totalAmount"]) {
      if (minorUnits(invoice[key]) !== minorUnits(totals[key])) reject(409, "Draft calculations require reconciliation")
    }
    if (invoice.items.some((item: Record<string, any>, index: number) => minorUnits(item.total) !== minorUnits(totals.items[index].total))) reject(409, "Draft line totals require reconciliation")
    const resolved = await relationships(store, invoice)
    const request = resolved.request?.data
    const patch = { status: total === 0 ? "paid" : new Date(invoice.dueDate).getTime() < Date.now() ? "overdue" : "confirmed",
      confirmedBy: actor.user._id, confirmedAt: now(), customerSnapshot: resolved.snapshot,
      ...(request ? { shipmentSnapshot: { ...invoice.shipmentSnapshot, requestId: request._id, trackingNumber: request.trackingNumber,
        serviceType: request.serviceType || "Freight Logistics", complianceType: request.complianceType || null, complianceNumber: request.complianceNumber || "",
        origin: request.details?.originPort || request.details?.pickupAddress || "", destination: request.details?.destinationPort || request.details?.deliveryAddress || "" } } : {}),
      // Same issuer defaults as the existing Mongo confirmation route; production verification is still required.
      issuerSnapshot: { legalName: "Nile Link Logistics S.A.E", address: "Entrance to Al-Ananiyah Road, opposite the Ice Factory, Damietta, Egypt",
        taxId: "", phone: "01000018549", email: "info@nilelinklogistics.com", bankName: "Commercial International Bank (CIB)",
        bankAccountName: "Nile Link Logistics SAE", bankIban: "EG3800100000000001234567890", bankSwift: "CIBEEGCX", ...invoice.issuerSnapshot } }
    const inserts: { table: "invoice_activity_logs" | "notifications"; data: Data }[] = [{ table: "invoice_activity_logs", data: audit(actor, invoice, "confirm", invoice, patch) }]
    if (invoice.customerId) inserts.push({ table: "notifications", data: notification({ recipientCustomerId: invoice.customerId,
      type: "invoice_confirmed", title: "Invoice confirmed", message: `Invoice ${invoice.invoiceNumber} is available.`, relatedInvoiceId: invoice._id }) })
    await store.commit({ checks: [actor.snapshot, ...resolved.checks], updates: [{ before: source, patch }], inserts })
    return response({ success: true, invoice: (await store.read("invoices", source.id))!.data })
  }
  return reject(404, "Unknown invoice operation")
}

async function listInvoices(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  const isAdmin = actor.user.role === "super_admin"
  if (!isAdmin && staffCategoryOf(actor.user) === "operations") {
    reject(403, "Financial invoices are restricted to Accounts and Administrators")
  }
  const url = new URL(args.request.url), { page, limit } = paging(url)
  const predicates = ["json_extract(data, '$.archivedAt') IS NULL"], values: string[] = []
  const selectedCustomerId = (url.searchParams.get("customerId") || "").trim()
  for (const [param, column] of [["customerId", "customerId"], ["requestId", "relatedRequestId"], ["currency", "currency"], ["documentType", "json_extract(data, '$.documentType')"]]) {
    const value = url.searchParams.get(param)
    if (value && value !== "all") { predicates.push(`${column} = ?`); values.push(value) }
  }
  const status = url.searchParams.get("status")
  if (status === "unpaid") predicates.push("status IN ('confirmed','sent','partially_paid','overdue')")
  else if (status && status !== "all") { predicates.push("status = ?"); values.push(status) }

  const month = (url.searchParams.get("month") || "").trim()
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) reject(400, "Invalid month filter")
    const [yearNum, monthNum] = month.split("-").map(Number)
    const lastDay = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate()
    predicates.push("issueDate >= ? AND issueDate <= ?")
    values.push(`${month}-01T00:00:00.000Z`, `${month}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`)
  }
  const start = url.searchParams.get("startDate"), end = url.searchParams.get("endDate")
  if (start) { predicates.push("issueDate >= ?"); values.push(invoiceDate(start)) }
  if (end) { predicates.push("issueDate <= ?"); values.push(invoiceDate(/^\d{4}-\d{2}-\d{2}$/.test(end) ? `${end}T23:59:59.999Z` : end)) }
  const search = (url.searchParams.get("search") || "").trim()
  const rows = (await store.list("invoices", predicates.join(" AND "), values, "createdAt DESC, id DESC"))
    .filter(row => !search || matchesSmartQuery([
      row.data.invoiceNumber,
      row.data.referenceNumber,
      ...(row.data.previousReferenceNumbers || []),
      row.data.customerCode,
      row.data.customerSnapshot?.companyName,
      row.data.shipmentSnapshot?.trackingNumber,
    ], search))

  // Compute per-company totals (available to Accounts + Super Admin)
  const companyMap = new Map<string, {
    customerId: string
    companyName: string
    currency: string
    invoiceCount: number
    draftCount: number
    confirmedCount: number
    totalInvoicedMinor: number
    totalPaidMinor: number
    totalRemainingMinor: number
  }>()

  for (const { data } of rows) {
    const cid = String(data.customerId || `ext:${data.customerSnapshot?.companyName || "unknown"}`)
    const cname = String(data.customerSnapshot?.companyName || "—")
    const curr = String(data.currency || "EGP")
    const key = `${cid}::${curr}`
    let entry = companyMap.get(key)
    if (!entry) {
      entry = {
        customerId: data.customerId || "",
        companyName: cname,
        currency: curr,
        invoiceCount: 0,
        draftCount: 0,
        confirmedCount: 0,
        totalInvoicedMinor: 0,
        totalPaidMinor: 0,
        totalRemainingMinor: 0,
      }
      companyMap.set(key, entry)
    }
    entry.invoiceCount += 1
    if (data.status === "draft") entry.draftCount += 1
    if (data.status === "confirmed") entry.confirmedCount += 1
    if (data.status !== "cancelled") {
      try {
        entry.totalInvoicedMinor += minorUnits(data.totalAmount)
        entry.totalPaidMinor += minorUnits(data.paidAmount)
        entry.totalRemainingMinor += minorUnits(data.remainingAmount)
      } catch { /* ignore malformed legacy amount */ }
    }
  }

  const companyTotals = [...companyMap.values()]
    .map(c => ({
      customerId: c.customerId,
      companyName: c.companyName,
      currency: c.currency,
      invoiceCount: c.invoiceCount,
      draftCount: c.draftCount,
      confirmedCount: c.confirmedCount,
      totalInvoicedAmount: c.totalInvoicedMinor / 100,
      totalPaidAmount: c.totalPaidMinor / 100,
      totalRemainingAmount: c.totalRemainingMinor / 100,
    }))
    .sort((a, b) => b.totalInvoicedAmount - a.totalInvoicedAmount)

  // Grand total metrics: strictly Super Admin ONLY when unfiltered; Accounts only sees metrics when filtered to a single company
  const canExposeAggregateMetrics = isAdmin || Boolean(selectedCustomerId && selectedCustomerId !== "all")
  let metrics: Record<string, unknown> | null = null

  if (canExposeAggregateMetrics) {
    const byCurrency: Record<string, { totalInvoicedAmount: number | null; totalPaidAmount: number | null; totalRemainingAmount: number | null; reconciliationRequired?: boolean }> = Object.create(null)
    for (const { data } of rows) if (data.status !== "cancelled") {
      const currency = data.currency || "UNKNOWN"
      const group = byCurrency[currency] ??= { totalInvoicedAmount: 0, totalPaidAmount: 0, totalRemainingAmount: 0 }
      if (group.reconciliationRequired) continue
      try {
        group.totalInvoicedAmount! += minorUnits(data.totalAmount)
        group.totalPaidAmount! += minorUnits(data.paidAmount)
        group.totalRemainingAmount! += minorUnits(data.remainingAmount)
        if (![group.totalInvoicedAmount, group.totalPaidAmount, group.totalRemainingAmount].every(Number.isSafeInteger)) reject(409, "Invoice summary exceeds supported precision")
      } catch {
        Object.assign(group, { totalInvoicedAmount: null, totalPaidAmount: null, totalRemainingAmount: null, reconciliationRequired: true })
      }
    }
    for (const group of Object.values(byCurrency)) for (const key of ["totalInvoicedAmount", "totalPaidAmount", "totalRemainingAmount"] as const) if (group[key] !== null) group[key]! /= 100
    const groups = Object.values(byCurrency)
    metrics = {
      scope: selectedCustomerId && selectedCustomerId !== "all" ? "company" : "grand_total",
      totalDraftCount: rows.filter(row => row.data.status === "draft").length,
      totalConfirmedCount: rows.filter(row => row.data.status === "confirmed").length,
      ...(groups.length === 1 ? groups[0] : { totalInvoicedAmount: groups.length ? null : 0, totalPaidAmount: groups.length ? null : 0, totalRemainingAmount: groups.length ? null : 0 }),
      byCurrency,
      currency: groups.length === 1 ? Object.keys(byCurrency)[0] : null,
    }
  }

  const invoices = await Promise.all(rows.slice((page - 1) * limit, page * limit).map(row => populated(store, row.data)))
  return response({
    success: true,
    viewer: { isAdmin, grandTotalVisible: isAdmin },
    invoices,
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) || 1 },
    metrics,
    companyTotals,
  })
}
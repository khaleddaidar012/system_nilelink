import { randomUUID, createHash } from "node:crypto"
import { z } from "zod"
import { canAccessAccounts } from "../auth/accounts-access"
import { staffCategoryOf } from "../auth/staff-categories"
import { accountingStaffView, shipmentAudit } from "../shipments/invoice-privacy"
import { accountingDraft, customerSaleItems, customerInvoiceGroups, draftSchema, emptyAccounting, minor, decimal, tierSubtotal, tierSchema, stages, totals, currencies, draftBusinessKey } from "../shipments/accounting"
import type { Accounting, AccountingDraft, Publication } from "../shipments/accounting"
import { newInvoiceReference } from "../references/numbering"
import { invoiceDate } from "./invoices"
import { invoiceRequestMatches, linkRequestInvoice } from "../shipments/request-invoices"
import { requestInvoiceReplacement } from "../shipments/request-invoice-link"
import { body, fields, notification, now, paging, reject, requireStaff, response, timestamped, WorkflowError } from "./runtime"
import type { Actor, Data, Snapshot, WorkflowInput, WorkflowStore } from "./runtime"
import {isAccountingInvoice} from "../shipments/invoice-kind"
import {latestQuote,quoteItems,requestServices} from "./requests"
import {serviceLabels} from "../requests/progress"

export function accountingPermissions(actor: Actor) {
  requireStaff(actor.user)
  if (!canAccessAccounts(actor.user)) reject(403, "Accounts access required")
  const admin = actor.user.role === "super_admin"
  const requiresApproval = !admin && staffCategoryOf(actor.user) === "accounts"
  return { isAdmin: admin, requiresApproval, viewSensitive: admin, canPublish: admin, canEdit: admin || actor.user.staffPermissions?.editInvoice === true,
    canUseTieredPricing:admin || actor.user.staffPermissions?.canUseTieredPricing===true,
    canCreate: admin || actor.user.staffPermissions?.createInvoice === true }
}
function log(actor: Actor, invoice: Data, action: string, previous: unknown, next: unknown) {
  const entry = timestamped({ invoiceId: invoice._id, customerId: invoice.customerId, actorId: actor.user._id,
    actorName: `${actor.user.firstName} ${actor.user.lastName}`.trim(), actorRole: actor.user.role,
    action, previousState: previous, newState: next, notes: action })
  if (new TextEncoder().encode(JSON.stringify(entry)).length > 1_800_000) reject(413, "Invoice audit exceeds the supported storage size")
  return entry
}
function checkAccountingSize(accounting: unknown) {
  if (new TextEncoder().encode(JSON.stringify(accounting)).length > 800_000) reject(413, "Invoice exceeds the supported storage size")
}
function readAccounting(invoice: Data): Accounting {
  if (!isAccountingInvoice(invoice) || !invoice.shipmentAccounting) reject(404, "Accounting invoice not found")
  const accounting = invoice.shipmentAccounting as Accounting
  return { ...accounting, draft: accountingDraft(accounting) }
}
function publication(invoice: Data, draft: AccountingDraft, actor: Actor): Publication {
  const summary = totals(draft, invoice.currency)
  if (!stages.some(stage => draft.stages[stage].completed) || minor(summary.customerTotal) === BigInt(0)) {
    reject(409, "Complete at least one stage and enter the customer selling price before publication")
  }
  return { version: readAccounting(invoice).publications.length + 1, publishedAt: now(), publishedBy: actor.user._id,
    invoiceNumber: invoice.invoiceNumber, referenceNumber: invoice.referenceNumber, shipmentId: invoice.shipmentRecordId || "", booking: invoice.shipmentSnapshot.trackingNumber,
    customerId: invoice.customerId, customerName: invoice.customerSnapshot.companyName,
    currency: invoice.currency, items: customerSaleItems(draft, invoice.currency), groups: customerInvoiceGroups(draft, invoice.currency),
    total: summary.customerTotal, notes: draft.notes }
}
// The confirmation binds the exact saved draft and optimistic revision that was previewed.
function previewKey(source: Snapshot) {
  return createHash("sha256").update(JSON.stringify([source.id, source.revision, source.data.shipmentAccounting.draft])).digest("hex")
}
export async function handleShipmentInvoices(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  const permissions = accountingPermissions(actor)
  if (args.request.method !== "GET" && args.request.headers.get("origin") !== new URL(args.request.url).origin) reject(403, "Invalid origin")
  if(args.action==="shipment-invoice-from-request"){
    if(!permissions.canCreate)reject(403,"Invoice creation permission required")
    const parent=args.id?await store.read("customer_requests",args.id):null
    if(!parent)reject(404,"Request not found")
    const customer=await store.read("customers",parent.data.customerId)
    if(!customer)reject(409,"Registered customer is missing")
    const existing=(await store.list("invoices","relatedRequestId=? AND status!='cancelled' AND json_extract(data,'$.archivedAt') IS NULL",[parent.id]))[0]
    if(existing){if(existing.data.customerId!==customer.id)reject(409,"Invoice customer mismatch");return response({invoice:{id:existing.id,accounting:isAccountingInvoice(existing.data)},permissions})}
    if(permissions.requiresApproval&&parent.data.accountsReadiness?.state!=="approved")reject(403,"This shipment has not been approved for accounts by an administrator")
    const quote=await latestQuote(store,parent.id)
    if(parent.data.quoteRequired!==false&&(!quote||!["accepted","partially_accepted"].includes(quote.data.status)))reject(409,"Accept a quotation first, or select the direct processing workflow")
    if(quote&&quote.data.customerId!==customer.id)reject(409,"Quotation customer mismatch")
    const acceptedQuote=quote&&["accepted","partially_accepted"].includes(quote.data.status)?quote:null
    const currency=acceptedQuote?.data.currency||"EGP"
    const lines=acceptedQuote?await quoteItems(store,acceptedQuote):[]
    const services=await requestServices(store,parent)
    if(lines.some(line=>!services.some(service=>line.data.requestServiceId?service.id===line.data.requestServiceId&&service.data.serviceKey===line.data.serviceKey:service.data.serviceKey===line.data.serviceKey)))reject(409,"Quotation service relationship requires review")
    if(acceptedQuote&&!currencies.includes(currency))reject(409,"Review quotation currency before using this accounting workflow")
    const selected=lines.filter(line=>!Array.isArray(quote?.data.acceptedServices)||quote!.data.acceptedServices.includes(line.data.serviceKey))
    const accounting=emptyAccounting();accounting.draft.pricingMode="per-item-v1"
    for(const line of selected){
      const stage=line.data.serviceKey==="customs_clearance"?"customs":["inland_transportation","land_freight","land_transport"].includes(line.data.serviceKey)?"transportation":"shipping"
      const amount=decimal(minor(String(line.data.finalPrice)))
      const tiers=line.data.isTiered&&Array.isArray(line.data.tiers)?z.array(tierSchema).min(1).max(30).parse(line.data.tiers.map((tier:any)=>({label:tier.label,quantity:String(tier.quantity),unitPrice:String(tier.unitPrice)}))):undefined
      const tierMatch=tiers&&decimal(tiers.reduce((sum,tier)=>sum+minor(tierSubtotal(tier)),BigInt(0)))===amount
      accounting.draft.stages[stage].costs.push({id:randomUUID(),description:serviceLabels[line.data.serviceKey]?.join(" / ")||line.data.serviceKey,amount:"0.00",saleEqualsCost:false,sellingPrice:amount,...(tierMatch?{isTiered:true,tiers}:{}),currency:quote!.data.currency||"EGP",exchangeRate:"1",notes:"",createdAt:now(),createdBy:actor.user._id,updatedAt:now(),updatedBy:actor.user._id})
    }
    accounting.draft.internalSellingPrice=totals(accounting.draft,currency).customerTotal
    const numbering=await newInvoiceReference(store.db,customer,parent)
    const invoice=timestamped({invoiceNumber:numbering.referenceNumber,...numbering,token:randomUUID(),requestAccounting:true,customerId:customer.id,relatedRequestId:parent.id,relatedQuoteId:acceptedQuote?.id||null,currency,status:"draft",documentType:"invoice",issueDate:now(),dueDate:null,items:[],subtotal:0,taxRate:0,tax:0,discount:0,additionalCharges:0,totalAmount:0,paidAmount:0,remainingAmount:0,notes:"",createdBy:actor.user._id,shipmentAccounting:accounting,
      customerSnapshot:fields(customer.data,["companyName","commercialRegisterNumber","taxCardNumber","address","city","country","contactPhone","contactEmail"]),shipmentSnapshot:{requestId:parent.id,trackingNumber:parent.data.trackingNumber,serviceType:selected.map(line=>line.data.serviceKey).join(" + "),complianceType:parent.data.complianceType,complianceNumber:parent.data.complianceNumber}})
    const replacement=await requestInvoiceReplacement(store,actor,{table:"invoices",id:invoice._id,revision:0,data:invoice},parent,permissions.canEdit,true)
    await store.commit({checks:[actor.snapshot,customer,...(quote?[quote]:[]),...lines,...services],updates:replacement.updates,inserts:[{table:"invoices",data:invoice},{table:"invoice_activity_logs",data:log(actor,invoice,"request_invoice_created",null,accounting)},...replacement.inserts]})
    return response({invoice:{id:invoice._id,accounting:true},permissions},201)
  }
  if (args.action === "shipment-invoice-request-options") {
    if (!permissions.canCreate) reject(403, "Invoice creation permission required")
    const url = new URL(args.request.url), customerId = url.searchParams.get("customerId") || ""
    if (!/^[a-f\d]{24}$/i.test(customerId)) reject(400, "Registered customer required")
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200)
    const rows = await store.db.prepare(`SELECT id,trackingNumber,json_extract(data,'$.subject') AS subject FROM customer_requests
      WHERE customerId=? AND (?=1 OR json_extract(data,'$.accountsReadiness.state')='approved') AND (?='' OR instr(lower(trackingNumber),lower(?))>0 OR instr(lower(coalesce(json_extract(data,'$.subject'),'')),lower(?))>0 OR instr(lower(coalesce(json_extract(data,'$.previousTrackingNumbers'),'')),lower(?))>0 OR instr(lower(coalesce(json_extract(data,'$.legacyTrackingNumber'),'')),lower(?))>0)
      ORDER BY createdAt DESC,id DESC LIMIT 50`).bind(customerId,permissions.requiresApproval?0:1,q,q,q,q,q).all()
    return response({ requests: rows.results })
  }
  if (args.action === "shipment-invoice-list") {
    const url = new URL(args.request.url), { page, limit } = paging(url)
    const status = url.searchParams.get("status") || "all"
    if (!["all", "draft", "published", "awaiting_approval"].includes(status)) reject(400, "Invalid status")
    const search = (url.searchParams.get("q") || "").trim().slice(0, 200)
    const filter = `(json_extract(data,'$.shipmentRecordId') IS NOT NULL OR json_extract(data,'$.requestAccounting')=1)
      AND (? = 'all' OR (? = 'draft' AND (status = 'draft' OR json_extract(data,'$.shipmentAccounting.pendingRevision') = 1)) OR (? = 'published' AND status != 'draft') OR (? = 'awaiting_approval' AND json_extract(data,'$.shipmentAccounting.approvalRequest') IS NOT NULL AND (status = 'draft' OR json_extract(data,'$.shipmentAccounting.pendingRevision') = 1)))
      AND (? = '' OR instr(lower(invoiceNumber || ' ' || coalesce(json_extract(data,'$.referenceNumber'),'') || ' ' || coalesce(json_extract(data,'$.previousReferenceNumbers'),'')),lower(?)) > 0 OR instr(lower(json_extract(data,'$.shipmentSnapshot.trackingNumber')),lower(?)) > 0
      OR instr(lower(json_extract(data,'$.shipmentRecordId')),lower(?)) > 0 OR instr(lower(json_extract(data,'$.customerSnapshot.companyName')),lower(?)) > 0)`
    const values = [status, status, status, status, search, search, search, search, search]
    const [rows, count] = await store.db.batch([
      store.db.prepare(`SELECT id,data,revision FROM invoices WHERE ${filter} ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?`).bind(...values, limit, (page - 1) * limit),
      store.db.prepare(`SELECT count(*) AS total FROM invoices WHERE ${filter}`).bind(...values),
    ])
    return response({ permissions, invoices: rows.results.map(row => accountingStaffView(JSON.parse(String(row.data)), Number(row.revision), permissions.viewSensitive)),
      total: count.results[0].total, page, limit })
  }
  if (args.action === "shipment-invoice-create") {
    if (!permissions.canCreate) reject(403, "Invoice creation permission required")
    const input = z.object({ shipmentId: z.uuid(), customerId: z.string().regex(/^[a-f\d]{24}$/i), currency: z.enum(currencies), dueDate: z.string().trim().max(80).nullish(), requestId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict().safeParse(await body(args))
    if (!input.success) reject(400, "Invalid shipment invoice input")
    const shipment = await store.db.prepare("SELECT id,booking,revision,port_of_loading,port_of_discharge FROM shipment_records WHERE id=?").bind(input.data.shipmentId)
      .first<{ id: string; booking: string; revision: number; port_of_loading: string; port_of_discharge: string }>()
    const customer = await store.read("customers", input.data.customerId)
    if (!shipment || !customer) reject(404, "Shipment or registered customer not found")
    const parent = input.data.requestId ? await store.read("customer_requests", input.data.requestId) : null
    if (input.data.requestId && (!parent || parent.data.customerId !== customer.id)) reject(409, "Request and invoice must belong to the same customer")
    if (parent && permissions.requiresApproval && parent.data.accountsReadiness?.state !== "approved") reject(403, "This shipment has not been approved for accounts by an administrator")
    const existing = (await store.list("invoices", "json_extract(data,'$.shipmentRecordId')=?", [shipment.id]))[0]
    if (existing) {
      if (existing.data.customerId !== customer.id || existing.data.currency !== input.data.currency) reject(409, "Shipment already has an invoice with a different customer or currency")
      if (parent) await linkRequestInvoice(store, actor, existing, parent)
      const current = (await store.read("invoices", existing.id))!
      return response({ invoice: accountingStaffView(current.data, current.revision, permissions.viewSensitive), permissions })
    }
    const issueDate = now(), dueDate = input.data.dueDate ? invoiceDate(input.data.dueDate) : null
    if (dueDate && dueDate.slice(0, 10) < issueDate.slice(0, 10)) reject(400, "Due date must not precede issue date")
    const numbering = await newInvoiceReference(store.db, customer, parent)
    const invoice = timestamped({ invoiceNumber: numbering.referenceNumber, ...numbering, token: randomUUID(),
      shipmentRecordId: shipment.id, customerId: customer.id, relatedRequestId: parent?.id ?? null, currency: input.data.currency, status: "draft", documentType: "invoice",
      issueDate, dueDate, items: [], subtotal: 0, taxRate: 0, tax: 0, discount: 0, additionalCharges: 0, totalAmount: 0, paidAmount: 0, remainingAmount: 0,
      notes: "", createdBy: actor.user._id, shipmentAccounting: emptyAccounting(),
      customerSnapshot: fields(customer.data, ["companyName", "commercialRegisterNumber", "taxCardNumber", "address", "city", "country", "contactPhone", "contactEmail"]),
      shipmentSnapshot: { trackingNumber: shipment.booking, origin: shipment.port_of_loading, destination: shipment.port_of_discharge, serviceType: "Shipping / Transportation / Customs Clearance" },
    })
    const guard = randomUUID()
    if (parent) invoiceRequestMatches({ table: "invoices", id: invoice._id, revision: 0, data: invoice }, parent)
    const replacement = parent ? await requestInvoiceReplacement(store, actor, { table: "invoices", id: invoice._id, revision: 0, data: invoice }, parent, permissions.canEdit, true) : { updates: [], inserts: [] }
    await store.commit({ checks: [actor.snapshot, customer, ...(parent ? [parent] : [])], updates: replacement.updates, inserts: [{ table: "invoices", data: invoice },
      { table: "invoice_activity_logs", data: log(actor, invoice, "shipment_invoice_created", null, invoice.shipmentAccounting) }, ...replacement.inserts], extra: [
        store.db.prepare("INSERT INTO _nilelink_write_guards(id,valid) SELECT ?,count(*) FROM shipment_records WHERE id=? AND revision=?").bind(guard, shipment.id, shipment.revision),
        store.db.prepare("DELETE FROM _nilelink_write_guards WHERE id=?").bind(guard),
      ] })
    return response({ invoice: accountingStaffView(invoice, 0, permissions.viewSensitive), permissions }, 201)
  }
  const source = args.id ? await store.read("invoices", args.id) : null
  if (!source) reject(404, "Shipment invoice not found")
  const accounting = readAccounting(source.data)
  if (args.action === "shipment-invoice-detail") {
    return response({ invoice: accountingStaffView(source.data, source.revision, permissions.viewSensitive), permissions,
      audit: await shipmentAudit(store, source.id) })
  }
  if (args.action === "shipment-invoice-save") {
    if (!permissions.canEdit) reject(403, "Invoice editing permission required")
    if (accounting.publications.length && !accounting.pendingRevision) reject(409, "Start an explicit revision before editing a published invoice")
    const parsed = draftSchema.safeParse(await body(args))
    if (!parsed.success) reject(400, "Invalid draft data")
    const input = parsed.data
    const tierSignature=(costs: {id:string;isTiered?:boolean;tiers?:unknown}[])=>JSON.stringify(costs.filter(cost=>cost.isTiered).map(cost=>({id:cost.id,tiers:cost.tiers})).sort((a,b)=>a.id.localeCompare(b.id)))
    if(!permissions.canUseTieredPricing && tierSignature(stages.flatMap(stage=>input.stages[stage].costs))!==tierSignature(stages.flatMap(stage=>accounting.draft.stages[stage].costs))) reject(403,"Tiered pricing permission required")
    if (input.revision !== source.revision) reject(409, "Invoice changed. Reload before saving")
    if (!permissions.viewSensitive && input.internalSellingPrice !== undefined) reject(403, "Internal selling price is admin only")
    if (input.sellingPrice !== undefined && input.internalSellingPrice !== undefined && minor(input.sellingPrice) !== minor(input.internalSellingPrice)) reject(400, "Enter one selling price")
    const draft: AccountingDraft = { pricingMode: input.pricingMode ?? accounting.draft.pricingMode, stages: structuredClone(accounting.draft.stages), customerItems: [],
      internalSellingPrice: input.sellingPrice ?? input.internalSellingPrice ?? accounting.draft.internalSellingPrice, notes: input.notes }
    const ids = new Set<string>()
    for (const stage of stages) {
      draft.stages[stage] = { completed: input.stages[stage].completed, costs: input.stages[stage].costs.map(cost => {
        if (ids.has(cost.id)) reject(400, "Duplicate cost ID")
        ids.add(cost.id)
        const old = stages.flatMap(key => accounting.draft.stages[key].costs).find(item => item.id === cost.id)
        const saleEqualsCost = cost.isTiered ? false : cost.saleEqualsCost ?? old?.saleEqualsCost ?? true
        const sellingPrice=cost.isTiered?decimal((cost.tiers||[]).reduce((sum,tier)=>sum+minor(tierSubtotal(tier)),BigInt(0))):saleEqualsCost?cost.amount:cost.sellingPrice??old?.sellingPrice
        return { ...cost, ...(draft.pricingMode === "per-item-v1" ? { saleEqualsCost, sellingPrice } : {}), createdAt: old?.createdAt || now(), createdBy: old?.createdBy || actor.user._id,
          updatedAt: now(), updatedBy: actor.user._id }
      }) }
    }
    const summary = totals(draft, source.data.currency)
    if (draft.pricingMode === "per-item-v1") draft.internalSellingPrice = summary.customerTotal
    draft.customerItems = customerSaleItems(draft, source.data.currency).map(item=>({description:item.description,amount:item.amount}))
    const patch = { shipmentAccounting: { ...accounting, draft, approvalRequest: null }, updatedBy: actor.user._id }
    checkAccountingSize(patch.shipmentAccounting)
    const saveLog=log(actor,source.data,"shipment_draft_saved",accounting.draft,draft)
    saveLog.meaningfulChange=draftBusinessKey(accounting.draft)!==draftBusinessKey(draft)
    await store.commit({ checks: [actor.snapshot], updates: [{ before: source, patch }], inserts: [{ table: "invoice_activity_logs",
      data: saveLog }] })
    return response({ invoice: accountingStaffView({ ...source.data, ...patch }, source.revision + 1, permissions.viewSensitive), permissions })
  }
  const input = z.object({ revision: z.number().int().nonnegative(), previewKey: z.string().length(64).optional(),
    reason: z.string().trim().min(1).max(1000).optional() }).strict().safeParse(await body(args))
  if (!input.success) reject(400, "Invalid publication request")
  if (input.data.revision !== source.revision) reject(409, "Invoice changed. Preview it again")
  if (args.action === "shipment-invoice-preview") {
    if (accounting.publications.length && !accounting.pendingRevision) reject(409, "This invoice is already published")
    return response({ snapshot: publication(source.data, accounting.draft, actor), previewKey: previewKey(source), revision: source.revision })
  }
  if (args.action === "shipment-invoice-request-approval") {
    if (!permissions.canEdit) reject(403, "Invoice editing permission required")
    if (accounting.publications.length && !accounting.pendingRevision) reject(409, "This invoice is already published")
    publication(source.data, accounting.draft, actor)
    const requested = { at: now(), by: actor.user._id, byName: `${actor.user.firstName} ${actor.user.lastName}`.trim(), revision: source.revision }
    const requestPatch = { shipmentAccounting: { ...accounting, approvalRequest: requested }, updatedBy: actor.user._id }
    await store.commit({ checks: [actor.snapshot], updates: [{ before: source, patch: requestPatch }], inserts: [
      { table: "invoice_activity_logs", data: log(actor, source.data, "shipment_approval_requested", null, requested) },
      { table: "notifications", data: notification({ targetAudience: "super_admin", type: "invoice_approval_requested", severity: "normal",
        title: "فاتورة بانتظار الاعتماد / Invoice awaiting approval", message: `${source.data.invoiceNumber} — ${requested.byName}`,
        relatedInvoiceId: source.id, relatedRequestId: source.data.relatedRequestId ?? null, actionUrl: `/admin/shipment-invoices/${source.id}` }) },
    ] })
    const updated = (await store.read("invoices", source.id))!
    return response({ invoice: accountingStaffView(updated.data, updated.revision, permissions.viewSensitive), permissions })
  }
  if (!permissions.canPublish) reject(403, "Only an administrator may revise or publish shipment invoices")
  if (args.action === "shipment-invoice-revise") {
    if (!accounting.publications.length || accounting.pendingRevision || !input.data.reason) reject(409, "A published invoice and revision reason are required")
    if (source.data.paidAmount !== 0 || (await store.list("payments", "invoiceId=?", [source.id])).length) reject(409, "Paid invoices require financial reconciliation before revision")
    if (accounting.publications.length >= 100) reject(409, "Invoice revision limit reached")
    const patch = { shipmentAccounting: { ...accounting, pendingRevision: true, draft: { ...accounting.draft,
      stages: Object.fromEntries(stages.map(stage => [stage, { ...accounting.draft.stages[stage], completed: false }])) } } }
    await store.commit({ checks: [actor.snapshot], updates: [{ before: source, patch }], inserts: [{ table: "invoice_activity_logs",
      data: log(actor, source.data, "shipment_revision_started", { version: accounting.publications.length }, { reason: input.data.reason }) }] })
    const updated = (await store.read("invoices", source.id))!
    return response({ invoice: accountingStaffView(updated.data, updated.revision, true), permissions })
  }
  if (accounting.publications.length && !accounting.pendingRevision) reject(409, "This invoice is already published")
  const snapshot = publication(source.data, accounting.draft, actor)
  if (args.action !== "shipment-invoice-publish") reject(404, "Unknown shipment invoice action")
  if (input.data.previewKey !== previewKey(source)) reject(409, "Preview the saved customer invoice before publishing")
  if (source.data.paidAmount !== 0 || (await store.list("payments", "invoiceId=?", [source.id])).length) reject(409, "Payments prevent publication of a revised invoice")
  const customer = await store.read("customers", source.data.customerId)
  if (!customer) reject(409, "Invoice customer unavailable")
  const patch = {
    shipmentAccounting: { ...accounting, publications: [...accounting.publications, snapshot], pendingRevision: false, approvalRequest: null },
    items: snapshot.items.map(item => ({ description: item.description, quantity: 1, unitPrice: Number(minor(item.amount)) / 100, total: Number(minor(item.amount)) / 100 })),
    subtotal: Number(minor(snapshot.total)) / 100, totalAmount: Number(minor(snapshot.total)) / 100, remainingAmount: Number(minor(snapshot.total)) / 100,
    notes: snapshot.notes, status: "confirmed", confirmedAt: snapshot.publishedAt, confirmedBy: actor.user._id,
  }
  checkAccountingSize(patch.shipmentAccounting)
  await store.commit({ checks: [actor.snapshot, customer], updates: [{ before: source, patch }], inserts: [
    { table: "invoice_activity_logs", data: log(actor, source.data, "shipment_invoice_published", { version: accounting.publications.length }, snapshot) },
    { table: "notifications", data: notification({ recipientCustomerId: customer.id, type: "invoice_confirmed", title: "Invoice published / تم نشر الفاتورة",
      message: `${source.data.invoiceNumber} · v${snapshot.version} — تم نشر الفاتورة ويمكن معاينتها / Your published invoice is ready to view.`, relatedInvoiceId: source.id,
      relatedRequestId:source.data.relatedRequestId??null,actionUrl:source.data.relatedRequestId?`/portal/requests/${source.data.relatedRequestId}`:"/portal/financials" }) },
  ] })
  return response({ invoice: accountingStaffView({ ...source.data, ...patch }, source.revision + 1, true), permissions })
}

export function shipmentInvoiceError(error: unknown): Response {
  if (error instanceof WorkflowError) return response({ error: error.message }, error.status)
  if (error instanceof z.ZodError || (error instanceof Error && ["MONEY_LIMIT", "INVALID_RATE"].includes(error.message))) return response({ error: "Invalid financial amount or exchange rate" }, 400)
  return response({ error: "Shipment accounting operation failed" }, 500)
}

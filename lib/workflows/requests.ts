import { z } from "zod"
import { usableAccountDocument } from "@/lib/account-documents"
import { canOperateRequest } from "../requests/access"
import { canonicalServiceStatus, serviceStatuses, serviceTransitions, serviceLabels, serviceStatusLabels } from "../requests/progress"
import { publishedRequestInvoice } from "../requests/published-invoice"
import { WorkflowStore, body, reject, response, timestamped, notification, now, validDate, fields, requireStaff, requireCustomer, own, paging } from "./runtime"
import type { Actor, Snapshot, WorkflowInput, Change, Data } from "./runtime"
import { newRequestNumber } from "../references/numbering"
import { validShippingOperation } from "../requests/operation-type"
import {progressivePricingSchema,priceQuoteRows} from "../finance/progressive-pricing"
import {minor,decimal} from "../shipments/accounting"
import {serviceStages} from "../requests/tracking"

const createSchema = z.object({
  services: z.array(z.object({ serviceKey: z.string().trim().min(1), details: z.any().optional() })).min(1).max(20),
  operationType: z.enum(["import", "export", "transit", "none"]).default("none"),
  subject: z.string().trim().min(3), description: z.string().trim().min(5),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
}).refine(validShippingOperation, { message: "Choose import, export or transit for shipping/customs services", path: ["operationType"] })
const requestStatuses = ["submitted", "document_required", "document_under_review", "quote_pending", "quote_provided", "quote_accepted", "processing", "completed", "cancelled"]
const timeline = (actor: Actor, status: string, title: string, comment: string) => ({ status, title, comment, updatedBy: actor.user._id, createdAt: now() })
const notifyRequest = (request: Snapshot | Data, title: string, message: string, extra = {}) => {
  const data = "table" in request ? (request as Snapshot).data : request as Data
  return notification({ recipientCustomerId: data.customerId, title, message, relatedRequestId: data._id, actionUrl: "/portal/requests", ...extra })
}
const closed = (request: Snapshot) => ["processing", "completed", "cancelled", "quote_accepted"].includes(request.data.status)

export async function requestServices(store: WorkflowStore, request: Snapshot): Promise<Snapshot[]> {
  const records: Snapshot[] = []
  for (const id of request.data.services || []) {
    const service = await store.read("request_services", id)
    if (!service || service.data.requestId !== request.id) return reject(409, "Request/service relationship requires migration review")
    records.push(service)
  }
  return records
}
export async function populatedRequest(store: WorkflowStore, request: Snapshot, admin = false) {
  const services = (await requestServices(store, request)).map(service => service.data)
  if (!admin) {
    const safe={...request.data}
    delete safe.invoiceLinkUpdatedAt;delete safe.workflowDecidedBy
    return { ...safe, services, publishedInvoice:await publishedRequestInvoice(store,request.id,request.data.customerId) }
  }
  const customer = await store.read("customers", request.data.customerId)
  const requester = request.data.requestedBy ? await store.read("users", request.data.requestedBy) : null
  return { ...request.data, services,
    customerId: customer ? fields(customer.data, ["_id", "customerCode", "companyName", "contactEmail", "contactPhone"]) : null,
    requestedBy: requester ? fields(requester.data, ["_id", "firstName", "lastName", "name", "email"]) : null }
}
export async function latestQuote(store: WorkflowStore, requestId: string) {
  return (await store.list("quotes", "requestId = ?", [requestId], "json_extract(data, '$.createdAt') DESC, id DESC"))[0] ?? null
}
export const quoteItems = (store: WorkflowStore, quote: Snapshot) => store.list("quote_items", "quoteId = ? AND json_extract(data, '$.isArchived') IS NOT 1", [quote.id])

export async function handleRequests(store: WorkflowStore, actor: Actor, args: WorkflowInput) {
  const { action, request: http, id } = args
  const url = new URL(http.url)
  const staffAction = action.startsWith("admin-") || action.startsWith("pricing-") || action === "operations" || action === "service-status"
  if (staffAction) requireStaff(actor.user)
  else requireCustomer(actor)

  if (action === "request-confirm-documents") {
    const customer = requireCustomer(actor)
    const parent = id ? await store.read("customer_requests", id) : null
    if (!parent || parent.data.customerId !== customer.id) return reject(404, "Request not found")
    if (parent.data.details?.accountDocumentsConfirmedAt) return response({ success: true })
    if (parent.data.status !== "document_required") return reject(409, "Request no longer requires documents")
    const documents = (await store.list("documents", "customerId = ? AND isArchived = 0", [customer.id])).filter(({ data }) => usableAccountDocument({ entityType: data.entityType, status: data.status, isArchived: data.isArchived, expiryDate: data.expiryDate }))
    if (!documents.length) return reject(400, "No valid verified account documents")
    const patch = { status: "document_under_review", details: { ...parent.data.details, accountDocumentIds: documents.map(doc => doc.id), accountDocumentsConfirmedAt: now() },
      timeline: [...(parent.data.timeline || []), timeline(actor, "document_under_review", "Account Documents Confirmed", "Customer confirmed use of verified account documents for this request.")] }
    await store.commit({ checks: [actor.snapshot, ...documents], updates: [{ before: parent, patch }] })
    return response({ success: true })
  }

  if (action === "request-create") {
    const customer = requireCustomer(actor)
    if (["inactive", "unverified", "under_review"].includes(customer.data.accountStatus) || !actor.user.emailVerified) reject(403, "Account verification is required before requesting services")
    const input = await body(args)
    if (!input.services && input.serviceType) input.services = [{ serviceKey: input.serviceType, details: input.details || {} }]
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) return response({ error: parsed.error.issues[0]?.message || "Invalid request" }, 400)
    const configs = await store.list("service_configs")
    const validKeys = configs.length ? configs.filter(config => config.data.isActive !== false).map(config => config.data.serviceKey)
      : ["sea_freight", "air_freight", "land_freight", "customs_clearance", "warehousing", "inland_transportation", "general_inquiry"]
    if (parsed.data.services.some(service => !validKeys.includes(service.serviceKey))) reject(400, "Invalid or inactive service")
    const status = parsed.data.operationType === "none" ? "submitted" : "document_required"
    const numbering = await newRequestNumber(store.db, customer)
    const trackingNumber = numbering.trackingNumber
    const record = timestamped({ customerId: customer.id, requestedBy: actor.user._id, ...numbering,
      ...fields(parsed.data, ["operationType", "subject", "description", "priority"]), status, services: [], details: {}, attachments: [], assignedStaffId: null, complianceType: null, complianceNumber: "",ucrStatus:parsed.data.services.some(service=>service.serviceKey==="customs_clearance")?"pending":"not_required",
      timeline: [timeline(actor, "submitted", "Request Submitted by Client", "Initial order inquiry received."), ...(status === "document_required" ? [timeline(actor, status, "Document Required", "Please upload the required documents (UCR/ACID) to proceed.")] : [])] })
    const services = parsed.data.services.map(service => timestamped({ requestId: record._id, serviceKey: service.serviceKey, details: service.details || {}, status: "pending", timeline: [timeline(actor, "pending", "Service Added", "Service selected during request creation.")] }))
    record.services = services.map(service => service._id)
    await store.commit({ checks: [actor.snapshot, customer, ...configs], inserts: [
      { table: "customer_requests", data: record }, ...services.map(data => ({ table: "request_services" as const, data })),
      { table: "notifications", data: notifyRequest(record, `New Service Request: ${trackingNumber}`, `${actor.user.firstName} requested services.`, { targetAudience: "staff" }) },
      { table: "notifications", data: notifyRequest(record, `تم استلام طلبك بنجاح — ${trackingNumber}`, "تم تقديم طلب الخدمة وهو الآن قيد المراجعة.", { recipientUserId: actor.user._id }) },
    ] })
    return response({ success: true, message: "Service request submitted successfully", request: record }, 201)
  }

  if (action === "requests-list" || action === "admin-requests-list") {
    const { limit } = paging(url, action.startsWith("admin") ? 50 : 20)
    const status = url.searchParams.get("status")
    let rows = action === "requests-list" ? await store.list("customer_requests", "customerId = ?", [actor.customer!.id], "json_extract(data, '$.createdAt') DESC, id DESC")
      : await store.list("customer_requests", status && status !== "all" ? "status = ?" : "1=1", status && status !== "all" ? [status] : [], "json_extract(data, '$.createdAt') DESC, id DESC")
    if (action === "admin-requests-list") rows = rows.slice(0, limit)
    return response({ requests: await Promise.all(rows.map(row => populatedRequest(store, row, staffAction))) })
  }

  if (action === "quotes-list" || action === "admin-quotes-list") {
    const requestId = url.searchParams.get("requestId")
    const rows = staffAction ? await store.list("quotes", requestId ? "requestId = ?" : "1=1", requestId ? [requestId] : [], "json_extract(data, '$.createdAt') DESC, id DESC")
      : await store.list("quotes", "customerId = ?", [actor.customer!.id], "json_extract(data, '$.createdAt') DESC, id DESC")
    if (staffAction && requestId) {
      const quote = rows[0]
      return response({ success: true, quote: quote?.data ?? null, items: quote ? (await quoteItems(store, quote)).map(item => item.data) : [] })
    }
    const quotes = []
    for (const quote of rows) {
      const parent = await store.read("customer_requests", quote.data.requestId)
      if (!parent || parent.data.customerId !== quote.data.customerId) reject(409, "Quote ownership requires migration review")
      const client = staffAction ? await store.read("customers", quote.data.customerId) : null
      quotes.push({ ...quote.data, requestId: fields(parent.data, ["_id", "trackingNumber", "subject", "operationType", "origin", "destination", "status"]),
        ...(staffAction ? { customerId: client ? fields(client.data, ["_id", "companyName", "contactEmail", "contactPhone"]) : null } : { requestNumber: parent.data.trackingNumber || "-", items: (await quoteItems(store, quote)).map(item => item.data) }) })
    }
    return response({ success: true, quotes })
  }

  if (action === "quote-get" || action === "quote-accept" || action === "quote-reject" || action === "quote-action") {
    const quote = id ? await store.read("quotes", id) : null
    if (!quote) return reject(404, "Quote not found")
    own(actor, quote)
    const parent = await store.read("customer_requests", quote.data.requestId)
    if (!parent) return reject(409, "Quote request is missing")
    own(actor, parent)
    if (action === "quote-get") return response({ success: true, quote: quote.data, items: (await quoteItems(store, quote)).map(item => item.data) })
    if (parent.data.quoteRequired === false) reject(409, "This request uses direct processing without a quotation")
    const input = args.input || (http.body ? await body(args) : {})
    const decision = action === "quote-accept" ? "accept" : action === "quote-reject" ? "reject" : input.action
    if (!["accept", "reject"].includes(decision)) reject(400, "Invalid action")
    const latest = await latestQuote(store, parent.id)
    if (latest?.id !== quote.id || quote.data.status !== "sent" || Date.parse(quote.data.validUntil) <= Date.now() || !Number.isFinite(Date.parse(quote.data.validUntil)) || closed(parent)) reject(409, "Quote is expired, superseded or no longer awaiting a decision")
    const status = decision === "accept" ? "quote_accepted" : "quote_pending"
    const services = await requestServices(store, parent)
    const lines=await quoteItems(store,quote)
    if(lines.some(line=>!services.some(service=>line.data.requestServiceId?service.id===line.data.requestServiceId&&service.data.serviceKey===line.data.serviceKey:service.data.serviceKey===line.data.serviceKey)))reject(409,"Quotation service relationship requires review")
    const offered=[...new Set(lines.length?lines.map(line=>line.data.serviceKey):services.map(service=>service.data.serviceKey))] as string[]
    const selection=z.array(z.string()).min(1).max(20).safeParse(input.acceptedServices??offered)
    if(decision==="accept"&&(!selection.success||new Set(selection.data).size!==selection.data.length||selection.data.some(key=>!offered.includes(key))))reject(400,"Choose valid offered services")
    const acceptedServices=decision==="accept"&&selection.success?selection.data:[]
    const rejectedServices=offered.filter(key=>!acceptedServices.includes(key))
    if(decision==="accept"&&!lines.length&&rejectedServices.length)reject(409,"This legacy quote needs itemized pricing before partial acceptance")
    const acceptedServiceIds=services.filter(service=>acceptedServices.includes(service.data.serviceKey)).map(service=>service.id)
    const acceptedAmount=decision==="accept"?(lines.length?Number(decimal(lines.filter(line=>acceptedServices.includes(line.data.serviceKey)).reduce((sum,line)=>sum+minor(String(line.data.finalPrice)),BigInt(0)))):quote.data.totalAmount):0
    const updatedQuote = { status: decision === "accept" ? rejectedServices.length?"partially_accepted":"accepted" : "rejected",acceptedServices,rejectedServices,acceptedAmount }
    // Freeze the issued reference on each quote; legacy fallback is scoped to its own request.
    const compliance = Object.prototype.hasOwnProperty.call(quote.data, "complianceReference") ? quote.data.complianceReference
      : parent.data.complianceNumber ? { type: parent.data.complianceType, number: parent.data.complianceNumber } : null
    await store.commit({ checks: [actor.snapshot, actor.customer!, ...services,...lines], updates: [
      { before: quote, patch: updatedQuote },
      { before: parent, patch: { status,...(decision==="accept"?{acceptedServiceIds,acceptedQuoteId:quote.id}:{}), timeline: [...(parent.data.timeline || []), timeline(actor, status, decision === "accept" ? "Quote Accepted" : "Quote Rejected", input.message || `Customer ${decision}ed quote ${quote.data.quoteNumber}.`)] } },
      ...(decision === "accept" ? services.map(service => {const accepted=acceptedServiceIds.includes(service.id),serviceStatus=accepted?"active":"cancelled";return { before: service, patch: { status: serviceStatus, ...(accepted?{trackingStages:serviceStages({...service.data,status:"active"} as any)}:{}), timeline: [...(service.data.timeline || []), timeline(actor, serviceStatus, accepted?"Service Activated":"Service not accepted", `Quote ${quote.data.quoteNumber}`)] } }}) : []),
    ], inserts: [{ table: "notifications", data: notifyRequest(parent, decision === "accept" ? "Quote Accepted" : "Quote Rejected", `Customer ${decision}ed quote ${quote.data.quoteNumber}. Accepted: ${acceptedServices.join(", ") || "—"}. Not accepted: ${rejectedServices.join(", ") || "—"}.`, { targetAudience: "all_staff", severity: decision === "accept" ? "normal" : "warning", actionUrl: `/admin/requests/${parent.id}` }) },
      ...(decision === "accept" ? [{ table: "notifications" as const, data: notifyRequest(parent, "تم قبول عرض السعر / Quotation accepted", `${quote.data.quoteNumber}${compliance?.number ? ` — ${compliance.type}: ${compliance.number}` : ""}`, { recipientUserId: actor.user._id, actionUrl: `/portal/requests/${parent.id}` }) }] : [])] })
    return response({ success: true, message: decision === "accept" ? "Quote accepted successfully" : "Quote rejected", quote: { ...quote.data, ...updatedQuote }, requestStatus: status, ...(decision === "accept" ? { complianceReference: compliance } : {}) })
  }

  if (action === "admin-quote-save") {
    const input = await body(args)
    const schema = z.object({ requestId: z.string().min(1), customerId: z.string().min(1), quoteId: z.string().optional(), validUntil: z.string().optional(), currency: z.string().trim().length(3).optional(), notes: z.string().optional(),
      items: z.array(z.object({ _id: z.string().optional(), id: z.string().optional(), requestServiceId: z.string().optional(), serviceKey: z.string().min(1), basePrice: z.coerce.number().finite().nonnegative().default(0), additionalCharges: z.coerce.number().finite().nonnegative().default(0), discount: z.coerce.number().finite().nonnegative().default(0), finalPrice: z.coerce.number().finite().nonnegative().refine(value=>/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(String(value)), "Use a price with at most two decimal places"), note: z.string().optional(), breakdown: z.array(z.object({ description: z.string(), basePrice: z.coerce.number().finite(), additionalCharges: z.coerce.number().finite().default(0), progressivePricing:progressivePricingSchema.optional() })).default([]) })).min(1).max(20) })
    const parsed = schema.safeParse(input)
    if (!parsed.success) return response({ error: "Invalid quotation", details: parsed.error.flatten() }, 400)
    const data = parsed.data
    for(const item of data.items)if(item.breakdown.some(row=>row.progressivePricing)){try{Object.assign(item,priceQuoteRows(item.breakdown,item.discount))}catch{return reject(400,"Invalid progressive prices or total")}}
    const parent = await store.read("customer_requests", data.requestId)
    if (!parent) return reject(404, "Request not found")
    if (parent.data.quoteRequired === false) reject(409, "This request uses direct processing without a quotation")
    if (parent.data.customerId !== data.customerId) reject(403, "Quote customer does not match its request")
    if (closed(parent)) reject(409, "Request no longer accepts quotations")
    const services = await requestServices(store, parent)
    for (const item of data.items) if (item.requestServiceId && !services.some(service => service.id === item.requestServiceId && service.data.serviceKey === item.serviceKey)) reject(400, "Quote item belongs to another request or service")
    const quote = data.quoteId ? await store.read("quotes", data.quoteId) : await latestQuote(store, parent.id)
    if (data.quoteId && !quote) reject(404, "Quote not found")
    if (quote && (quote.data.requestId !== parent.id || quote.data.customerId !== parent.data.customerId)) reject(403, "Quote relationship mismatch")
    if (quote && !["draft", "sent", "rejected", "expired"].includes(quote.data.status)) reject(409, "Accepted quotations cannot be rewritten")
    data.currency = data.currency || quote?.data.currency || "EGP"
    const validUntil = data.validUntil ? validDate(data.validUntil) : quote?.data.validUntil || new Date(Date.now() + 7 * 86400000).toISOString()
    if (Date.parse(validUntil) <= Date.now()) reject(400, "Quote validity must be in the future")
    const totalAmount = Number(decimal(data.items.reduce((sum, item) => sum + minor(String(item.finalPrice)), BigInt(0))))
    if (!Number.isFinite(totalAmount)) reject(400, "Invalid quotation total")
    const record = quote ? { ...quote.data, totalAmount, currency: data.currency, validUntil, status: "sent", ...(data.notes !== undefined ? { notes: data.notes } : {}) }
      : timestamped({ requestId: parent.id, customerId: parent.data.customerId, quoteNumber: await store.nextNumber("quote"), totalAmount, currency: data.currency, validUntil, notes: data.notes || "", status: "sent", createdBy: actor.user._id })
    record.complianceReference = parent.data.complianceNumber ? { type: parent.data.complianceType, number: parent.data.complianceNumber } : null
    const existing = quote ? await quoteItems(store, quote) : []
    const used = new Set<string>()
    const updates: Change[] = [{ before: parent, patch: { status: "quote_provided", timeline: [...(parent.data.timeline || []), timeline(actor, "quote_provided", quote ? "Quote Updated" : "Quote Provided", `Quote ${record.quoteNumber} (${totalAmount} ${data.currency}) sent for review.`)] } }]
    if (quote) updates.push({ before: quote, patch: record })
    const inserts: { table: "quotes" | "quote_items" | "notifications"; data: Data }[] = quote ? [] : [{ table: "quotes", data: record }]
    for (const item of data.items) {
      const explicitId = item._id || item.id
      const matches = existing.filter(old => !used.has(old.id) && (explicitId ? old.id === explicitId : item.requestServiceId ? old.data.requestServiceId === item.requestServiceId : old.data.serviceKey === item.serviceKey))
      if (explicitId && matches.length !== 1) reject(400, "Quote item does not belong to this quotation")
      const old = matches.length === 1 ? matches[0] : null
      if (old) used.add(old.id)
      const progressive=item.breakdown.some(row=>row.progressivePricing)
      const applied=progressive?priceQuoteRows(item.breakdown,item.discount):null
      const patch = { ...fields(item, ["serviceKey", "basePrice", "additionalCharges", "discount", "finalPrice", "breakdown", "note"]), isTiered:progressive&&item.discount===0,tiers:progressive&&item.discount===0?applied!.tiers:[], requestServiceId: item.requestServiceId || null, currency: data.currency,
        auditTrail: [...(old?.data.auditTrail || []), { updatedBy: actor.user._id, previousPrice: old?.data.finalPrice ?? 0, newPrice: item.finalPrice, reason: quote ? "Quote Updated" : "Initial Quote Generation", date: now() }] }
      if (old) updates.push({ before: old, patch })
      else inserts.push({ table: "quote_items", data: timestamped({ quoteId: record._id, ...patch }) })
    }
    // Preserve removed line items and their full audit history instead of deleting them.
    updates.push(...existing.filter(old => !used.has(old.id)).map(before => ({ before, patch: { isArchived: true, retiredAt: now() } })))
    inserts.push({ table: "notifications", data: notifyRequest(parent, quote ? `Quote Updated: ${record.quoteNumber}` : `New Quote Available: ${record.quoteNumber}`, `A quote of ${totalAmount} ${data.currency} is available for your request.`) })
    await store.commit({ checks: [actor.snapshot, ...services], updates, inserts })
    return response({ success: true, quote: record }, quote ? 200 : 201)
  }

  if (action === "operations") {
    const rows = await store.list("request_services", "status NOT IN ('completed','cancelled')", [], "json_extract(data, '$.updatedAt') DESC")
    const data = []
    for (const row of rows) {
      const parent = await store.read("customer_requests", row.data.requestId)
      data.push({ ...row.data, requestId: parent ? await populatedRequest(store, parent, true) : null })
    }
    return response({ success: true, data })
  }
  if (action === "service-status") {
    const service = id ? await store.read("request_services", id) : null
    if (!service) return reject(404, "Service not found")
    const parent = await store.read("customer_requests", service.data.requestId)
    if (!parent || !(parent.data.services || []).includes(service.id)) reject(409, "Service is not linked to its request")
    if (!canOperateRequest(actor, parent.data)) reject(403, "Only an administrator or the assigned employee can update services")
    if (http.headers.get("origin") !== url.origin) reject(403, "Invalid origin")
    if(Array.isArray(parent.data.acceptedServiceIds)&&!parent.data.acceptedServiceIds.includes(service.id))reject(409,"This service was not accepted in the quotation")
    const parsed = z.object({ status: z.enum(serviceStatuses), revision: z.number().int().nonnegative(), title: z.string().trim().max(200).optional(), comment: z.string().trim().max(1000).default("") }).strict().safeParse(await body(args))
    if (!parsed.success) reject(400, "Invalid service status update")
    const input=parsed.data, previous=canonicalServiceStatus(service.data.status)
    if(input.revision!==service.revision) reject(409,"Service changed. Reload before saving")
    if(input.status===previous) return response({success:true,service:service.data})
    if(parent.data.status==="cancelled") reject(409,"Cancelled requests cannot be changed")
    if(input.status==="completed"&&Array.isArray(service.data.trackingStages)&&service.data.trackingStages.some((stage:any)=>stage.status!=="completed"))reject(409,"Complete all execution stages first")
    if(!serviceTransitions[previous]?.includes(input.status)) reject(409,"Invalid service status transition")
    if(["completed","cancelled"].includes(previous) && (actor.user.role!=="super_admin" || !input.comment)) reject(403,"An administrator and a correction reason are required to reopen a service")
    if(["active","completed"].includes(input.status) && !["processing","completed"].includes(parent.data.status)) reject(409,"Begin request processing before updating service progress")
    const services=await requestServices(store,parent)
    const statuses=services.map(row=>row.id===service.id?input.status:canonicalServiceStatus(row.data.status))
    const finished=statuses.every(status=>["completed","cancelled"].includes(status)) && statuses.includes("completed")
    const status=finished?"completed":parent.data.status==="completed"?"processing":parent.data.status
    const names=serviceLabels[service.data.serviceKey]??[service.data.serviceKey,service.data.serviceKey]
    const state=serviceStatusLabels[input.status]
    const title=`${names[0]}: ${state[0]} / ${names[1]}: ${state[1]}`
    const patch = { status: input.status, timeline: [...(service.data.timeline || []), timeline(actor, input.status, title, input.comment)] }
    const parentPatch={status,timeline:[...(parent.data.timeline||[]),timeline(actor,status,title,input.comment)]}
    await store.commit({ checks: [actor.snapshot,...services.filter(row=>row.id!==service.id)], updates: [{ before: service, patch },{before:parent,patch:parentPatch}],
      inserts:[{table:"notifications",data:notifyRequest(parent,title,`${parent.data.trackingNumber}: ${title}${input.comment?` — ${input.comment}`:""}`,{actionUrl:`/portal/requests/${parent.id}`})}] })
    return response({ success: true, service: { ...service.data, ...patch } })
  }
  if (action.startsWith("pricing-")) {
    const input = action === "pricing-list" || action === "pricing-delete" ? {} : await body(args)
    if (action === "pricing-list") return response({ success: true, data: (await store.list("pricing_rules", "json_extract(data, '$.isArchived') IS NOT 1", [], "json_extract(data, '$.createdAt') DESC")).map(row => row.data) })
    const existing = id ? await store.read("pricing_rules", id) : null
    if (action !== "pricing-create" && !existing) return reject(404, "Pricing rule not found")
    if (action === "pricing-delete") {
      await store.commit({ checks: [actor.snapshot], updates: [{ before: existing!, patch: { isActive: false, isArchived: true } }] })
      return response({ success: true, data: existing!.data })
    }
    const schema = z.object({ serviceKey: z.string().min(1), pricingType: z.enum(["fixed", "route_based", "manual"]).default("manual"), defaultPrice: z.number().finite().nonnegative().default(0), currency: z.string().length(3).default("EGP"), routeInfo: z.object({ origin: z.string().nullable().optional(), destination: z.string().nullable().optional() }).optional(), notes: z.string().optional(), isActive: z.boolean().default(true) })
    const parsed = schema.safeParse({ ...existing?.data, ...input })
    if (!parsed.success) return reject(400, "Invalid pricing rule")
    const record = existing ? { ...existing.data, ...parsed.data } : timestamped(parsed.data)
    await store.commit({ checks: [actor.snapshot], updates: existing ? [{ before: existing, patch: parsed.data }] : [], inserts: existing ? [] : [{ table: "pricing_rules", data: record }] })
    return response({ success: true, data: record }, existing ? 200 : 201)
  }

  const parent = id ? await store.read("customer_requests", id) : null
  if (!parent) return reject(404, "Request not found")
  if (!staffAction) own(actor, parent)
  if(action==="request-tracking"||action==="admin-request-tracking"){
    const services=(await requestServices(store,parent)).filter(service=>service.data.status!=="cancelled"&&(!Array.isArray(parent.data.acceptedServiceIds)||parent.data.acceptedServiceIds.includes(service.id)))
    if(http.method==="GET")return response({canManage:staffAction&&canOperateRequest(actor,parent.data),serviceTracking:services.map(service=>{const stages=serviceStages(service.data as any);return {serviceId:service.id,serviceKey:service.data.serviceKey,revision:service.revision,stages,currentStageIndex:stages.findIndex(stage=>stage.status!=="completed"),isCompleted:stages.every(stage=>stage.status==="completed")}})})
    if(!staffAction||!canOperateRequest(actor,parent.data))reject(403,"Only the responsible employee may update service stages")
    if(http.headers.get("origin")!==url.origin)reject(403,"Invalid origin")
    if(!["processing","completed"].includes(parent.data.status))reject(409,"Begin processing before updating service stages")
    const parsed=z.object({serviceId:z.string(),stageKey:z.string(),status:z.enum(["not_started","in_progress","completed"]),revision:z.number().int().nonnegative(),staffNote:z.string().trim().max(1000).default("")}).strict().safeParse(await body(args))
    if(!parsed.success)reject(400,"Invalid stage update")
    const input=parsed.data,service=services.find(service=>service.id===input.serviceId)
    if(!service)reject(404,"Service not found")
    if(service.revision!==input.revision)reject(409,"Service changed. Reload first")
    const stages=serviceStages(service.data as any),index=stages.findIndex(stage=>stage.stageKey===input.stageKey)
    if(index<0)reject(400,"Invalid service stage")
    if(stages[index].status==="completed"&&input.status!=="completed"&&(actor.user.role!=="super_admin"||!input.staffNote))reject(403,"An administrator and correction note are required to reopen a completed stage")
    if(input.status!=="not_started"&&stages.slice(0,index).some(stage=>stage.status!=="completed"))reject(409,"Complete earlier stages first")
    if(service.data.serviceKey==="customs_clearance"&&index===0&&input.status==="completed"&&!parent.data.complianceNumber)reject(409,"Provide UCR before completing this stage")
    const reopening=stages[index].status==="completed"&&input.status!=="completed"
    const next=stages.map((stage,i)=>i===index?{...stage,status:input.status,completedAt:input.status==="completed"?now():null,staffNote:input.staffNote,staffNoteAt:now(),staffName:`${actor.user.firstName} ${actor.user.lastName}`,updatedBy:actor.user._id}:reopening&&i>index?{...stage,status:"not_started" as const,completedAt:null}:stage)
    const done=next.every(stage=>stage.status==="completed"),nextStatus=done?"completed":"active"
    const all=await requestServices(store,parent),finished=all.every(row=>row.id===service.id?done:["completed","cancelled"].includes(row.data.status))
    const status=finished?"completed":"processing",label=stages[index].labelAr
    const title=`${input.status==="completed"?"تم إنجاز":"تحديث مرحلة"}: ${label}`
    await store.commit({checks:[actor.snapshot,...all.filter(row=>row.id!==service.id)],updates:[{before:service,patch:{status:nextStatus,trackingStages:next,timeline:[...(service.data.timeline||[]),timeline(actor,nextStatus,title,input.staffNote)]}},{before:parent,patch:{status,timeline:[...(parent.data.timeline||[]),timeline(actor,status,title,input.staffNote)]}}],inserts:[{table:"notifications",data:notifyRequest(parent,title,`${parent.data.trackingNumber}${input.staffNote?` — ${input.staffNote}`:""}`,{actionUrl:`/portal/requests/${parent.id}`})}]})
    return response({success:true})
  }
  if(action==="admin-request-ucr"||action==="request-ucr"){
    const services=await requestServices(store,parent),required=services.some(service=>service.data.serviceKey==="customs_clearance"&&service.data.status!=="cancelled")
    const state={required,status:required?parent.data.ucrStatus||(parent.data.complianceNumber?"provided_by_admin":"pending"):"not_required",value:parent.data.ucrValue||parent.data.complianceNumber||"",source:parent.data.ucrSource||null,revision:parent.revision,canManage:staffAction&&canOperateRequest(actor,parent.data)}
    if(http.method==="GET")return response(state)
    if(http.headers.get("origin")!==url.origin)reject(403,"Invalid origin")
    if(!required)reject(409,"Customs clearance is not part of this request")
    if(["completed","cancelled"].includes(parent.data.status))reject(409,"Request is closed")
    if(staffAction&&!canOperateRequest(actor,parent.data))reject(403,"Only the responsible employee may manage UCR")
    const parsed=z.object({revision:z.number().int().nonnegative(),mode:z.enum(["provide","request"]).optional(),value:z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} /_.-]+$/u).optional()}).strict().safeParse(await body(args))
    if(!parsed.success)reject(400,"Invalid customs reference")
    if(parsed.data.revision!==parent.revision)reject(409,"Request changed. Reload first")
    const requesting=staffAction&&parsed.data.mode==="request"
    if(!staffAction&&state.status!=="requested_from_customer")reject(409,"The team has not requested a customer UCR")
    if(!requesting&&!parsed.data.value)reject(400,"Enter the UCR number")
    const patch=requesting?{ucrStatus:"requested_from_customer",ucrValue:null,ucrSource:null,ucrSubmittedAt:null,complianceNumber:"",complianceType:"UCR"}
      :{ucrStatus:staffAction?"provided_by_admin":"submitted_by_customer",ucrValue:parsed.data.value,ucrSource:staffAction?"admin":"customer",ucrSubmittedAt:now(),complianceType:"UCR",complianceNumber:parsed.data.value}
    const title=requesting?"مطلوب رقم UCR / UCR requested":staffAction?"تم تعيين UCR / UCR provided":"تم استلام UCR من العميل / Customer UCR received"
    const message=requesting?`يرجى تقديم رقم UCR للطلب ${parent.data.trackingNumber}.`:`${parent.data.trackingNumber} — UCR: ${parsed.data.value}`
    const quote=await latestQuote(store,parent.id)
    const quoteUpdate=quote&&["sent","accepted","partially_accepted"].includes(quote.data.status)?[{before:quote,patch:{complianceReference:requesting?null:{type:"UCR",number:parsed.data.value},complianceUpdatedAt:now()}}]:[]
    await store.commit({checks:[actor.snapshot,...services],updates:[{before:parent,patch:{...patch,timeline:[...(parent.data.timeline||[]),timeline(actor,parent.data.status,title,message)]}},...quoteUpdate],inserts:[{table:"notifications",data:notifyRequest(parent,title,message,{targetAudience:staffAction?"customer":"all_staff",actionUrl:`/${staffAction?"portal":"admin"}/requests/${parent.id}`})}]})
    return response({success:true})
  }
  if (action === "admin-request-workflow") {
    const canManage = canOperateRequest(actor, parent.data)
    if (http.method === "GET") {
      const staffOptions=actor.user.role==="super_admin"?(await store.list("users","role IN ('staff','super_admin') AND status='active'",[],"id")).map(row=>({_id:row.id,name:`${row.data.firstName} ${row.data.lastName}`.trim()})):[]
      return response({ canManage, canAssign:actor.user.role==="super_admin", staffOptions, quoteRequired: parent.data.quoteRequired !== false, revision: parent.revision,
        services:(await requestServices(store,parent)).map(row=>({_id:row.id,serviceKey:row.data.serviceKey,status:row.data.status,revision:row.revision,timeline:row.data.timeline??[]})) }, 200)
    }
    if (!canManage) reject(403, "Only an administrator or the assigned employee can change the request workflow")
    if (http.headers.get("origin") !== url.origin) reject(403, "Invalid origin")
    const input = z.object({ quoteRequired: z.boolean().optional(), assignedStaffId:z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(), revision: z.number().int().nonnegative() }).strict().safeParse(await body(args))
    if (!input.success) reject(400, "Invalid workflow settings")
    if(input.data.quoteRequired===undefined && input.data.assignedStaffId===undefined) reject(400,"No workflow change provided")
    if (input.data.revision !== parent.revision) reject(409, "Request changed. Reload before changing the workflow")
    const modeChanged=input.data.quoteRequired!==undefined && input.data.quoteRequired!==(parent.data.quoteRequired!==false)
    const assignmentChanged=input.data.assignedStaffId!==undefined && input.data.assignedStaffId!==(parent.data.assignedStaffId??null)
    if(!modeChanged&&!assignmentChanged) return response({success:true})
    if(modeChanged&&closed(parent)) reject(409, "The workflow cannot change after acceptance or processing starts")
    if(assignmentChanged&&actor.user.role!=="super_admin") reject(403,"Only an administrator can assign the responsible employee")
    const assigned=input.data.assignedStaffId?await store.read("users",input.data.assignedStaffId):null
    if(assignmentChanged&&input.data.assignedStaffId&&(!assigned||!["staff","super_admin"].includes(assigned.data.role)||assigned.data.status!=="active")) reject(400,"Choose an active staff account")
    const status = modeChanged&&!input.data.quoteRequired && ["quote_pending", "quote_provided", "quote_rejected"].includes(parent.data.status) ? "submitted" : parent.data.status
    const title = modeChanged?(input.data.quoteRequired ? "Quotation required / عرض سعر مطلوب" : "Direct processing / تنفيذ مباشر دون عرض سعر"):"Responsible employee assigned / تعيين الموظف المسؤول"
    const patch = { ...(modeChanged?{quoteRequired:input.data.quoteRequired}:{}),...(assignmentChanged?{assignedStaffId:input.data.assignedStaffId}:{}), status, workflowDecidedBy: actor.user._id, workflowDecidedAt: now(),
      timeline: [...(parent.data.timeline || []), timeline(actor, status, title, "Request workflow selected by authorized employee")] }
    await store.commit({ checks: [actor.snapshot,...(assigned?[assigned]:[])], updates: [{ before: parent, patch }] })
    return response({ success: true })
  }
  if (action === "admin-request-get") {
    const quote = await latestQuote(store, parent.id)
    return response({ request: {...await populatedRequest(store, parent, true),canOperate:canOperateRequest(actor,parent.data)}, quote: quote?.data ?? null, quoteItems: quote ? (await quoteItems(store, quote)).map(item => item.data) : [] })
  }
  if (action === "request-quotes" || action === "admin-request-quotes") {
    const quote = await latestQuote(store, parent.id)
    if (quote && quote.data.customerId !== parent.data.customerId) reject(409, "Quote ownership requires migration review")
    const items = quote ? await quoteItems(store, quote) : []
    const populated = []
    for (const item of items) {
      const service = item.data.requestServiceId ? await store.read("request_services", item.data.requestServiceId) : null
      if (service && service.data.requestId !== parent.id) reject(409, "Quote service relationship requires migration review")
      populated.push({ ...item.data, ...(action === "request-quotes" && item.data.requestServiceId ? { requestServiceId: service?.data ?? null } : {}) })
    }
    return response({ success: true, quote: quote?.data ?? null, items: populated })
  }
  if (action === "admin-request-price") {
    const services = await requestServices(store, parent)
    const data = []
    for (const service of services) {
      const rules = (await store.list("pricing_rules", "serviceKey = ? AND json_extract(data, '$.isActive') = 1 AND json_extract(data, '$.isArchived') IS NOT 1", [service.data.serviceKey])).map(rule => rule.data)
      const route = rules.find(rule => rule.pricingType === "route_based" && typeof service.data.details?.origin === "string" && typeof service.data.details?.destination === "string" && rule.routeInfo?.origin?.toLowerCase() === service.data.details.origin.toLowerCase() && rule.routeInfo?.destination?.toLowerCase() === service.data.details.destination.toLowerCase())
      const rule = route || rules.find(rule => rule.pricingType === "fixed")
      data.push({ serviceId: service.id, serviceKey: service.data.serviceKey, suggestedPrice: rule?.defaultPrice ?? null, currency: rule?.currency || "EGP", pricingType: rule?.pricingType || "manual", ...(rule?.notes ? { notes: rule.notes } : {}) })
    }
    return response({ success: true, data })
  }
  const input = action === "admin-request-confirm" ? {} : await body(args)
  if(["admin-request-status","admin-request-compliance","admin-request-confirm","admin-request-schedule"].includes(action)&&!canOperateRequest(actor,parent.data))reject(403,"Only an administrator or the assigned employee can update this request")
  let patch: Record<string, any> = {}
  let title = "Request Update"
  let message = "Your request has been updated."
  let targetAudience = "customer"
  const checks = [actor.snapshot]
  if (action === "admin-request-status") {
    if(!canOperateRequest(actor,parent.data)) reject(403,"Only an administrator or the assigned employee can update the request")
    if (!requestStatuses.includes(input.status)) reject(400, "Invalid status")
    if(input.status!==parent.data.status&&["processing","quote_accepted","quote_provided"].includes(input.status)) reject(409,"Use the dedicated processing or quotation workflow for this transition")
    if(input.status==="completed"&&(await requestServices(store,parent)).some(row=>!["completed","cancelled"].includes(canonicalServiceStatus(row.data.status)))) reject(409,"Complete the requested services first")
    patch.status = input.status
    title = String(input.status).replace(/_/g, " ")
    message = input.comment || `Your request "${parent.data.subject}" is now ${title}.`
  } else if (action === "admin-request-compliance" || action === "request-compliance") {
    if (!["ACID", "UCR"].includes(input.complianceType)) reject(400, "Invalid compliance type")
    if (action.startsWith("admin")) {
      if (typeof input.complianceNumber !== "string" || !input.complianceNumber.trim()) reject(400, "Compliance number is required")
      patch = { complianceType: input.complianceType, complianceNumber: input.complianceNumber.trim() }
      title = `${input.complianceType} Issued`; message = `The ${input.complianceType} number has been issued: ${patch.complianceNumber}.`
    } else { title = `${input.complianceType} Requested`; message = `Customer requested the ${input.complianceType} number for ${parent.data.trackingNumber}.`; targetAudience = "all_staff" }
  } else if (action === "admin-request-confirm") {
    if (parent.data.quoteRequired === false) {
      if (!canOperateRequest(actor, parent.data)) reject(403, "Only an administrator or the assigned employee can begin direct processing")
      if (["processing", "completed", "cancelled"].includes(parent.data.status)) reject(409, "Request is already processing or closed")
      const customs=(await requestServices(store,parent)).some(service=>service.data.serviceKey==="customs_clearance"&&service.data.status!=="cancelled")
      if(customs&&(!parent.data.complianceNumber?.trim()||(parent.data.operationType==="export"&&parent.data.complianceType!=="UCR")))reject(409,"Enter the applicable customs reference before direct processing")
    } else {
      const quote = await latestQuote(store, parent.id)
      if (parent.data.status !== "quote_accepted" || !quote || !["accepted","partially_accepted"].includes(quote.data.status) || quote.data.customerId !== parent.data.customerId) reject(409, "Request has no accepted quotation ready for confirmation")
      checks.push(quote)
    }
    patch.status = "processing"; title = "Order Confirmed & Processing Started"; message = `Your order ${parent.data.trackingNumber} is now actively processing.`
  } else if (action === "admin-request-schedule") {
    if (parent.data.quoteRequired === false) reject(409, "This request uses direct processing without a quotation")
    if (closed(parent)) reject(409, "Request no longer accepts quotations")
    const departureDate = validDate(input.departureDate), arrivalDate = validDate(input.arrivalDate)
    const price = Number(input.price)
    if (!Number.isFinite(price) || price <= 0 || departureDate > arrivalDate) reject(400, "Invalid schedule or price")
    patch = { details: { ...parent.data.details, quote: { ...fields(input, ["transitTime", "notes"]), departureDate, arrivalDate, price, currency: input.currency || "EGP", issuedAt: now(), issuedBy: actor.user._id } }, status: "quote_provided" }
    title = "Schedule & Quote Provided"; message = `A schedule has been provided for ${parent.data.trackingNumber}.`
  } else return reject(503, "Workflow has not been converted")
  patch.timeline = [...(parent.data.timeline || []), timeline(actor, patch.status || parent.data.status, title, message)]
  await store.commit({ checks, updates: [{ before: parent, patch }], inserts: [{ table: "notifications", data: notifyRequest(parent, title, message, { targetAudience, actionUrl: targetAudience === "all_staff" ? `/admin/requests/${parent.id}` : "/portal/requests" }) }] })
  return response({ success: true, request: { ...parent.data, ...patch }, ...(patch.complianceNumber ? { complianceNumber: patch.complianceNumber } : {}) })
}

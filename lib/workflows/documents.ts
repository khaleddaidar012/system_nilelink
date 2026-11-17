import { z } from "zod"
import { documentStorageKey } from "../storage/document-key.mjs"
import { createHash } from "node:crypto"
import { WorkflowStore, body, reject, response, timestamped, notification, now, validDate, fields, requireStaff, requireCustomer, own, paging, staff } from "./runtime"
import type { Actor, Snapshot, WorkflowInput, Change, Data } from "./runtime"
import { liveEmailConfigured } from "../email/readiness"
import { sendEmailWithReceipt } from "../email/send"

export interface WorkflowStorage {
  put(bytes: Buffer, key: string, mime: string, metadata: Record<string, string>): Promise<{ fileHash: string; fileSize: number }>
  get(key: string): Promise<{ body: unknown; contentType: string; contentLength: number }>
  remove(key: string): Promise<boolean>
}
export const defaultStorage: WorkflowStorage = {
  async put(bytes, key, mime) { return (await import("../storage/d1-preview-storage")).putPreviewFile(bytes, key, mime) },
  async get(key) { return (await import("../storage/d1-preview-storage")).readPreviewOrSourceFile(key) },
  async remove(key) { return (await import("../storage/d1-preview-storage")).removePreviewFile(key) },
}
export function documentHealth(documents: Data[], currentTime = Date.now(), previousStatus?: string) {
  documents = documents.filter(doc => doc.entityType !== "CustomerRequest")
  if (!documents.length && previousStatus === "active") return { status: "active", reason: "All company documents are verified and up to date." }
  if (!documents.length) return { status: "unverified", reason: "Account is not verified yet. Please upload required documents to begin verification." }
  const expired = documents.find(doc => doc.status === "expired" || (doc.expiryDate && Date.parse(doc.expiryDate) <= currentTime))
  if (expired) return { status: "inactive", reason: `Mandatory document (${expired.title}) has expired.` }
  const rejected = documents.find(doc => doc.status === "rejected")
  if (rejected) return { status: "inactive", reason: `Mandatory document (${rejected.title}) was rejected.` }
  const expiring = documents.filter(doc => doc.status === "expiring_soon" || (doc.expiryDate && Date.parse(doc.expiryDate) <= currentTime + 10 * 86400000)).sort((a, b) => Date.parse(a.expiryDate) - Date.parse(b.expiryDate))[0]
  if (expiring) return { status: "warning", reason: `${expiring.title} will expire in ${expiring.expiryDate ? Math.ceil((Date.parse(expiring.expiryDate) - currentTime) / 86400000) : 10} days.` }
  if (previousStatus !== "active" && documents.some(doc => doc.status === "pending_review" || !doc.status)) return { status: "under_review", reason: "Documents submitted and currently under review by compliance team." }
  return { status: "active", reason: "All company documents are verified and up to date." }
}
function activity(actor: Actor, http: Request, doc: Data, action: string, extra = {}) {
  return timestamped({ documentId: doc._id, customerId: doc.customerId, actorId: actor.user._id,
    actorType: staff(actor.user) ? "staff" : "customer", actorName: `${actor.user.firstName} ${actor.user.lastName}`,
    action, ipAddress: http.headers.get("x-forwarded-for")?.split(",")[0] || "", userAgent: http.headers.get("user-agent") || "", ...extra })
}
const documentView = (doc: Data) => ({ id: doc._id, ...fields(doc, ["title", "category", "fileName", "fileUrl", "fileSize", "mimeType", "status", "startDate", "expiryDate", "rejectionReason", "reviewNotes", "warningEscalationTier", "reviewedBy", "reviewedAt", "createdAt"]) })
function safeKey(key: unknown): string {
  if (typeof key !== "string" || !key || key.startsWith("/") || key.includes("\\") || key.includes("\0") || key.split("/").some(segment => segment === ".." || segment === ".")) return reject(409, "Document storage mapping requires migration review")
  return key
}

export async function handleDocuments(store: WorkflowStore, actor: Actor, args: WorkflowInput, storage: WorkflowStorage) {
  const { action, request: http, id } = args
  const url = new URL(http.url)
  if (action.startsWith("admin-")) requireStaff(actor.user, action === "admin-document-warning" ? "canSendAlerts" : "canReviewDocuments")
  else if (action !== "document-download") requireCustomer(actor)

  if (action === "document-upload") {
    const customer = requireCustomer(actor)
    const form = await http.formData().catch(() => reject(400, "Invalid upload form"))
    const files = form.getAll("files")
    const categories = form.getAll("categories")
    const titles = form.getAll("titles")
    if (!files.length || files.length > 20) reject(400, "Upload between 1 and 20 files")
    for (const file of files) {
      if (!(file instanceof File) || !file.name.trim() || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) reject(400, "Invalid file type or size (maximum 10MB)")
    }
    const current = await store.list("documents", "customerId = ? AND isArchived = 0", [customer.id])
    if (current.length + files.length > (customer.data.maxAllowedDocuments || 20)) reject(400, "Document quota exceeded")
    const entityId = form.get("entityId")
    const parent = entityId ? await store.read("customer_requests", String(entityId)) : null
    if (entityId && (!parent || parent.data.customerId !== customer.id)) reject(403, "Invalid document entity")
    const documents: Data[] = []
    const pending: string[] = []
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index] as File
        const doc = timestamped({ customerId: customer.id, uploadedBy: actor.user._id })
        const filename = file.name.replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "_").replace(/\s+/g, "_").slice(0, 100) || "document"
        const key = `clients/${customer.id}/documents/${doc._id}_${filename}`
        await store.db.prepare("INSERT INTO _nilelink_storage_pending (storageKey, ownerId, createdAt) VALUES (?, ?, ?)").bind(key, actor.user._id, now()).run()
        pending.push(key)
        const bytes = Buffer.from(await file.arrayBuffer())
        const expectedHash = createHash("sha256").update(bytes).digest("hex")
        const result = await storage.put(bytes, key, file.type, { customerId: customer.id, uploadedBy: actor.user._id, originalName: file.name })
        if (result.fileSize !== file.size || result.fileHash !== expectedHash) throw new Error("Storage integrity metadata is invalid")
        Object.assign(doc, { title: typeof titles[index] === "string" && String(titles[index]).trim() ? String(titles[index]).trim() : file.name.replace(/\.[^/.]+$/, ""), category: typeof categories[index] === "string" ? categories[index] : "other",
          fileName: file.name, storedFileName: `${doc._id}_${filename}`, storageKey: key, fileUrl: `/api/portal/documents/${doc._id}/download`,
          fileSize: result.fileSize, fileHash: result.fileHash, mimeType: file.type, entityType: parent ? "CustomerRequest" : "Customer", entityId: parent?.id || customer.id,
          status: "pending_review", warningEscalationTier: "none", isArchived: false, startDate: null, expiryDate: null, reviewedBy: null, reviewedAt: null })
        documents.push(doc)
      }
      const updates: Change[] = [{ before: customer, patch: {} }]
      if (parent?.data.status === "document_required") updates.push({ before: parent, patch: { status: "document_under_review", timeline: [...(parent.data.timeline || []), { status: "document_under_review", title: "Document Submitted", comment: "Pending staff review.", updatedBy: actor.user._id, createdAt: now() }] } })
      await store.commit({ checks: [actor.snapshot, ...(parent ? [parent] : [])], updates, inserts: [
        ...documents.map(data => ({ table: "documents" as const, data })),
        ...documents.map(doc => ({ table: "document_activity_logs" as const, data: activity(actor, http, doc, "upload", { newState: { title: doc.title, category: doc.category, status: doc.status } }) })),
        { table: "notifications", data: notification({ recipientCustomerId: customer.id, targetAudience: "staff", title: "New Documents Awaiting Review", message: `${customer.data.companyName} uploaded ${documents.length} document(s).`, type: "document_uploaded", actionUrl: "/admin/documents/review", ...(parent ? { relatedRequestId: parent.id } : {}) }) },
        { table: "notifications", data: notification({ recipientCustomerId: customer.id, recipientUserId: actor.user._id, title: `تم رفع ${documents.length} مستند(ات) بنجاح`, message: "تم رفع مستنداتك وهي الآن قيد المراجعة.", type: "document_uploaded", actionUrl: "/portal/documents" }) },
      ], extra: pending.map(key => store.db.prepare("DELETE FROM _nilelink_storage_pending WHERE storageKey = ? AND ownerId = ?").bind(key, actor.user._id)) })
    } catch (error) {
      // A timeout after commit is uncertain. Check the durable metadata before
      // deleting any newly uploaded object; retain the journal if D1 is down.
      let committed = false
      try {
        const references = await Promise.all(pending.map(key => store.list("documents", "storageKey = ?", [key])))
        committed = documents.length === files.length && references.length === files.length && references.every((rows, index) =>
          rows.length === 1 && rows[0].id === documents[index]._id && JSON.stringify(rows[0].data) === JSON.stringify(documents[index]))
        if (!committed) for (let index = 0; index < pending.length; index++) {
          if (!references[index].length && await storage.remove(pending[index])) await store.db.prepare("DELETE FROM _nilelink_storage_pending WHERE storageKey = ? AND ownerId = ?").bind(pending[index], actor.user._id).run()
        }
      } catch { /* Preserve journal and objects for reconciliation; never guess. */ }
      if (!committed) throw error
    }
    return response({ success: true, message: `${documents.length} document(s) uploaded successfully and submitted for review.`, documents: documents.map(documentView) }, 201)
  }

  if (action === "documents-list" || action === "admin-documents-review" || action === "admin-documents-expiring" || action === "admin-request-documents") {
    let rows: Snapshot[]
    if (action === "documents-list") rows = await store.list("documents", "customerId = ? AND isArchived = 0", [actor.customer!.id], "createdAt DESC, id DESC")
    else if (action === "admin-request-documents") {
      const parent = id ? await store.read("customer_requests", id) : null
      if (!parent) reject(404, "Request not found")
      rows = await store.list("documents", "customerId = ? AND json_extract(data, '$.entityId') = ? AND json_extract(data, '$.entityType') = 'CustomerRequest' AND isArchived = 0", [parent!.data.customerId, parent!.id], "createdAt DESC")
      for (const documentId of parent!.data.details?.accountDocumentIds || []) {
        const document = await store.read("documents", documentId)
        if (document && document.data.customerId === parent!.data.customerId && !document.data.isArchived && !rows.some(row => row.id === document.id)) rows.push(document)
      }
    } else rows = await store.list("documents", action === "admin-documents-review" ? "status = 'pending_review' AND isArchived = 0" : "expiryDate IS NOT NULL AND expiryDate <= ? AND isArchived = 0", action === "admin-documents-review" ? [] : [new Date(Date.now() + 30 * 86400000).toISOString()], action === "admin-documents-review" ? "createdAt ASC" : "expiryDate ASC")
    if (action === "documents-list" && url.searchParams.get("accountOnly") === "true") rows = rows.filter(row => row.data.entityType !== "CustomerRequest")
    const category = url.searchParams.get("category"), status = url.searchParams.get("status"), search = url.searchParams.get("search")
    if (category && category !== "all") rows = rows.filter(row => row.data.category === category)
    if (status && status !== "all") rows = rows.filter(row => row.data.status === status)
    if (search) {
      let regex: RegExp
      try { regex = new RegExp(search, "i") } catch { return reject(400, "Invalid search expression") }
      rows = rows.filter(row => regex.test(row.data.title || "") || regex.test(row.data.fileName || ""))
    }
    const total = rows.length
    const { page, limit } = paging(url)
    if (action === "documents-list") rows = rows.slice((page - 1) * limit, page * limit)
    const documents = []
    for (const row of rows) {
      const doc = row.data
      if (action === "admin-documents-review" || action === "admin-documents-expiring") {
        const customer = await store.read("customers", doc.customerId)
        const uploader = doc.uploadedBy ? await store.read("users", doc.uploadedBy) : null
        const daysLeft = doc.expiryDate ? Math.ceil((Date.parse(doc.expiryDate) - Date.now()) / 86400000) : null
        documents.push({ ...documentView(doc), companyName: customer?.data.companyName || "Unknown Company", commercialRegisterNumber: customer?.data.commercialRegisterNumber || "—",
          uploadedByName: uploader ? `${uploader.data.firstName} ${uploader.data.lastName}` : "Customer", uploadedByEmail: uploader?.data.email || "",
          ...(action === "admin-documents-expiring" ? { customerId: customer?.id || "", contactEmail: customer?.data.contactEmail || "", contactPhone: customer?.data.contactPhone || "", daysLeft,
            tier: daysLeft! <= 0 ? "expired" : daysLeft! <= 5 ? "5d" : daysLeft! <= 10 ? "10d" : daysLeft! <= 20 ? "20d" : "30d", lastNotificationSentAt: doc.lastNotificationSentAt } : {}) })
      } else {
        const reviewer = doc.reviewedBy ? await store.read("users", doc.reviewedBy) : null
        documents.push({ ...documentView(doc), reviewedBy: reviewer ? fields(reviewer.data, ["_id", "firstName", "lastName"]) : null })
      }
    }
    return response({ success: true, documents, total, totalCount: total, ...(action === "documents-list" ? { pagination: { total, page, limit, pages: Math.ceil(total / limit) } } : {}) })
  }
  const document = id ? await store.read("documents", id) : null
  if (!document || document.data.isArchived) return reject(404, "Document not found")
  if (action === "document-download") {
    if (!staff(actor.user)) own(actor, document)
    const key = documentStorageKey(document.data)
    if (!key) return reject(409, "Source document storage location requires review")
    const result = await storage.get(safeKey(key))
    if (result.contentLength !== document.data.fileSize || (document.data.fileHash && result.body instanceof Uint8Array && createHash("sha256").update(result.body).digest("hex") !== document.data.fileHash)) {
      reject(409, "Document file integrity requires migration review")
    }
    await store.commit({ checks: [actor.snapshot, document], inserts: [{ table: "document_activity_logs", data: activity(actor, http, document.data, "download") }] })
    return new Response(result.body as BodyInit, { headers: { "Content-Type": document.data.mimeType || result.contentType || "application/octet-stream", "Content-Length": String(result.contentLength), "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${url.searchParams.get("view") === "inline" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.data.fileName)}` } })
  }
  const customer = await store.read("customers", document.data.customerId)
  if (!customer) return reject(409, "Document customer requires migration review")
  if (action === "admin-document-warning") {
    const input = await body(args)
    if (!["email", "whatsapp", "multi"].includes(input.channel)) reject(400, "Invalid warning channel")
    const live = liveEmailConfigured()
    if (live && input.channel !== "email") reject(503, "WhatsApp warning delivery is not configured; select email")
    if (live && !z.string().email().safeParse(customer.data.contactEmail).success) reject(400, "Customer email is missing or invalid")
    const note = notification({ recipientCustomerId: customer.id, title: `Expiry Warning: ${document.data.title}`, message: input.customMessage || `Please renew the document "${document.data.title}".`, channel: input.channel, type: "manual_staff_warning", severity: "warning", relatedDocumentId: document.id,
      actionUrl: "/portal/documents", emailStatus: input.channel !== "whatsapp" ? "pending" : "not_applicable", whatsappStatus: input.channel !== "email" ? "pending" : "not_applicable", dispatchedBy: actor.user._id })
    await store.commit({ checks: [actor.snapshot, customer], updates: [{ before: document, patch: { lastNotificationQueuedAt: now() } }], inserts: [{ table: "notifications", data: note }, { table: "document_activity_logs", data: activity(actor, http, document.data, "warning_queued", { notes: `Warning queued via ${input.channel}; delivery not yet confirmed.` }) }] })
    if (live) {
      const queued = await store.read("notifications", note._id)
      if (!queued) reject(503, "Warning request needs review")
      const escape = (value: string) => value.replace(/[&<>"']/g, item => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[item]!)
      let receipt: string
      try { receipt = await sendEmailWithReceipt({ to: customer.data.contactEmail, subject: "NileLink — Document renewal required", html: `<p>${escape(String(note.message))}</p>`, idempotencyKey: `nilelink-warning-${note._id}` }) }
      catch { await store.commit({ updates: [{ before: queued, patch: { emailStatus: "uncertain" } }] }); reject(503, "Email outcome needs review; do not resend automatically") }
      await store.commit({ updates: [{ before: queued, patch: { emailStatus: "sent", emailReceiptId: receipt, sentAt: now() } }] })
      return response({ success: true, queued: false, notificationId: note._id, message: "Email accepted by provider" })
    }
    return response({ success: true, queued: true, message: "Expiry warning queued; delivery is not yet confirmed", notificationId: note._id }, 202)
  }
  const activeDocuments = await store.list("documents", "customerId = ? AND isArchived = 0", [customer.id])
  let patch: Record<string, any>
  if (action === "admin-document-delete") patch = { isArchived: true, archivedAt: now(), archivedBy: actor.user._id }
  else if (action === "admin-document-verify") {
    const parsed = z.object({ status: z.enum(["approved", "rejected", "pending_review"]), title: z.string().optional(), category: z.string().optional(), startDate: z.string().nullable().optional(), expiryDate: z.string().nullable().optional(), rejectionReason: z.string().nullable().optional(), reviewNotes: z.string().nullable().optional() }).safeParse(await body(args))
    if (!parsed.success) return reject(400, "Invalid document review")
    const input = parsed.data
    if (input.status === "approved" && (!input.title?.trim() || !input.expiryDate)) reject(400, "Title and expiry date are required to approve a document")
    if (input.status === "rejected" && !input.rejectionReason?.trim()) reject(400, "Rejection reason is required")
    patch = { status: input.status, ...(input.title?.trim() ? { title: input.title.trim() } : {}), ...(input.category ? { category: input.category } : {}),
      startDate: input.status === "approved" && input.startDate ? validDate(input.startDate) : null, expiryDate: input.status === "approved" ? validDate(input.expiryDate) : null,
      rejectionReason: input.status === "rejected" ? input.rejectionReason!.trim() : null, reviewNotes: input.reviewNotes?.trim() || null, reviewedBy: actor.user._id, reviewedAt: now() }
    if (patch.startDate && patch.startDate > patch.expiryDate) reject(400, "Expiry must not precede start date")
  } else return reject(503, "Document workflow has not been converted")
  const final = { ...document.data, ...patch }
  const health = document.data.entityType === "CustomerRequest"
    ? { status: customer.data.accountStatus, reason: customer.data.statusReason }
    : documentHealth(activeDocuments.map(row => row.id === document.id ? final : row.data).filter(doc => !doc.isArchived), Date.now(), customer.data.accountStatus)
  const updates: Change[] = [{ before: document, patch }, { before: customer, patch: { accountStatus: health.status, statusReason: health.reason } }]
  const inserts: { table: "document_activity_logs" | "notifications"; data: Data }[] = [{ table: "document_activity_logs", data: activity(actor, http, document.data, patch.isArchived ? "delete" : patch.status === "approved" ? "approve" : patch.status === "rejected" ? "reject" : "update_dates", { previousState: fields(document.data, ["status", "startDate", "expiryDate"]), newState: patch, ...(patch.isArchived ? { notes: "Archived; metadata, object and audit history retained." } : {}) }) }]
  if (customer.data.accountStatus !== health.status || customer.data.statusReason !== health.reason) {
    inserts.push({ table: "document_activity_logs", data: activity(actor, http, document.data, "status_transition", {
      previousState: { accountStatus: customer.data.accountStatus, reason: customer.data.statusReason },
      newState: { accountStatus: health.status, reason: health.reason },
      notes: "Account health recalculated in the same transaction as the document change.",
    }) })
  }
  const checks = [actor.snapshot]
  if (!patch.isArchived) {
    const rejected = patch.status === "rejected", approved = patch.status === "approved"
    // Pending review is neither rejection nor approval; never emit a phantom rejection.
    if (approved || rejected) inserts.push({ table: "notifications", data: notification({ recipientCustomerId: customer.id, title: approved ? "Document Approved" : "Document Verification Notice", message: approved ? `Your document "${final.title}" was approved.` : `Your document "${final.title}" was rejected. Reason: ${patch.rejectionReason}`, type: approved ? "document_approved" : "document_rejected", severity: approved ? "normal" : "urgent", relatedDocumentId: document.id, actionUrl: "/portal/documents" }) })
    if (document.data.entityType === "CustomerRequest" && document.data.entityId) {
      const parent = await store.read("customer_requests", document.data.entityId)
      if (!parent || parent.data.customerId !== customer.id) reject(409, "Document/request relationship requires migration review")
      checks.push(parent!)
      if (["document_required", "document_under_review", "quote_pending"].includes(parent!.data.status)) {
        const requestDocs = activeDocuments.filter(row => row.data.entityType === "CustomerRequest" && row.data.entityId === parent!.id).map(row => row.id === document.id ? final : row.data)
        const complete = requestDocs.length > 0 && requestDocs.every(doc => ["approved", "expiring_soon"].includes(doc.status) && doc.expiryDate && Date.parse(doc.expiryDate) > Date.now())
        const status = rejected ? "document_required" : complete ? "quote_pending" : "document_under_review"
        updates.push({ before: parent!, patch: { status, timeline: [...(parent!.data.timeline || []), { status, title: complete ? "Documents Approved" : rejected ? "Document Rejected" : "Documents Under Review", comment: complete ? "Required submitted documents verified. Preparing quotation." : rejected ? patch.rejectionReason : "Awaiting review of submitted documents.", updatedBy: actor.user._id, createdAt: now() }] } })
      }
    }
  }
  await store.commit({ checks, updates, inserts })
  return response({ success: true, message: patch.isArchived ? "Document archived; metadata, file and history retained." : `Document status updated to ${patch.status}`, document: documentView(final), customerHealth: health })
}

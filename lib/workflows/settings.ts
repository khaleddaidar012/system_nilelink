import { z } from "zod"
import { DEFAULT_CATEGORIES } from "./default-categories"
import { WorkflowStore, body, reject, response, timestamped, now, fields, requireStaff, paging, staff } from "./runtime"
import type { Actor, Snapshot, WorkflowInput } from "./runtime"
import { canAccessAccounts } from "../auth/accounts-access"

export async function handleCategories(store: WorkflowStore, actor: Actor | null, args: WorkflowInput) {
  const publicRead = args.action === "categories-public"
  if (!publicRead) requireStaff(actor!.user)
  if (args.action === "category-create" || args.action === "category-update") {
    if (actor!.user.role !== "super_admin") reject(403, "Only managers can change document categories")
  }
  const existing = (await store.list("system_settings", "settingKey = ?", ["global_system_settings"]))[0] ?? null
  const record = existing?.data ?? timestamped({ settingKey: "global_system_settings", documentCategories: DEFAULT_CATEGORIES.map(category => timestamped({ ...category, ...(category.key === "license" ? { isActive: false } : {}) })), defaultMaxDocumentsPerClient: 20, expiryWarningDaysTiers: [30, 20, 10, 5] })
  const categories = [...(record.documentCategories || [])]
  if (publicRead || args.action === "categories-list") {
    const combined = [...categories, ...DEFAULT_CATEGORIES.filter(category => !categories.some(item => item.key === category.key))]
    return response({ success: true, categories: publicRead ? combined.filter(category => category.isActive !== false).map(category => ({ ...fields(category, ["key", "nameEn", "nameAr"]), description: category.description || "", defaultValidityDays: category.defaultValidityDays || 365, isMandatory: !!category.isMandatory })) : categories })
  }
  const input = await body(args)
  if (args.action === "category-create") {
    const parsed = z.object({ key: z.string().trim().toLowerCase().min(2).regex(/^[a-z0-9_]+$/), nameEn: z.string().trim().min(2), nameAr: z.string().trim().min(2), description: z.string().default(""), defaultValidityDays: z.number().int().min(1).default(365), isMandatory: z.boolean().default(false) }).safeParse(input)
    if (!parsed.success) return reject(400, "Invalid document category")
    if (categories.some(category => category.key === parsed.data.key)) reject(409, "Category key already exists")
    categories.push(timestamped({ ...parsed.data, isActive: true }))
  } else if (args.action === "category-update") {
    const parsed = z.object({ nameEn: z.string().min(2).optional(), nameAr: z.string().min(2).optional(), description: z.string().optional(), defaultValidityDays: z.number().int().min(1).optional(), isMandatory: z.boolean().optional(), isActive: z.boolean().optional() }).safeParse(input)
    if (!parsed.success) return reject(400, "Invalid category update")
    const index = categories.findIndex(category => category.key === args.id)
    if (index < 0) reject(404, "Category not found")
    categories[index] = { ...categories[index], ...parsed.data, updatedAt: now() }
  } else return reject(503, "Category workflow unavailable")
  await store.commit({ checks: [actor!.snapshot], updates: existing ? [{ before: existing, patch: { documentCategories: categories } }] : [], inserts: existing ? [] : [{ table: "system_settings", data: { ...record, documentCategories: categories } }] })
  return response({ success: true, message: "Document categories updated successfully", categories, ...(args.action === "category-update" ? { category: categories.find(category => category.key === args.id) } : {}) })
}

function visible(actor: Actor, row: Snapshot, admin: boolean): boolean {
  const note = row.data
  if(note.requiredPermission&&(!admin||note.requiredPermission!=="accounts"||!canAccessAccounts(actor.user)))return false
  if (note.recipientUserId) return note.recipientUserId === actor.user._id
  if (admin) return (actor.user.role === "super_admin" && note.targetAudience === "super_admin") || ["staff", "all_staff"].includes(note.targetAudience)
  return note.targetAudience === "customer" && (!note.recipientCustomerId || note.recipientCustomerId === actor.customer?.id)
}
export async function handleNotifications(store: WorkflowStore, actor: Actor, args: WorkflowInput) {
  const admin = args.action === "admin-notifications" || staff(actor.user)
  if (args.action === "admin-notifications") requireStaff(actor.user)
  const url = new URL(args.request.url)
  const { page, limit } = paging(url, admin ? 30 : 20)
  const audience = admin
    ? "(recipientUserId = ? OR (recipientUserId IS NULL AND (targetAudience IN ('staff','all_staff') OR (targetAudience = 'super_admin' AND ? = 'super_admin'))))"
    : "(recipientUserId = ? OR (recipientUserId IS NULL AND targetAudience = 'customer' AND (recipientCustomerId IS NULL OR recipientCustomerId = ?)))"
  const predicate=`${audience} AND (json_extract(data,'$.requiredPermission') IS NULL OR (json_extract(data,'$.requiredPermission')='accounts' AND ?=1))`
  const values = [actor.user._id, admin ? actor.user.role : actor.customer?.id ?? null,admin&&canAccessAccounts(actor.user)?1:0]
  if (args.action === "notifications-read") {
    const input = args.request.body === null && !args.input ? {} : await body(args)
    if (input.notificationId && typeof input.notificationId !== "string") reject(400, "Invalid notification ID")
    if(input.notificationIds!==undefined&&(!Array.isArray(input.notificationIds)||input.notificationIds.length<1||input.notificationIds.length>100||input.notificationIds.some((id:unknown)=>typeof id!=="string")))reject(400,"Invalid notification IDs")
    if(input.notificationIds&&input.notificationId)reject(400,"Use one notification selection")
    const specific = input.notificationId ? await store.read("notifications", input.notificationId) : null
    if (input.notificationId && (!specific || !visible(actor, specific, admin))) reject(404, "Notification not found")
    const selected:string[]|undefined=input.notificationIds?[...new Set(input.notificationIds as string[])]:undefined
    if(selected)for(const id of selected){const row=await store.read("notifications",id);if(!row||!visible(actor,row,admin))reject(404,"Notification not found")}
    // Append to readBy from the current SQL value, so simultaneous readers do
    // not overwrite one another. Company/broadcast read state stays per user.
    const statement = store.db.prepare(`UPDATE notifications SET data = json_set(data,
      '$.readBy', json_insert(CASE WHEN json_type(data, '$.readBy') = 'array' THEN json_extract(data, '$.readBy') ELSE json('[]') END, '$[#]', ?),
      '$.isRead', json(CASE WHEN recipientUserId IS NOT NULL OR isRead = 1 THEN 'true' ELSE 'false' END), '$.readAt', ?, '$.updatedAt', ?), revision = revision + 1
      WHERE ${predicate} ${specific ? "AND id = ?" : selected?`AND id IN (${selected.map(()=>"?").join(",")})`:""}
        AND NOT EXISTS (SELECT 1 FROM json_each(notifications.data, '$.readBy') r WHERE r.value = ?)`)
      .bind(actor.user._id, now(), now(), ...values, ...(specific ? [specific.id] : selected??[]), actor.user._id)
    await store.commit({ checks: [actor.snapshot], extra: [statement] })
    return response({ success: true })
  }
  const rows = await store.list("notifications", predicate, values, "createdAt DESC, id DESC")
  const notifications = []
  for (const row of rows.slice((page - 1) * limit, page * limit)) {
    const note = row.data
    const customer = admin && note.recipientCustomerId ? await store.read("customers", note.recipientCustomerId) : null
    notifications.push({ ...note, isRead: !!note.isRead || (note.readBy || []).includes(actor.user._id),
      ...(admin && note.recipientCustomerId ? { recipientCustomerId: customer ? fields(customer.data, ["_id", "companyName", "commercialRegisterNumber"]) : null } : {}),
      actionUrl: note.actionUrl || (note.relatedRequestId ? `/${admin ? "admin" : "portal"}/requests/${note.relatedRequestId}` : note.relatedDocumentId ? admin ? "/admin/documents/review" : "/portal/documents" : undefined) })
  }
  return response({ notifications, total: rows.length, page, pages: Math.ceil(rows.length / limit) })
}

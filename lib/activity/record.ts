import type { D1Binding, D1Statement } from "../db/d1"
import type { StoredUser } from "../db/repositories/users"

export interface ActivityContext { user: StoredUser; action: string }
export interface ActivityTarget { type: string; id: string; label?: string; customerId?: string | null; changedFields?: string[] }
const safeFields = new Set(["firstName", "lastName", "username", "phone", "status", "role", "jobTitle", "staffPermissions", "accountStatus", "companyName", "title", "category", "expiryDate", "startDate", "isArchived", "isActive", "totalAmount", "paidAmount", "currency", "dueDate", "items", "documentCategories", "price", "amount", "paymentStatus", "scheduledDate", "emailVerified", "whatsappVerified"])
export function activityCategory(action: string): string {
  if (action === "login") return "login"
  if (action.includes("upload")) return "upload"
  if (action.includes("download")) return "download"
  if (/delete|archive|suspend/.test(action)) return "delete"
  if (/send|warning/.test(action)) return "send"
  if (/create|register|payment-record/.test(action)) return "create"
  return "update"
}
export function activityStatement(db: D1Binding, context: ActivityContext, target: ActivityTarget): D1Statement {
  const id = crypto.randomUUID().replaceAll("-", "")
  const user = context.user
  const data = {
    _id: id, event: `ACTIVITY_${id}`, activityVersion: 1, createdAt: new Date().toISOString(),
    action: context.action, category: activityCategory(context.action), result: "success",
    actor: { id: user._id, name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "User", username: user.username || "", role: user.role },
    target: { type: target.type, id: target.id, label: String(target.label || target.id).slice(0, 180) },
    customerId: target.customerId || user.customerId || null,
    changedFields: (target.changedFields || []).filter(key => safeFields.has(key)),
  }
  return db.prepare("INSERT INTO system_audit_logs(id,data) VALUES(?,?)").bind(id, JSON.stringify(data))
}
export function activityLabel(data: Record<string, unknown>): string {
  return String(data.title || data.fileName || data.invoiceNumber || data.trackingNumber || data.quoteNumber || data.companyName || data.username || [data.firstName, data.lastName].filter(Boolean).join(" ") || data._id || "")
}

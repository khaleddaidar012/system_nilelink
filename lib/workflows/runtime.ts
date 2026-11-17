import { NextResponse } from "next/server"
import type { D1Binding, D1Statement, D1Value } from "../db/d1"
import { getSessionFromRequest } from "../auth/token-service"
import { D1AccountsRepository, newAccountId } from "../db/repositories/accounts"
import type { StoredUser } from "../db/repositories/users"
import { activityStatement, activityLabel } from "../activity/record"
import type { ActivityContext } from "../activity/record"
import { invoiceEventLabels } from "../shipments/invoice-events"

export type Table = "users" | "customers" | "customer_requests" | "request_services" | "quotes" | "quote_items"
  | "documents" | "document_activity_logs" | "notifications" | "system_settings" | "service_configs" | "pricing_rules"
  | "invoices" | "payments" | "invoice_activity_logs"
  | "_nilelink_delivery_jobs"
  | "analytics_events" | "system_audit_logs"
  | "chat_conversations" | "chat_members" | "chat_messages"
export type Data = { _id: string; [key: string]: any }
export interface Snapshot { table: Table; id: string; revision: number; data: Data }
export interface Change { before: Snapshot; patch: Record<string, unknown> }
export interface WorkflowInput { action: string; request: Request; id?: string; input?: Record<string, any> }
export class WorkflowError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export function reject(status: number, message: string): never { throw new WorkflowError(status, message) }
export const response = (data: unknown, status = 200) => NextResponse.json(data, { status })
export const now = () => new Date().toISOString()
export const timestamped = (data: Record<string, unknown>): Data => ({ _id: newAccountId(), createdAt: now(), updatedAt: now(), __v: 0, ...data })
export const fields = (data: Record<string, any>, names: string[]) => Object.fromEntries(names.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]))
export const staff = (user: StoredUser) => user.role === "staff" || user.role === "super_admin"
export function requireStaff(user: StoredUser, permission?: "canReviewDocuments" | "canSendAlerts") {
  if (!staff(user) || (permission && user.role !== "super_admin" && !user.staffPermissions?.[permission])) reject(403, "Insufficient staff permissions")
}
export function validDate(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return reject(400, "Invalid date")
  return new Date(value).toISOString()
}
export async function body(args: WorkflowInput): Promise<Record<string, any>> {
  if (args.input) return args.input
  try {
    const value = await args.request.json()
    if (!value || typeof value !== "object" || Array.isArray(value)) return reject(400, "Invalid request body")
    return value
  } catch { return reject(400, "Invalid request body") }
}
export function paging(url: URL, defaultLimit = 20) {
  const page = Number(url.searchParams.get("page") ?? 1)
  const limit = Number(url.searchParams.get("limit") ?? defaultLimit)
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) return reject(400, "Invalid pagination")
  return { page, limit }
}
export function notification(data: Record<string, unknown>): Data {
  return timestamped({ recipientUserId: null, recipientCustomerId: null, targetAudience: "customer", channel: "in_app", type: "request_update", severity: "normal", readBy: [], isRead: false, readAt: null, emailStatus: "not_applicable", whatsappStatus: "not_applicable", ...data })
}

/** SQL unit of work, not a Mongo query emulator. Domain code chooses every table and predicate. */
export class WorkflowStore {
  readonly db: D1Binding
  activity?: ActivityContext
  constructor(db: D1Binding) { this.db = db }
  async read(table: Table, id: string): Promise<Snapshot | null> {
    const row = await this.db.prepare(`SELECT data, revision FROM ${table} WHERE id = ?`).bind(id).first<{ data: string; revision: number }>()
    return row ? { table, id, revision: row.revision, data: JSON.parse(row.data) } : null
  }
  async list(table: Table, predicate = "1 = 1", values: D1Value[] = [], order = "id"): Promise<Snapshot[]> {
    const rows = await this.db.prepare(`SELECT id, data, revision FROM ${table} WHERE ${predicate} ORDER BY ${order}`).bind(...values).all<{ id: string; data: string; revision: number }>()
    return rows.results.map(row => ({ table, id: row.id, revision: row.revision, data: JSON.parse(row.data) }))
  }
  async commit({ checks = [], updates = [], inserts = [], extra = [] }: {
    checks?: Snapshot[]; updates?: Change[]; inserts?: { table: Table; data: Data }[]; extra?: D1Statement[]
  }): Promise<void> {
    const statements: D1Statement[] = []
    const guards: string[] = []
    const seen = new Map<string, Snapshot>()
    for (const source of [...checks, ...updates.map(update => update.before)]) {
      const key = `${source.table}:${source.id}`
      const previous = seen.get(key)
      if (previous && previous.revision !== source.revision) return reject(409, "Inconsistent workflow snapshot")
      seen.set(key, source)
    }
    for (const source of seen.values()) {
      const id = newAccountId(); guards.push(id)
      statements.push(this.db.prepare(`INSERT INTO _nilelink_write_guards (id, valid) SELECT ?, count(*) FROM ${source.table} WHERE id = ? AND revision = ?`).bind(id, source.id, source.revision))
    }
    const changed = new Set<string>()
    for (const update of updates) {
      const source = update.before
      const key = `${source.table}:${source.id}`
      if (changed.has(key)) throw new Error("A workflow must combine changes to each entity before committing")
      changed.add(key)
      const data = { ...source.data, ...update.patch, _id: source.id, updatedAt: now() }
      const id = newAccountId(); guards.push(id)
      statements.push(this.db.prepare(`UPDATE ${source.table} SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?`).bind(JSON.stringify(data), source.id, source.revision),
        this.db.prepare("INSERT INTO _nilelink_write_guards (id, valid) VALUES (?, changes())").bind(id))
    }
    for (const insert of inserts) statements.push(this.db.prepare(`INSERT INTO ${insert.table} (id, data) VALUES (?, ?)`).bind(insert.data._id, JSON.stringify(insert.data)))
    statements.push(...extra, ...guards.map(id => this.db.prepare("DELETE FROM _nilelink_write_guards WHERE id = ?").bind(id)))
    if (this.activity) {
      const businessTables = new Set(["payments", "documents", "invoices", "customer_requests", "quotes", "request_services", "pricing_rules", "system_settings", "service_configs", "users", "customers", "_nilelink_delivery_jobs"])
      const additions = inserts.filter(item => businessTables.has(item.table))
      const added = additions[0]
      const updated = updates.find(item => businessTables.has(item.before.table))
      const downloaded = this.activity.action === "document-download" ? checks.find(item => item.table === "documents") : undefined
      const table = added?.table || updated?.before.table || downloaded?.table
      const data = added?.data || updated?.before.data || downloaded?.data
      if (this.activity.action === "document-upload") {
        for (const item of additions.filter(item => item.table === "documents")) statements.push(activityStatement(this.db, this.activity, { type: "documents", id: item.data._id, label: activityLabel(item.data), customerId: item.data.customerId }))
      } else if (table && data) {
        const related = table === "_nilelink_delivery_jobs" ? checks.find(item => item.table === (data.invoiceId ? "invoices" : "customers")) : undefined
        statements.push(activityStatement(this.db, this.activity, { type: related?.table || table, id: related?.id || data._id, label: activityLabel(related?.data || data), customerId: data.customerId, changedFields: updated ? Object.keys(updated.patch) : [] }))
      }
      const invoiceAdded=inserts.find(item=>item.table==="invoices")
      const invoiceChanged=updates.find(item=>item.before.table==="invoices"&&item.patch.relatedRequestId)||updates.find(item=>item.before.table==="invoices")
      const invoiceData=invoiceAdded?.data||invoiceChanged?.before.data
      const financialAudit=inserts.filter(item=>item.table==="invoice_activity_logs")
      if(invoiceData&&financialAudit.some(item=>item.data.meaningfulChange!==false)) {
        const names=invoiceEventLabels[this.activity.action]??["تحديث فاتورة","Invoice update"]
        const note=notification({type:"invoice_update_internal",requiredPermission:"accounts",targetAudience:"all_staff",
          title:`${names[0]} / ${names[1]}`,message:`${invoiceData.invoiceNumber} — ${names[0]} / ${names[1]} — ${this.activity.user.firstName} ${this.activity.user.lastName}`,
          relatedInvoiceId:invoiceData._id,actionUrl:invoiceData.shipmentRecordId?`/admin/shipment-invoices/${invoiceData._id}`:"/admin/invoices"})
        statements.push(this.db.prepare("INSERT INTO notifications(id,data) VALUES(?,?)").bind(note._id,JSON.stringify(note)))
      }
    }
    if (!statements.length) return
    try { await this.db.batch(statements) } catch (error) {
      if (error instanceof Error && /UNIQUE constraint|CHECK constraint|FOREIGN KEY/i.test(error.message)) reject(409, "Workflow changed concurrently or contains conflicting relationships. Reload before retrying.")
      throw error
    }
  }
  async nextNumber(kind: "request" | "quote"): Promise<string> {
    const prefix = `${kind === "request" ? "NL-REQ" : "NL-QT"}-${new Date().getUTCFullYear()}-`
    const table = kind === "request" ? "customer_requests" : "quotes"
    const column = kind === "request" ? "trackingNumber" : "quoteNumber"
    const row = await this.db.prepare(`INSERT INTO _nilelink_workflow_sequences (id, seq)
      SELECT ?, coalesce(max(CAST(substr(${column}, ?) AS INTEGER)), 0) + 1 FROM ${table}
      WHERE substr(${column}, 1, ?) = ? AND substr(${column}, ?) != '' AND substr(${column}, ?) NOT GLOB '*[^0-9]*'
      ON CONFLICT(id) DO UPDATE SET seq = max(_nilelink_workflow_sequences.seq, excluded.seq - 1) + 1 RETURNING seq`)
      .bind(prefix, prefix.length + 1, prefix.length, prefix, prefix.length + 1, prefix.length + 1).first<{ seq: number }>()
    if (!row || !Number.isSafeInteger(row.seq)) throw new Error("Invalid workflow sequence")
    return prefix + String(row.seq).padStart(6, "0")
  }
}
export interface Actor { user: StoredUser; snapshot: Snapshot; customer: Snapshot | null }
export async function actorFor(store: WorkflowStore, request: Request): Promise<Actor> {
  const session = await getSessionFromRequest(request)
  if (!session || session.tokenType !== "access") return reject(401, "Authentication required")
  const user = await new D1AccountsRepository(store.db).findUser("id", session.userId)
  if (!user || !["active", "pending_verification"].includes(user.user.status)) return reject(401, "User account unavailable")
  const customer = user.user.customerId ? await store.read("customers", user.user.customerId) : null
  if (user.user.customerId && !customer) return reject(409, "Customer relationship requires migration review")
  return { user: user.user, snapshot: { table: "users", id: user.user._id, revision: user.revision, data: user.user }, customer }
}
export function own(actor: Actor, record: Snapshot): void {
  if (!actor.customer || record.data.customerId !== actor.customer.id || staff(actor.user)) reject(404, "Record not found")
}
export function requireCustomer(actor: Actor): Snapshot {
  if (!actor.customer || !["customer", "customer_admin"].includes(actor.user.role)) return reject(403, "Customer access required")
  return actor.customer
}

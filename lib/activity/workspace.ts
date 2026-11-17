import type { D1Binding } from "../db/d1"
import { actorFor, WorkflowStore, requireStaff, WorkflowError } from "../workflows/runtime"
import { handleMailboxRequest } from "../mailbox/handler"
import { canAccessAccounts } from "../auth/accounts-access"
import { accountsUpdates } from "./accounts-updates"

export const workspaceSections = ["chat", "requests", "customers", "mailbox", "activity", "documents/review", "quotes", "invoices", "shipment-invoices", "notifications", "staff", "settings", "system/backups"] as const
export type WorkspaceSection = typeof workspaceSections[number]
const sources: Partial<Record<WorkspaceSection, { table: string; predicate: string; date?: string }>> = {
  requests: { table: "customer_requests", predicate: "1=1" },
  customers: { table: "customers", predicate: "1=1" },
  activity: { table: "system_audit_logs", predicate: "json_extract(data,'$.activityVersion')=1", date: "json_extract(data,'$.createdAt')" },
  "documents/review": { table: "documents", predicate: "status='pending_review' AND isArchived=0" },
  quotes: { table: "quotes", predicate: "1=1" },
  invoices: { table: "invoices", predicate: "coalesce(json_extract(data,'$.archivedAt'),'')='' AND json_extract(data,'$.shipmentRecordId') IS NULL" },
  staff: { table: "users", predicate: "role IN ('staff','super_admin')", date: "json_extract(data,'$.createdAt')" },
  settings: { table: "system_settings", predicate: "1=1" },
  "system/backups": { table: "system_audit_logs", predicate: "backupId IS NOT NULL", date: "json_extract(data,'$.createdAt')" },
}
const headers = { "cache-control": "private, no-store" }
type Seen = { at: string; row?:number; uid?: number; uidValidity?: string }

export async function workspaceActivity(db: D1Binding, request: Request) {
  try {
    const actor = await actorFor(new WorkflowStore(db), request)
    requireStaff(actor.user)
    if (actor.user.status !== "active") throw new WorkflowError(403, "Inactive account")
    const seen = (actor.user.workspaceSeen || {}) as Record<string, Seen>
    const now = new Date().toISOString()
    const canBackups = actor.user.role === "super_admin" || actor.user.staffPermissions?.canManageBackups
    const accounts=canAccessAccounts(actor.user)
    const sections = workspaceSections.filter(section => (section !== "system/backups" || canBackups)&&(!["shipment-invoices","invoices"].includes(section)||accounts))
    if(request.method==="GET"&&new URL(request.url).searchParams.get("section")==="shipment-invoices") {
      if(!accounts)throw new WorkflowError(403,"Accounts permission required")
      const updates=await accountsUpdates(db,seen["shipment-invoices"]??{},seen.invoices?.at??"")
      return Response.json({counts:{"shipment-invoices":updates.count},...updates},{headers})
    }
    const mailbox = async () => {
      if (!actor.user.mailbox) return null
      const url = new URL('/api/admin/mailbox?action=list&folder=INBOX&page=0', request.url)
      const result = await handleMailboxRequest(new Request(url, { headers: request.headers }), { db, session: { userId: actor.user._id } })
      if (!result.ok) return null
      return await result.json() as { messages: { uid: number; seen: boolean }[]; uidValidity: string; hasMore: boolean }
    }
    if (request.method === "POST") {
      if (request.headers.get("origin") !== new URL(request.url).origin) throw new WorkflowError(403, "Invalid origin")
      const input = await request.json()
      if (!sections.includes(input.section)) throw new WorkflowError(400, "Invalid section")
      if(input.section==="shipment-invoices") {
        if(!Number.isSafeInteger(input.through)||input.through<0)throw new WorkflowError(400,"Invalid invoice reading marker")
        const max=await db.prepare("SELECT coalesce(max(rowid),0) AS latest FROM invoice_activity_logs").first<{latest:number}>()
        if(input.through>(max?.latest??0))throw new WorkflowError(400,"Cannot mark future invoice events read")
        const path='$.workspaceSeen."shipment-invoices"'
        await db.prepare(`UPDATE users SET data=json_set(data,?,json(?)),revision=revision+1 WHERE id=? AND coalesce(json_extract(data,?),-1)<?`).bind(path,JSON.stringify({at:now,row:input.through}),actor.user._id,`${path}.row`,input.through).run()
        return Response.json({success:true},{headers})
      }
      const mark: Seen = { at: now }
      if (input.section === "mailbox") {
        const list = await mailbox()
        if (!list) return Response.json({ success: false }, { status: 503, headers })
        mark.uid = Math.max(0, ...list.messages.map(message => message.uid))
        mark.uidValidity = list.uidValidity
      }
      // Update only this user's section marker; concurrent visits cannot overwrite other sections.
      const path = `$.workspaceSeen."${input.section}"`
      await db.prepare(`UPDATE users SET data=json_set(data,?,json(?)),revision=revision+1 WHERE id=? AND coalesce(json_extract(data,?), '') < ?`)
        .bind(path, JSON.stringify(mark), actor.user._id, `${path}.at`, now).run()
      return Response.json({ success: true }, { headers })
    }
    const counts: Record<string, number> = {}
    if(accounts)counts["shipment-invoices"]=(await accountsUpdates(db,seen["shipment-invoices"]??{},seen.invoices?.at??"")).count
    await Promise.all(sections.filter(section => sources[section]).map(async section => {
      const source = sources[section]!
      const date = source.date || "coalesce(json_extract(data,'$.updatedAt'),json_extract(data,'$.createdAt'))"
      const row = await db.prepare(`SELECT count(*) AS count FROM ${source.table} WHERE ${source.predicate} AND ${date}>? AND ${date}<=?`)
        .bind(seen[section]?.at || "", now).first<{ count: number }>()
      counts[section] = row?.count || 0
    }))
    const chat = await db.prepare(`SELECT count(*) AS count FROM chat_messages msg JOIN chat_members m ON m.conversationId=msg.conversationId WHERE m.userId=? AND m.active=1 AND msg.senderId<>? AND msg.sequence>max(coalesce(json_extract(m.data,'$.joinedSequence'),0),coalesce(json_extract(m.data,'$.lastReadSequence'),0)) AND json_extract(msg.data,'$.createdAt')>? AND json_extract(msg.data,'$.createdAt')<=?`)
      .bind(actor.user._id, actor.user._id, seen.chat?.at || "", now).first<{ count: number }>()
    counts.chat = chat?.count || 0
    const notes = await db.prepare(`SELECT count(*) AS count FROM notifications WHERE (recipientUserId=? OR (recipientUserId IS NULL AND (targetAudience IN ('staff','all_staff') OR (targetAudience='super_admin' AND ?='super_admin')))) AND (json_extract(data,'$.requiredPermission') IS NULL OR (json_extract(data,'$.requiredPermission')='accounts' AND ?=1)) AND createdAt>? AND createdAt<=?`)
      .bind(actor.user._id, actor.user.role,accounts?1:0, seen.notifications?.at || "", now).first<{ count: number }>()
    counts.notifications = notes?.count || 0
    const list = await mailbox()
    if (list) {
      const previous = seen.mailbox
      counts.mailbox = list.messages.filter(message => previous?.uidValidity === list.uidValidity ? message.uid > (previous.uid || 0) : !message.seen).length
    }
    return Response.json({ counts }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof WorkflowError ? error.message : "Workspace updates unavailable" }, { status: error instanceof WorkflowError ? error.status : 503, headers })
  }
}

import { canAccessAccounts } from "../auth/accounts-access"
import { userCanMarkReadyForAccounts } from "../auth/staff-categories"
import { body, notification, now, paging, reject, requireStaff, response } from "./runtime"
import type { Actor, Data, WorkflowInput, WorkflowStore } from "./runtime"

export type ReadinessState = "pending_admin" | "approved" | "rejected"
export interface AccountsReadiness {
  state: ReadinessState
  source: "manual" | "auto"
  markedAt: string
  markedBy: string
  markedByName: string
  note?: string
  decidedAt?: string
  decidedBy?: string
  decidedByName?: string
  decisionNote?: string
}

const states: ReadinessState[] = ["pending_admin", "approved", "rejected"]
const displayName = (user: { firstName?: string | null; lastName?: string | null; username?: string | null; email?: string | null }) =>
  `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || user.email || ""

export function readinessNotification(parent: Data, readiness: AccountsReadiness): Data {
  const reference = String(parent.trackingNumber || parent._id)
  return notification({
    targetAudience: "super_admin", type: "accounts_ready", severity: "normal",
    title: "شحنة جاهزة للحسابات / Shipment ready for accounts",
    message: `${reference} — ${readiness.markedByName}${readiness.source === "auto" ? " — اكتملت كل المراحل / all stages completed" : ""}`,
    relatedRequestId: parent._id, actionUrl: "/admin/accounts-ready",
  })
}

/** Builds the automatic readiness patch when every service of a request has just been completed. */
export function autoReadiness(parent: Data, actor: Actor): { patch: { accountsReadiness: AccountsReadiness }; notice: Data } | null {
  if (parent.accountsReadiness) return null
  const readiness: AccountsReadiness = { state: "pending_admin", source: "auto", markedAt: now(), markedBy: actor.user._id, markedByName: displayName(actor.user) }
  return { patch: { accountsReadiness: readiness }, notice: readinessNotification(parent, readiness) }
}

function viewer(actor: Actor) {
  const admin = actor.user.role === "super_admin"
  return { role: actor.user.role, isAdmin: admin, canDecide: admin, canMark: userCanMarkReadyForAccounts(actor.user), canCreateInvoice: canAccessAccounts(actor.user) }
}

export async function handleAccountsReadiness(store: WorkflowStore, actor: Actor, args: WorkflowInput): Promise<Response> {
  requireStaff(actor.user)
  const admin = actor.user.role === "super_admin"
  if (args.request.method !== "GET" && args.request.headers.get("origin") !== new URL(args.request.url).origin) reject(403, "Invalid origin")

  if (args.action === "accounts-readiness-list") {
    const url = new URL(args.request.url), { page, limit } = paging(url)
    const requested = url.searchParams.get("state") || "all"
    if (requested !== "all" && !states.includes(requested as ReadinessState)) reject(400, "Invalid state")
    const accountsOnly = !admin && canAccessAccounts(actor.user)
    // Accounts staff only ever see administrator-approved shipments; other staff see what they flagged themselves.
    const scope = admin ? { sql: "1 = 1", values: [] as string[] }
      : accountsOnly ? { sql: "json_extract(r.data,'$.accountsReadiness.state') = 'approved'", values: [] as string[] }
        : { sql: "json_extract(r.data,'$.accountsReadiness.markedBy') = ?", values: [actor.user._id] }
    const base = `json_extract(r.data,'$.accountsReadiness.state') IS NOT NULL AND ${scope.sql}`
    const filter = `${base} AND (? = 'all' OR json_extract(r.data,'$.accountsReadiness.state') = ?)`
    const [rows, counts] = await store.db.batch([
      store.db.prepare(`SELECT r.id AS id, r.data AS data, c.companyName AS companyName FROM customer_requests r LEFT JOIN customers c ON c.id = r.customerId
        WHERE ${filter} ORDER BY json_extract(r.data,'$.accountsReadiness.markedAt') DESC, r.id DESC LIMIT ? OFFSET ?`)
        .bind(...scope.values, requested, requested, limit, (page - 1) * limit),
      store.db.prepare(`SELECT json_extract(r.data,'$.accountsReadiness.state') AS state, count(*) AS total FROM customer_requests r WHERE ${base} GROUP BY 1`).bind(...scope.values),
    ])
    const summary: Record<string, number> = { pending_admin: 0, approved: 0, rejected: 0 }
    for (const row of counts.results as { state: string; total: number }[]) summary[row.state] = Number(row.total)
    return response({
      viewer: viewer(actor), counts: summary, page, limit,
      shipments: (rows.results as { id: string; data: string; companyName: string | null }[]).map(row => {
        const data = JSON.parse(row.data) as Data
        return { id: row.id, trackingNumber: data.trackingNumber || "", subject: data.subject || "", customerId: data.customerId, customerName: row.companyName || "", status: data.status, readiness: data.accountsReadiness as AccountsReadiness }
      }),
    })
  }

  const parent = args.id ? await store.read("customer_requests", args.id) : null
  if (!parent) reject(404, "Request not found")
  const current = parent.data.accountsReadiness as AccountsReadiness | undefined
  const input = await body(args)
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : ""

  if (args.action === "accounts-readiness-mark") {
    if (!userCanMarkReadyForAccounts(actor.user)) reject(403, "Permission to mark shipments ready for accounts is required")
    if (parent.data.status === "cancelled") reject(409, "Cancelled requests cannot be transferred to accounts")
    if (current && current.state !== "rejected") return response({ success: true, changed: false, readiness: current })
    const readiness: AccountsReadiness = { state: "pending_admin", source: "manual", markedAt: now(), markedBy: actor.user._id, markedByName: displayName(actor.user), ...(note ? { note } : {}) }
    await store.commit({ checks: [actor.snapshot], updates: [{ before: parent, patch: { accountsReadiness: readiness } }], inserts: [{ table: "notifications", data: readinessNotification(parent.data, readiness) }] })
    return response({ success: true, changed: true, readiness })
  }

  if (args.action === "accounts-readiness-decide") {
    if (!admin) reject(403, "Only an administrator may approve shipments for accounts")
    const decision = input.decision
    if (decision !== "approve" && decision !== "reject") reject(400, "Invalid decision")
    if (!current) reject(409, "This shipment has not been marked ready for accounts")
    if (decision === "approve" && current.state === "approved") return response({ success: true, changed: false, readiness: current })
    if (decision === "approve" ? current.state === "approved" : current.state !== "pending_admin") reject(409, "The shipment state changed. Reload and review it again")
    const decided: AccountsReadiness = { ...current, state: decision === "approve" ? "approved" : "rejected", decidedAt: now(), decidedBy: actor.user._id, decidedByName: displayName(actor.user), ...(note ? { decisionNote: note } : {}) }
    const reference = String(parent.data.trackingNumber || parent.id)
    const notice = decision === "approve"
      ? notification({ targetAudience: "all_staff", requiredPermission: "accounts", type: "accounts_ready_approved", severity: "normal",
        title: "شحنة معتمدة للحسابات / Shipment approved for accounts", message: `${reference} — ${decided.decidedByName}`, relatedRequestId: parent.id, actionUrl: "/admin/accounts-ready" })
      : notification({ recipientUserId: current.markedBy, targetAudience: "staff", type: "accounts_ready_rejected", severity: "normal",
        title: "تم رفض جاهزية الشحنة للحسابات / Ready-for-accounts request declined", message: `${reference}${note ? ` — ${note}` : ""}`, relatedRequestId: parent.id, actionUrl: "/admin/accounts-ready" })
    await store.commit({ checks: [actor.snapshot], updates: [{ before: parent, patch: { accountsReadiness: decided } }], inserts: [{ table: "notifications", data: notice }] })
    return response({ success: true, changed: true, readiness: decided })
  }

  return reject(404, "Unknown accounts readiness action")
}

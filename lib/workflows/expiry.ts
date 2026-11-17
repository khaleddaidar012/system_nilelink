import { timingSafeEqual } from "node:crypto"
import { WorkflowStore, WorkflowError, actorFor, now, notification, requireStaff, response, timestamped } from "./runtime"
import type { Actor, Change, Data, WorkflowInput } from "./runtime"
import { documentHealth } from "./documents"
import { expiryNotification } from "@/lib/cron/expiry-notification"

export async function handleExpiry(store: WorkflowStore, args: WorkflowInput): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const header = args.request.headers.get("authorization")
  const expected = secret ? `Bearer ${secret}` : null
  const validSecret = expected && header && Buffer.byteLength(expected) === Buffer.byteLength(header) && timingSafeEqual(Buffer.from(expected), Buffer.from(header))
  let actor: Actor | null = null
  if (!validSecret) { actor = await actorFor(store, args.request); requireStaff(actor.user, "canSendAlerts") }
  return response({ success: true, timestamp: now(), results: await evaluateExpiry(store, actor) })
}

/** Per-customer atomic changes; overlapping runs conflict rather than duplicate alerts. */
export async function evaluateExpiry(store: WorkflowStore, actor: Actor | null, currentTime = Date.now()) {
  const result = { totalEvaluated: 0, tier30Alerts: 0, tier20Alerts: 0, tier10Alerts: 0, tier5Alerts: 0, expiredCount: 0, notificationsCreated: 0, conflicts: 0, requiresReview: 0 }
  const customers = await store.list("customers")
  const day = 86400000, timestamp = new Date(currentTime).toISOString()
  for (const customer of customers) {
    const documents = await store.list("documents", "customerId = ? AND isArchived = 0", [customer.id])
    const eligible = documents.filter(row => ["approved", "expiring_soon", "expired"].includes(row.data.status) && row.data.expiryDate)
    result.totalEvaluated += eligible.length
    if (documents.some(row => row.data.expiryDate && !Number.isFinite(Date.parse(row.data.expiryDate)))) { result.requiresReview++; continue }
    const updates: Change[] = [], inserts: { table: "notifications" | "document_activity_logs"; data: Data }[] = []
    const deltas = { tier30Alerts: 0, tier20Alerts: 0, tier10Alerts: 0, tier5Alerts: 0, expiredCount: 0, notificationsCreated: 0 }
    const finalDocuments = documents.map(row => ({ ...row.data }))
    for (const doc of eligible) {
      const left = Math.ceil((Date.parse(doc.data.expiryDate) - currentTime) / day)
      const tier = left <= 0 ? 0 : left <= 5 ? 5 : left <= 10 ? 10 : left <= 20 ? 20 : left <= 30 ? 30 : null
      const escalation = tier === 0 ? "expired" : tier === 5 || tier === 10 ? "critical" : tier === 20 ? "urgent" : tier === 30 ? "warning" : "none"
      const status = tier === 0 ? "expired" : tier !== null ? "expiring_soon" : "approved"
      // Do not revive an expired document merely because its source dates are contradictory.
      if (doc.data.status === "expired" && tier !== 0) { result.requiresReview++; continue }
      const last = doc.data.lastNotificationQueuedAt || doc.data.lastNotificationSentAt
      if (last && !Number.isFinite(Date.parse(last))) { result.requiresReview++; continue }
      const cooldown = (tier === 5 || tier === 10 ? 4 : tier === 20 ? 7 : 10) * day
      const alertKey = `${doc.data.expiryDate}:${tier}`
      const alert = tier !== null && (doc.data.lastExpiryAlertKey ? doc.data.lastExpiryAlertKey !== alertKey : (tier === 0 ? doc.data.status !== "expired" : !last || currentTime - Date.parse(last) > cooldown))
      if (doc.data.status === status && doc.data.warningEscalationTier === escalation && !alert) continue
      const patch = { status, warningEscalationTier: escalation, ...(alert ? { lastNotificationQueuedAt: timestamp, lastExpiryAlertKey: alertKey } : {}) }
      updates.push({ before: doc, patch })
      Object.assign(finalDocuments.find(row => row._id === doc.id)!, patch)
      inserts.push({ table: "document_activity_logs", data: timestamped({ documentId: doc.id, customerId: customer.id,
        actorId: actor?.user._id || null, actorName: actor ? `${actor.user.firstName} ${actor.user.lastName}`.trim() : "Expiry scheduler", actorRole: actor?.user.role || "system",
        action: "expiry_evaluated", previousState: { status: doc.data.status, warningEscalationTier: doc.data.warningEscalationTier }, newState: patch }) })
      if (alert) {
        const detail = expiryNotification(doc.data.title, doc.data.category, customer.data.companyName, doc.data.expiryDate, left)
        for (const audience of ["customer", "all_staff"]) inserts.push({ table: "notifications", data: notification({ recipientCustomerId: customer.id, relatedDocumentId: doc.id,
          ...detail, targetAudience: audience,
          severity: tier === 0 || tier === 5 ? "critical" : tier === 10 ? "urgent" : tier === 20 ? "warning" : "normal",
          type: tier === 0 ? "document_expired" : "document_expiring_10d", channel: "in_app", expiryTierDays: tier, actionUrl: audience === "customer" ? "/portal/documents" : `/admin/customers/${customer.id}` }) })
        deltas.notificationsCreated += 2
        if (tier === 0) deltas.expiredCount++; else deltas[`tier${tier}Alerts` as "tier5Alerts" | "tier10Alerts" | "tier20Alerts" | "tier30Alerts"]++
      }
    }
    if (!eligible.length) continue
    const health = documentHealth(finalDocuments, currentTime, customer.data.accountStatus)
    // Preserve an inactive account until a staff review; cron cannot undo a manual hold.
    // The scheduler monitors expiry; it must never revoke approval because a new
    // file is awaiting review, nor activate an account that needs staff approval.
    const patch = ["warning", "inactive"].includes(health.status) &&
      !(customer.data.accountStatus === "inactive" && health.status !== "inactive")
      ? { accountStatus: health.status, statusReason: health.reason } : {}
    if (!updates.length && (!Object.keys(patch).length || (customer.data.accountStatus === health.status && customer.data.statusReason === health.reason))) continue
    updates.push({ before: customer, patch })
    try {
      await store.commit({ checks: [...documents, ...(actor ? [actor.snapshot] : [])], updates, inserts })
      for (const key of Object.keys(deltas) as (keyof typeof deltas)[]) result[key] += deltas[key]
    } catch (error) { if (error instanceof WorkflowError && error.status === 409) result.conflicts++; else throw error }
  }
  return result
}

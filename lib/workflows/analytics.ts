import { createHash } from "node:crypto"
import { jwtVerify } from "jose"
import { z } from "zod"
import { actorFor, fields, reject, requireStaff, response, timestamped } from "./runtime"
import { activityTitles } from "../activity/titles"
import type { Actor, WorkflowInput, WorkflowStore } from "./runtime"
import { firstLaunchBackupMonitor } from "../backup/d1-monitor"
import { isApprovedFirstLaunchRequest } from "../db/staging-context.mjs"
import { liveEmailConfigured } from "../email/readiness"

const day = 86400000
function json(data: unknown) { const result = response(data); result.headers.set("Cache-Control", "no-store"); return result }
const safePage = (page: string) => page.split(/[?#]/, 1)[0]
  .replace(/(\/invoice\/)\S+?(?=\/|$)/g, "$1[token]")
  .replace(/\/(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})(?=\/|$)/gi, "/[id]")
export async function trackAnalytics(store: WorkflowStore, args: WorkflowInput) {
  if (process.env.ANALYTICS_ENABLED === "false") return json({ success: true, message: "Analytics disabled" })
  let input: unknown
  try { input = args.input ?? await args.request.json() } catch { return reject(400, "Invalid tracking body") }
  const parsed = z.object({ type: z.enum(["page_view", "contact_submit", "service_view"]), page: z.string().min(1).max(500).regex(/^\/(?!\/)[^\x00-\x1f]*$/) }).safeParse(input)
  if (!parsed.success) return reject(400, "Invalid event type or page path")
  const rawIP = args.request.headers.get("cf-connecting-ip") || args.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || args.request.headers.get("x-real-ip") || "127.0.0.1"
  const ipHash = createHash("sha256").update(rawIP).digest("hex").slice(0, 16)
  const userAgent = (args.request.headers.get("user-agent") || "").slice(0, 1024), lower = userAgent.toLowerCase()
  const device = /(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(lower) ? "tablet" : /mobile|ipod|iphone|blackberry|opera mini|fennec|windows phone/i.test(lower) ? "mobile" : "desktop"
  const country = args.request.headers.get("cf-ipcountry")
  const event = timestamped({ ...parsed.data, page: safePage(parsed.data.page), ipHash, device, userAgent,
    ...(country && /^[A-Z]{2}$/.test(country) && country !== "XX" ? { country } : {}) })
  // A single SQL statement makes the sliding-window test and insert atomic.
  const result = await store.db.prepare(`INSERT INTO analytics_events (id, data)
    SELECT ?, json_set(?, '$.createdAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'), '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE NOT EXISTS (SELECT 1 FROM analytics_events WHERE ipHash = ? AND type = ? AND page = ?
      AND createdAt >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 seconds') AND createdAt <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
    .bind(event._id, JSON.stringify(event), ipHash, event.type, event.page).run()
  return json({ success: true, message: result.meta.changes ? "Tracked" : "Duplicate ignored" })
}

export async function analyticsAccess(store: WorkflowStore, request: Request) {
  const cookie = (request.headers.get("cookie") || "").split(";").map(value => value.trim()).find(value => value.startsWith("analytics_session="))?.slice("analytics_session=".length)
  const secret = process.env.ANALYTICS_SECRET || process.env.ANALYTICS_PASSWORD
  if (cookie && secret) {
    try {
      const { payload } = await jwtVerify(cookie, new TextEncoder().encode(secret), { algorithms: ["HS256"] })
      if (payload.authenticated === true) return
    } catch { /* A configured analytics session or a live staff session is required. */ }
  }
  const actor = await actorFor(store, request)
  requireStaff(actor.user)
}

export async function websiteAnalytics(store: WorkflowStore) {
  const current = new Date(), end = current.toISOString(), today = end.slice(0, 10) + "T00:00:00.000Z", seven = new Date(Date.parse(today) - 6 * day).toISOString()
  const valid = "type = 'page_view' AND createdAt <= ? AND julianday(createdAt) IS NOT NULL"
  const results = await store.db.batch<any>([
    store.db.prepare(`SELECT count(DISTINCT ipHash) AS totalVisitors, count(*) AS totalPageViews, count(DISTINCT CASE WHEN createdAt >= ? THEN ipHash END) AS todayVisitors FROM analytics_events WHERE ${valid}`).bind(today, end),
    store.db.prepare(`SELECT page AS path, count(DISTINCT ipHash) AS visitors, count(*) AS views FROM analytics_events WHERE ${valid} GROUP BY page ORDER BY visitors DESC, path LIMIT 10`).bind(end),
    store.db.prepare(`SELECT substr(createdAt, 1, 10) AS date, count(DISTINCT ipHash) AS value FROM analytics_events WHERE ${valid} AND createdAt >= ? GROUP BY substr(createdAt, 1, 10) ORDER BY date`).bind(end, seven),
    store.db.prepare(`SELECT coalesce(json_extract(data, '$.device'), 'unknown') AS device, count(DISTINCT ipHash) AS visitors FROM analytics_events WHERE ${valid} GROUP BY device ORDER BY visitors DESC, device`).bind(end),
    store.db.prepare(`SELECT json_extract(data, '$.country') AS country, count(DISTINCT ipHash) AS visitors FROM analytics_events WHERE ${valid} AND json_extract(data, '$.country') IS NOT NULL AND json_extract(data, '$.country') != '' GROUP BY country ORDER BY visitors DESC, country LIMIT 10`).bind(end),
    store.db.prepare("SELECT count(*) AS count FROM analytics_events WHERE julianday(createdAt) IS NULL OR ipHash IS NULL OR ipHash = ''"),
  ])
  const summary = results[0].results[0], devices = results[3].results, totalSources = devices.reduce((sum: number, row: any) => sum + row.visitors, 0) || 1
  const daily = new Map(results[2].results.map((row: any) => [row.date, row.value]))
  return json({ success: true, data: { ...summary,
    topPages: results[1].results.map((row: any) => { const path = safePage(String(row.path || "/")); return { ...row, path, title: path.split("/").filter(Boolean).pop() || "Home" } }),
    last7Days: Array.from({ length: 7 }, (_, index) => { const date = new Date(Date.parse(seven) + index * day).toISOString().slice(0, 10); return { date, value: daily.get(date) || 0 } }),
    devices: devices.map((row: any) => ({ ...row, percentage: Number((row.visitors / totalSources * 100).toFixed(1)) })),
    countries: results[4].results.map((row: any) => ({ ...row, code: String(row.country).slice(0, 2).toLowerCase(), percentage: Number((row.visitors / (summary.totalVisitors || 1) * 100).toFixed(1)) })),
    requiresReview: results[5].results[0].count, timezone: "UTC" } })
}

export async function accountAnalytics(store: WorkflowStore, actor: Actor) {
  requireStaff(actor.user)
  const time = new Date().toISOString(), later = (days: number) => new Date(Date.parse(time) + days * day).toISOString()
  const result = await store.db.batch<any>([
    store.db.prepare(`SELECT count(*) AS totalCustomers, coalesce(sum(accountStatus='active'),0) AS activeCustomers, coalesce(sum(accountStatus='warning'),0) AS warningCustomers, coalesce(sum(accountStatus='inactive'),0) AS inactiveCustomers FROM customers`),
    store.db.prepare(`SELECT coalesce(sum(status='pending_review'),0) AS pendingReviewDocs, coalesce(sum(status='expiring_soon'),0) AS expiringSoonDocs, coalesce(sum(status='expired'),0) AS expiredDocs,
      coalesce(sum(expiryDate >= ? AND expiryDate <= ?),0) AS critical, coalesce(sum(expiryDate > ? AND expiryDate <= ?),0) AS urgent,
      coalesce(sum(expiryDate > ? AND expiryDate <= ?),0) AS warning, coalesce(sum(expiryDate > ? AND expiryDate <= ?),0) AS standard
      FROM documents WHERE isArchived = 0`).bind(time, later(3), later(3), later(7), later(7), later(10), later(10), later(30)),
    // Queued attempts are not successful delivery. Preserve the source statuses rather than inferring from channel.
    store.db.prepare(`SELECT count(*) AS totalNotificationsSent FROM notifications WHERE json_extract(data, '$.emailStatus') = 'sent' OR json_extract(data, '$.whatsappStatus') IN ('sent','delivered')`),
    store.db.prepare(`SELECT count(*) AS totalServiceRequests, coalesce(sum(status IN ('submitted','document_required','document_under_review','quote_pending','quote_provided','quote_accepted','processing')),0) AS pendingServiceRequests FROM customer_requests`),
  ])
  const documents = result[1].results[0]
  return json({ metrics: { ...result[0].results[0], ...fields(documents, ["pendingReviewDocs", "expiringSoonDocs", "expiredDocs"]), ...result[2].results[0], ...result[3].results[0] },
    expiryHorizonChartData: [ { name: "Expired", count: documents.expiredDocs, color: "#EF4444" }, { name: "≤3 Days", count: documents.critical, color: "#F43F5E" },
      { name: "4-7 Days", count: documents.urgent, color: "#F97316" }, { name: "8-10 Days", count: documents.warning, color: "#F59E0B" }, { name: "11-30 Days", count: documents.standard, color: "#10B981" } ],
    urgentCount: documents.critical + documents.urgent + documents.warning })
}

export async function systemOverview(store: WorkflowStore, actor: Actor) {
  requireStaff(actor.user)
  const current = new Date().toISOString()
  const backups = await firstLaunchBackupMonitor()
  const result = await store.db.batch<any>([
    store.db.prepare("SELECT role, status, count(*) AS count FROM users WHERE role IN ('staff','super_admin') GROUP BY role, status"),
    store.db.prepare("SELECT id, data FROM users WHERE role IN ('staff','super_admin') ORDER BY createdAt DESC, id DESC LIMIT 5"),
    store.db.prepare("SELECT id, data FROM system_audit_logs ORDER BY createdAt DESC, id DESC LIMIT 10"),
    store.db.prepare("SELECT state, count(*) AS count FROM _nilelink_delivery_jobs GROUP BY state"),
  ])
  let total = 0, active = 0, inactive = 0
  const roles: Record<string, number> = Object.create(null)
  for (const row of result[0].results) { total += row.count; if (row.status === "active") active += row.count; if (["inactive", "suspended"].includes(row.status)) inactive += row.count; roles[row.role] = (roles[row.role] || 0) + row.count }
  const backupAttention = backups.monitoring !== "connected" || backups.missedScheduledBackup || backups.isBackupOverdue || backups.latestBackupStatus === "failed"
  const emailReady = liveEmailConfigured()
  return json({ timestamp: current, systemStatus: backupAttention ? "warning" : "healthy", databaseProvider: "d1", previewOnly: !isApprovedFirstLaunchRequest(),
    email: { provider: "resend", configured: emailReady, deferred: !emailReady, status: "unknown", smtpStatus: "unknown", imapStatus: "unknown", smtpReachable: false, imapReachable: false, monitoring: emailReady ? "provider-api" : "deferred", queues: { inbound: null, outbound: null, badMail: null, accessible: false }, lastCheck: current, lastSuccessfulCheck: null, lastOutage: null, diagnostics: [], ...(!emailReady ? { error: "D1_EMAIL_PROVIDER_DEFERRED" } : {}) },
    backups,
    employees: { total, active, inactive, roleDistribution: roles, recentlyAdded: result[1].results.map((row: any) => { const user = JSON.parse(row.data); return { id: row.id, name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email, ...fields(user, ["email", "jobTitle", "role", "status", "createdAt"]) } }) },
    recentActivity: result[2].results.map((row: any) => {
      const log = JSON.parse(row.data)
      const title = log.activityVersion === 1 ? activityTitles[log.action] || ["تحديث بيانات", "Updated data"] : null
      return { id: row.id, ...fields(log, ["event", "operation", "result", "createdAt"]), actorName: log.actor?.name || "System", actorRole: log.actor?.role || "system", titleEn: title?.[1] || log.event || "System event", titleAr: title?.[0] || log.event || "حدث نظام", summaryEn: title ? log.target?.label || "Recorded activity" : "Historical system activity", summaryAr: title ? log.target?.label || "حركة مسجلة" : "نشاط مسجل في سجل النظام", ...(title ? { actionUrl: "/admin/activity" } : {}) }
    }),
    deliveryJobs: Object.fromEntries(result[3].results.map((row: any) => [row.state, row.count])),
    alerts: [
      ...(!emailReady ? [{ id: "d1-mail-deferred", level: "info", source: "email", titleEn: "Email setup deferred", titleAr: "إعداد البريد مؤجل", messageEn: "An email provider has not been selected. Email sending is disabled.", messageAr: "لم يُحدد مزود البريد بعد. الإرسال بالبريد غير مفعّل." }] : []),
      ...(backups.monitoring !== "connected" || backups.missedScheduledBackup || backups.isBackupOverdue || backups.latestBackupStatus === "failed" ? [{ id: "d1-backup-attention", level: "warning", source: "backup", titleEn: "Backup monitoring needs review", titleAr: "النسخ الاحتياطي يحتاج مراجعة", messageEn: "Backup records are unavailable, overdue, or report a recent failure. Open backup details.", messageAr: "تعذر قراءة سجلات النسخ أو تأخر التنفيذ أو سُجل فشل حديث. راجع تفاصيل النسخ." }] : []),
    ] })
}

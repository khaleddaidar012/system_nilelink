import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { connectDB } from "@/lib/mongodb"
import { User } from "@/lib/models/User"
import { SystemAuditLog } from "@/lib/models/SystemAuditLog"
import { callAgent, BackupApiError } from "@/lib/backup/agent-client"
import type { MailEnableStatus } from "@/lib/backup/agent-client"
import type { BackupSummary, AgentHealth } from "@/components/admin/system/backups/formatters"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { getDbOverviewOverrideForTesting } from "@/lib/backup/overview-data"

export const dynamic = "force-dynamic"

export interface SystemAlertItem {
  id: string
  level: "critical" | "warning" | "info"
  source: "email" | "backup" | "agent" | "system"
  titleEn: string
  titleAr: string
  messageEn: string
  messageAr: string
  actionUrl?: string
  actionLabelEn?: string
  actionLabelAr?: string
}

export interface ActivityItem {
  id: string
  event: string
  operation: string
  result: string
  actorName?: string
  actorRole?: string
  createdAt: string
  titleEn: string
  titleAr: string
  summaryEn: string
  summaryAr: string
  actionUrl?: string
}

export interface AdminOverviewData {
  timestamp: string
  systemStatus: "healthy" | "warning" | "critical"

  email: {
    status: "online" | "degraded" | "offline" | "unknown"
    smtpStatus: "running" | "stopped" | "not_installed" | "unknown"
    imapStatus: "running" | "stopped" | "not_installed" | "unknown"
    smtpReachable: boolean
    imapReachable: boolean
    responseTimeMs?: number
    banner?: string
    /** available = data collected; otherwise why monitoring data is missing */
    monitoring: "available" | "agent_unreachable" | "endpoint_missing" | "error"
    agentVersion?: string
    agentSupportsMailMonitoring?: boolean
    queues: {
      inbound: number | null
      outbound: number | null
      badMail: number | null
      accessible: boolean
    }
    lastCheck: string
    lastSuccessfulCheck: string | null
    lastOutage: {
      startedAt: string
      endedAt: string | null
      reason: string
    } | null
    diagnostics: string[]
    error?: string
  }

  backups: {
    agentStatus: "online" | "offline" | "unknown"
    schedulerStatus: "enabled" | "disabled" | "unknown"
    nextScheduledRun: string | null
    lastCompletedAt: string | null
    latestBackupStatus: "completed" | "failed" | "running" | "quarantined" | "unknown"
    totalBackups: number
    failedBackups: number
    missedScheduledBackup: boolean
    lastSuccessfulBackupAgeHours: number | null
    isBackupOverdue: boolean
    diskSpace?: {
      freeBytes?: number
      totalBytes?: number
      freePercentage?: number
      diskLow: boolean
    }
    error?: string
  }

  employees: {
    total: number
    active: number
    inactive: number
    recentlyAdded: Array<{
      id: string
      name: string
      email: string
      jobTitle: string
      role: string
      status: string
      createdAt: string
    }>
    roleDistribution: Record<string, number>
  }

  alerts: SystemAlertItem[]
  recentActivity: ActivityItem[]
}

function mapAuditToActivity(doc: any): ActivityItem {
  const id = String(doc._id || Math.random())
  const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()
  const actorName = doc.actor?.name || doc.actor?.email || "System"
  const actorRole = doc.actor?.role || "system"

  const eventMap: Record<string, { titleEn: string; titleAr: string; summaryEn: string; summaryAr: string; url?: string }> = {
    BACKUP_CREATED: {
      titleEn: "Backup Created",
      titleAr: "تم إنشاء نسخة احتياطية",
      summaryEn: `Backup ${doc.backupId ?? ""} created successfully`,
      summaryAr: `تم إنشاء النسخة الاحتياطية بنجاح`,
      url: "/admin/system/backups",
    },
    BACKUP_REQUESTED: {
      titleEn: "Backup Requested",
      titleAr: "طُلب إنشاء نسخة احتياطية",
      summaryEn: `Manual backup initiated by ${actorName}`,
      summaryAr: `بدء نسخة يدوية بواسطة ${actorName}`,
      url: "/admin/system/backups",
    },
    BACKUP_FAILED: {
      titleEn: "Backup Failed",
      titleAr: "فشل إنشاء نسخة احتياطية",
      summaryEn: `Backup operation failed: ${doc.details?.error ?? "unknown reason"}`,
      summaryAr: `فشلت عملية النسخ الاحتياطي`,
      url: "/admin/system/backups",
    },
    RESTORE_REQUESTED: {
      titleEn: "Restore Requested",
      titleAr: "طلب استعادة قاعدة البيانات",
      summaryEn: `Restore requested for ${doc.backupId ?? ""} (${doc.details?.targetMode ?? "test"})`,
      summaryAr: `طلب استعادة للنسخة الاحتياطية`,
      url: "/admin/system/backups",
    },
    RESTORE_COMPLETED: {
      titleEn: "Restore Completed",
      titleAr: "اكتملت الاستعادة بنجاح",
      summaryEn: `Database restore completed for ${doc.backupId ?? ""}`,
      summaryAr: `اكتملت استعادة قاعدة البيانات بنجاح`,
      url: "/admin/system/backups",
    },
    RESTORE_FAILED: {
      titleEn: "Restore Failed",
      titleAr: "فشلت عملية الاستعادة",
      summaryEn: `Restore failed: ${doc.details?.error ?? "error"}`,
      summaryAr: `فشلت استعادة قاعدة البيانات`,
      url: "/admin/system/backups",
    },
    BACKUP_DELETED: {
      titleEn: "Backup Deleted",
      titleAr: "تم حذف نسخة احتياطية",
      summaryEn: `Backup ${doc.backupId ?? ""} was removed`,
      summaryAr: `تم حذف النسخة الاحتياطية`,
      url: "/admin/system/backups",
    },
    AGENT_AUTH_FAILED: {
      titleEn: "Security Alert: Agent Auth Failed",
      titleAr: "تنبيه أمني: فشل مصادقة العميل",
      summaryEn: "An unauthorized request signature was rejected",
      summaryAr: "تم رفض توقيع طلب غير مصرح به",
    },
  }

  const mapped = eventMap[doc.event] || {
    titleEn: doc.event || "System Event",
    titleAr: doc.event || "حدث نظام",
    summaryEn: doc.operation ? `Operation: ${doc.operation}` : "System activity logged",
    summaryAr: doc.operation ? `العملية: ${doc.operation}` : "تم تسجيل نشاط في النظام",
    url: "/admin/system/backups",
  }

  return {
    id,
    event: doc.event,
    operation: doc.operation,
    result: doc.result,
    actorName,
    actorRole,
    createdAt,
    titleEn: mapped.titleEn,
    titleAr: mapped.titleAr,
    summaryEn: mapped.summaryEn,
    summaryAr: mapped.summaryAr,
    actionUrl: mapped.url,
  }
}

export async function GET(request: NextRequest) {
  if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "admin-system-overview", request })
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 })
  }

  if (session.role !== "staff" && session.role !== "super_admin") {
    return NextResponse.json({ error: "Access denied. NileLink Staff or Manager role required.", code: "FORBIDDEN" }, { status: 403 })
  }

  const now = new Date()
  const timestamp = now.toISOString()
  const dbOverviewOverride = getDbOverviewOverrideForTesting()

  // 1. Parallel fetching of DB and Agent sources with individual timeouts
  const [dbStaffResult, dbAuditResult, mailAgentResult, healthAgentResult, backupsAgentResult, schedulerAgentResult] =
    await Promise.allSettled([
      // DB staff query
      (async () => {
        if (dbOverviewOverride) {
          const res = await dbOverviewOverride()
          return res.staff
        }
        await connectDB()
        return User.find({ role: { $in: ["staff", "super_admin"] } })
          .select("firstName lastName email jobTitle role status createdAt")
          .sort({ createdAt: -1 })
          .lean()
      })(),

      // DB audit logs query
      (async () => {
        if (dbOverviewOverride) {
          const res = await dbOverviewOverride()
          return res.audits
        }
        await connectDB()
        return SystemAuditLog.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      })(),

      // Agent: MailEnable status
      callAgent<MailEnableStatus>("GET", "/v1/mail/status", { timeoutMs: 4500 }),

      // Agent: Health
      callAgent<AgentHealth>("GET", "/v1/health", { timeoutMs: 4500 }),

      // Agent: Backups list
      callAgent<{ items: BackupSummary[] }>("GET", "/v1/backups?limit=20", { timeoutMs: 4500 }),

      // Agent: Scheduler info
      callAgent<any>("GET", "/v1/scheduler", { timeoutMs: 4500 }),
    ])

  // 2. Process Staff data
  const staffList = dbStaffResult.status === "fulfilled" ? dbStaffResult.value : []
  const totalEmployees = staffList.length
  const activeEmployees = staffList.filter((s: any) => s.status === "active").length
  const inactiveEmployees = staffList.filter((s: any) => s.status === "inactive" || s.status === "suspended").length
  const roleDistribution: Record<string, number> = {}
  for (const s of staffList) {
    roleDistribution[s.role] = (roleDistribution[s.role] || 0) + 1
  }
  const recentlyAdded = staffList.slice(0, 5).map((s: any) => ({
    id: String(s._id),
    name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.email,
    email: s.email,
    jobTitle: s.jobTitle || "",
    role: s.role,
    status: s.status || "active",
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : timestamp,
  }))

  // 3. Process Recent Activity
  const auditLogs = dbAuditResult.status === "fulfilled" ? dbAuditResult.value : []
  const recentActivity = auditLogs.map(mapAuditToActivity)

  // 4. Process MailEnable Status
  let emailData: AdminOverviewData["email"]
  const healthInfo = healthAgentResult.status === "fulfilled" ? (healthAgentResult.value as AgentHealth & { capabilities?: string[] }) : null
  const agentVersionInfo = healthInfo?.version
  const agentSupportsMail = healthInfo?.capabilities ? healthInfo.capabilities.includes("mail-monitoring") : undefined
  if (mailAgentResult.status === "fulfilled") {
    const raw = mailAgentResult.value
    emailData = {
      status: raw.status || "unknown",
      smtpStatus: raw.services?.smtp?.status || "unknown",
      imapStatus: raw.services?.imap?.status || "unknown",
      smtpReachable: Boolean(raw.connectivity?.smtp?.reachable),
      imapReachable: Boolean(raw.connectivity?.imap?.reachable),
      responseTimeMs: raw.connectivity?.smtp?.responseTimeMs,
      banner: raw.connectivity?.smtp?.banner,
      monitoring: "available",
      agentVersion: agentVersionInfo,
      agentSupportsMailMonitoring: true,
      queues: {
        inbound: raw.queues?.inbound ?? null,
        outbound: raw.queues?.outbound ?? null,
        badMail: raw.queues?.badMail ?? null,
        accessible: Boolean(raw.queues?.accessible),
      },
      lastCheck: raw.lastCheck || timestamp,
      lastSuccessfulCheck: raw.lastSuccessfulCheck || null,
      lastOutage: raw.lastOutage || null,
      diagnostics: raw.diagnostics || [],
    }
  } else {
    const reason = mailAgentResult.reason
    const code = reason instanceof BackupApiError ? reason.code : undefined
    const outdated = code === "MAIL_ENDPOINT_MISSING" || (healthInfo !== null && agentSupportsMail !== true && code !== "AGENT_UNAVAILABLE")
    const monitoring: AdminOverviewData["email"]["monitoring"] = outdated
      ? "endpoint_missing"
      : code === "AGENT_UNAVAILABLE" || code === "BACKUP_NOT_CONFIGURED" || code === "CF_ACCESS_DENIED" || code === "AGENT_AUTH_FAILED"
        ? "agent_unreachable"
        : "error"
    const message = reason instanceof Error ? reason.message : "Agent unreachable"
    emailData = {
      status: "unknown",
      smtpStatus: "unknown",
      imapStatus: "unknown",
      smtpReachable: false,
      imapReachable: false,
      monitoring,
      agentVersion: agentVersionInfo,
      agentSupportsMailMonitoring: agentSupportsMail ?? (outdated ? false : undefined),
      queues: { inbound: null, outbound: null, badMail: null, accessible: false },
      lastCheck: timestamp,
      lastSuccessfulCheck: null,
      lastOutage: null,
      diagnostics: [
        monitoring === "endpoint_missing"
          ? `Agent is reachable (v${agentVersionInfo ?? "unknown, pre-0.2.0"}) but does not provide mail monitoring (outdated agent build; update to 0.2.0+)`
          : monitoring === "agent_unreachable"
            ? "Windows agent is unreachable or rejected the request"
            : "Mail monitoring returned an error",
      ],
      error: message,
    }
  }

  // 5. Process Backups & Agent Health
  const agentOnline = healthAgentResult.status === "fulfilled"
  const healthData = agentOnline ? healthAgentResult.value : null
  const backupsList = backupsAgentResult.status === "fulfilled" ? (backupsAgentResult.value.items || []) : []
  const schedulerData = schedulerAgentResult.status === "fulfilled" ? schedulerAgentResult.value : healthData?.scheduler

  const totalBackups = healthData?.stats?.totalBackups ?? backupsList.length
  const failedBackups = backupsList.filter((b) => b.status === "failed").length
  const latestBackup = backupsList[0]
  const latestBackupStatus = latestBackup?.status ?? (totalBackups > 0 ? "completed" : "unknown")
  const lastCompletedAt = healthData?.stats?.lastCompletedAt ?? backupsList.find((b) => b.status === "completed")?.completedAt ?? null

  let lastSuccessfulBackupAgeHours: number | null = null
  let isBackupOverdue = false
  if (lastCompletedAt) {
    const ageMs = now.getTime() - new Date(lastCompletedAt).getTime()
    lastSuccessfulBackupAgeHours = Math.max(0, Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10)
    // If expected daily backup interval exceeded (> 26 hours)
    if (lastSuccessfulBackupAgeHours > 26) {
      isBackupOverdue = true
    }
  }

  let missedScheduledBackup = false
  if (schedulerData?.enabled) {
    if (schedulerData.last?.lastResult === "failed") {
      missedScheduledBackup = true
    } else if (schedulerData.nextRunAt && new Date(schedulerData.nextRunAt).getTime() < now.getTime() - 30 * 60 * 1000) {
      missedScheduledBackup = true
    } else if (isBackupOverdue) {
      missedScheduledBackup = true
    }
  }

  const freeBytes = healthData?.agent?.freeDiskBytes
  const totalBytes = healthData?.agent?.totalDiskBytes
  const freePercentage = freeBytes && totalBytes && totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 100) : undefined
  const diskLow = Boolean(healthData?.agent?.diskLow)

  const backupData: AdminOverviewData["backups"] = {
    agentStatus: agentOnline ? "online" : "offline",
    schedulerStatus: schedulerData?.enabled ? "enabled" : schedulerData?.enabled === false ? "disabled" : "unknown",
    nextScheduledRun: schedulerData?.nextRunAt ?? schedulerData?.nextRunLocal ?? null,
    lastCompletedAt,
    latestBackupStatus,
    totalBackups,
    failedBackups,
    missedScheduledBackup,
    lastSuccessfulBackupAgeHours,
    isBackupOverdue,
    diskSpace: freeBytes !== undefined ? { freeBytes, totalBytes, freePercentage, diskLow } : undefined,
    error: !agentOnline ? (healthAgentResult.reason instanceof Error ? healthAgentResult.reason.message : "Agent offline") : undefined,
  }

  // 6. Generate Alerts
  const alerts: SystemAlertItem[] = []

  // Email Alerts
  if (emailData.status === "offline") {
    alerts.push({
      id: "alert-email-offline",
      level: "critical",
      source: "email",
      titleEn: "MailEnable Server Offline",
      titleAr: "خادم البريد MailEnable غير متصل",
      messageEn: "The MailEnable email service or port 25 is currently unreachable.",
      messageAr: "خدمة البريد MailEnable أو المنفذ 25 غير متاح حالياً على الخادم.",
    })
  } else if (emailData.smtpStatus === "stopped") {
    alerts.push({
      id: "alert-smtp-stopped",
      level: "critical",
      source: "email",
      titleEn: "SMTP Service Stopped",
      titleAr: "خدمة SMTP متوقفة",
      messageEn: "The Windows MailEnable SMTP Service (MESMTPCS) is stopped.",
      messageAr: "خدمة إرسال البريد ويندوز (MESMTPCS) متوقفة حالياً.",
    })
  } else if (emailData.status === "unknown") {
    alerts.push({
      id: "alert-email-unknown",
      level: "warning",
      source: "email",
      titleEn: "Email Monitoring Unavailable",
      titleAr: "مراقبة البريد غير متاحة",
      messageEn: `MailEnable status cannot be determined: ${emailData.diagnostics[0] ?? "no data"}.`,
      messageAr: "تعذر تحديد حالة خادم البريد MailEnable لعدم توفر بيانات المراقبة.",
    })
  } else if (emailData.status === "degraded") {
    alerts.push({
      id: "alert-email-degraded",
      level: "warning",
      source: "email",
      titleEn: "MailEnable Degraded",
      titleAr: "خادم البريد MailEnable بأداء منخفض",
      messageEn: emailData.diagnostics[0] ?? "One or more email health checks failed.",
      messageAr: "فشل واحد أو أكثر من فحوصات سلامة خادم البريد.",
    })
  } else if (emailData.queues.badMail !== null && emailData.queues.badMail > 20) {
    alerts.push({
      id: "alert-bad-mail",
      level: "warning",
      source: "email",
      titleEn: "High Bad Mail Queue",
      titleAr: "تراكم في رسائل البريد المعطوبة",
      messageEn: `There are ${emailData.queues.badMail} undelivered/bad messages in the MailEnable queue.`,
      messageAr: `يوجد ${emailData.queues.badMail} رسالة معطوبة أو لم يتم تسليمها في قائمة الانتظار.`,
    })
  }

  // Backup & Agent Alerts
  if (backupData.agentStatus === "offline") {
    alerts.push({
      id: "alert-agent-offline",
      level: "critical",
      source: "agent",
      titleEn: "Windows Backup Agent Unreachable",
      titleAr: "عميل النسخ الاحتياطي غير متصل",
      messageEn: "Cannot reach the Windows Backup Agent over Cloudflare Tunnel. Verify service status.",
      messageAr: "تعذر الاتصال بعميل النسخ الاحتياطي لويندوز عبر نفق Cloudflare. تحقق من حالة الخدمة.",
      actionUrl: "/admin/system/backups",
      actionLabelEn: "Backup Settings",
      actionLabelAr: "إعدادات النسخ",
    })
  } else {
    if (missedScheduledBackup) {
      alerts.push({
        id: "alert-backup-missed",
        level: "warning",
        source: "backup",
        titleEn: "Scheduled Backup Missed or Overdue",
        titleAr: "تم تفويت موعد النسخ الاحتياطي المجدول",
        messageEn: "The expected daily automatic backup did not complete within the scheduled window.",
        messageAr: "النسخة الاحتياطية التلقائية اليومية لم تكتمل خلال الإطار الزمني المحدد.",
        actionUrl: "/admin/system/backups",
        actionLabelEn: "View Backups",
        actionLabelAr: "عرض النسخ",
      })
    }
    if (latestBackupStatus === "failed") {
      alerts.push({
        id: "alert-backup-latest-failed",
        level: "warning",
        source: "backup",
        titleEn: "Latest Backup Failed",
        titleAr: "فشلت آخر عملية نسخ احتياطي",
        messageEn: "The most recent backup attempt ended with an error.",
        messageAr: "انتهت آخر محاولة لإنشاء نسخة احتياطية بحدوث خطأ.",
        actionUrl: "/admin/system/backups",
        actionLabelEn: "View Backups",
        actionLabelAr: "عرض النسخ",
      })
    }
    if (diskLow) {
      alerts.push({
        id: "alert-backup-disk-low",
        level: "warning",
        source: "backup",
        titleEn: "Low Disk Space on Backup Storage",
        titleAr: "مساحة القرص منخفضة على قرص النسخ",
        messageEn: `Available free space is low (${freePercentage ?? 0}% remaining). Retention cleanup recommended.`,
        messageAr: `المساحة المتبقية منخفضة (${freePercentage ?? 0}% متبقية). يُوصى بتنظيف النسخ القديمة.`,
        actionUrl: "/admin/system/backups",
        actionLabelEn: "Manage Storage",
        actionLabelAr: "إدارة التخزين",
      })
    }
  }

  // 7. Overall System Status
  let systemStatus: AdminOverviewData["systemStatus"] = "healthy"
  if (alerts.some((a) => a.level === "critical")) {
    systemStatus = "critical"
  } else if (alerts.some((a) => a.level === "warning")) {
    systemStatus = "warning"
  }

  const payload: AdminOverviewData = {
    timestamp,
    systemStatus,
    email: emailData,
    backups: backupData,
    employees: {
      total: totalEmployees,
      active: activeEmployees,
      inactive: inactiveEmployees,
      recentlyAdded,
      roleDistribution,
    },
    alerts,
    recentActivity,
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
    },
  })
}

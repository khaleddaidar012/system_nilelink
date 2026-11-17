"use client"

import { useState, useEffect, useRef } from "react"
import { Database, HardDrive, CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowUpRight, AlertOctagon } from "lucide-react"
import { Link } from "@/navigation"
import { cn } from "@/lib/utils"
import { AdminOverviewData } from "./types"
import { formatBytes } from "@/components/admin/system/backups/formatters"
import { LiveStatusDot, LiveSystemStatus } from "./LiveStatusDot"
import { D1BackupStatusCard } from "./D1BackupStatusCard"

interface Props {
  backups: AdminOverviewData["backups"]
  locale: string
}

export function BackupStatusCard({ backups, locale }: Props) {
  return backups.provider === "d1" ? <D1BackupStatusCard backups={backups} locale={locale} /> : <LegacyBackupStatusCard backups={backups} locale={locale} />
}
function LegacyBackupStatusCard({ backups, locale }: Props) {
  const isAr = locale === "ar"

  const isAgentUnknown = backups.agentStatus === "unknown"
  const isAgentOnline = backups.agentStatus === "online"
  const isOverdue = backups.isBackupOverdue
  const hasFailed = backups.latestBackupStatus === "failed" || backups.failedBackups > 0
  const isMissed = backups.missedScheduledBackup

  const liveStatus: LiveSystemStatus = isAgentUnknown
    ? "unknown"
    : !isAgentOnline
    ? "offline"
    : isOverdue || isMissed || hasFailed
    ? "degraded"
    : "healthy"

  const [shouldShake, setShouldShake] = useState(false)
  const prevStatusRef = useRef<LiveSystemStatus>(liveStatus)

  useEffect(() => {
    if (prevStatusRef.current !== "offline" && liveStatus === "offline") {
      setShouldShake(true)
      const timer = setTimeout(() => setShouldShake(false), 600)
      return () => clearTimeout(timer)
    }
    prevStatusRef.current = liveStatus
  }, [liveStatus])

  const statusLabel = isAgentUnknown
    ? isAr ? "غير معروف" : "Unknown / Unreachable"
    : !isAgentOnline
    ? isAr ? "العميل غير متصل" : "Agent Offline"
    : isOverdue || isMissed || hasFailed
    ? isAr ? "يتطلب انتباهاً" : "Action Required"
    : isAr ? "النسخ سليم ومجدول" : "Healthy & Scheduled"

  const statusBadgeClass = isAgentUnknown
    ? "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800"
    : !isAgentOnline
    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
    : isOverdue || isMissed || hasFailed
    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"

  const StatusIcon = isAgentUnknown
    ? HelpCircle
    : !isAgentOnline
    ? XCircle
    : isOverdue || isMissed || hasFailed
    ? AlertTriangle
    : CheckCircle2

  const formatCairoDate = (isoStr: string | null) => {
    if (!isoStr) return isAr ? "لا توجد نسخ" : "None"
    try {
      return new Date(isoStr).toLocaleString(isAr ? "ar-EG" : "en-US", {
        timeZone: "Africa/Cairo",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return isoStr
    }
  }

  const freePercentage = backups.diskSpace?.freePercentage ?? 100
  const freeGB = backups.diskSpace?.freeBytes ? formatBytes(backups.diskSpace.freeBytes) : null
  const totalGB = backups.diskSpace?.totalBytes ? formatBytes(backups.diskSpace.totalBytes) : null

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                {isAr ? "منظومة النسخ الاحتياطي" : "Backup & Recovery System"}
              </h3>
              <span className="text-[11px] text-secondary-500 dark:text-slate-400">
                {isAr ? "MongoDB Atlas & Windows Agent" : "Cloudflare Tunnel + Windows Agent"}
              </span>
            </div>
          </div>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-xs",
              statusBadgeClass
            )}
          >
            <LiveStatusDot status={liveStatus} />
            <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", shouldShake && "animate-subtle-shake")} />
            <span>{statusLabel}</span>
          </span>
        </div>

        {/* Cadence & Timestamps Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3 text-xs dark:border-slate-800/80 dark:bg-slate-950/40">
          <div className="space-y-1">
            <span className="text-[11px] text-secondary-500 dark:text-slate-400 block truncate">
              {isAr ? "آخر نسخة ناجحة" : "Latest Successful"}
            </span>
            <div className="font-semibold text-secondary-900 dark:text-white truncate">
              {formatCairoDate(backups.lastCompletedAt)}
            </div>
            {backups.lastSuccessfulBackupAgeHours !== null && (
              <span
                className={cn(
                  "text-[10px] block font-medium",
                  isOverdue ? "text-rose-600 dark:text-rose-400 font-bold" : "text-secondary-400"
                )}
              >
                {isAr ? `منذ ${backups.lastSuccessfulBackupAgeHours} ساعة` : `${backups.lastSuccessfulBackupAgeHours}h ago`}
              </span>
            )}
          </div>

          <div className="space-y-1 border-r border-secondary-200 pr-2.5 rtl:border-r-0 rtl:border-l rtl:pl-2.5 rtl:pr-0 dark:border-slate-800">
            <span className="text-[11px] text-secondary-500 dark:text-slate-400 block truncate">
              {isAr ? "النسخة القادمة المجدولة" : "Next Scheduled"}
            </span>
            <div className="font-semibold text-secondary-900 dark:text-white truncate">
              {backups.nextScheduledRun ? formatCairoDate(backups.nextScheduledRun) : (isAr ? "21:00 بتوقيت القاهرة" : "21:00 Cairo Time")}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
              {backups.schedulerStatus === "enabled" ? (isAr ? "المجدول نشط" : "Scheduler Active") : (isAr ? "معطل" : "Disabled")}
            </span>
          </div>
        </div>

        {/* Quantities & Disk Pressure Bar */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary-500 dark:text-slate-400 text-[11px]">
              {isAr ? "إجمالي النسخ:" : "Total Backups:"}{" "}
              <strong className="text-secondary-900 dark:text-white">{backups.totalBackups}</strong>
            </span>
            {backups.failedBackups > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                <AlertOctagon className="h-3 w-3" />
                <span>{backups.failedBackups} {isAr ? "فشلت" : "failed"}</span>
              </span>
            )}
          </div>

          {backups.diskSpace && totalGB && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-secondary-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  <span>{isAr ? "مساحة القرص المتاحة" : "Available Disk"}</span>
                </span>
                <span>{freeGB} / {totalGB} ({freePercentage}% {isAr ? "متبقي" : "free"})</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary-100 dark:bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    freePercentage < 15 ? "bg-rose-500" : freePercentage < 30 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(5, 100 - freePercentage))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Action Link */}
      <div className="mt-4 border-t border-secondary-100 pt-3 dark:border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-secondary-400">
          {isAr ? "حالة العميل:" : "Agent Status:"} <b className={isAgentOnline ? "text-emerald-600" : "text-rose-500"}>{backups.agentStatus}</b>
        </span>

        <Link
          href="/admin/system/backups"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
        >
          <span>{isAr ? "عرض النسخ الاحتياطية" : "View Backups"}</span>
          <ArrowUpRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}

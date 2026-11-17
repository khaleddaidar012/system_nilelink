"use client"

import { AlertTriangle, CheckCircle2, Clock, HardDrive, Server, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { AgentHealth, formatBytes, formatCairoDate, formatCairoTime, hoursSince } from "./formatters"

interface Props {
  health: AgentHealth | null
  loading: boolean
  locale: string
}

export function BackupStatusCard({ health, loading, locale }: Props) {
  const isAr = locale === "ar"
  const L = (en: string, ar: string) => (isAr ? ar : en)

  if (loading && !health) {
    return <div id="backup-status-card" className="h-28 animate-pulse rounded-2xl bg-secondary-100 dark:bg-slate-900" />
  }

  if (!health || !health.online) {
    return (
      <div id="backup-status-card" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-bold">{L("Backup agent is offline", "خادم النسخ الاحتياطي غير متصل")}</p>
          <p className="mt-1 text-xs opacity-80">
            {health?.reason === "BACKUP_NOT_CONFIGURED"
              ? L("The backup service is not configured on this server.", "خدمة النسخ الاحتياطي غير مُهيأة على هذا الخادم.")
              : health?.reason === "CF_ACCESS_DENIED"
              ? L("Cloudflare Access denied the request (verify Service Token).", "رفض Cloudflare Access الطلب (تحقق من رمز الخدمة Service Token).")
              : health?.reason === "AGENT_AUTH_FAILED"
              ? L("Backup agent rejected HMAC signature (verify HMAC secret).", "رفض وكيل النسخ توقيع HMAC (تحقق من مفتاح HMAC السري).")
              : L("Creating backups is disabled until the agent is reachable.", "تم تعطيل إنشاء النسخ حتى يتم الاتصال بالخادم.")}
          </p>
        </div>
      </div>
    )
  }


  const age = hoursSince(health.stats?.lastCompletedAt)
  const stale = age === null || age > 26
  const sch = health.scheduler
  const free = health.agent?.freeDiskBytes

  const items = [
    {
      icon: stale ? AlertTriangle : CheckCircle2,
      tone: stale ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
      label: L("Last successful backup", "آخر نسخة ناجحة"),
      value: health.stats?.lastCompletedAt
        ? `${formatCairoDate(health.stats.lastCompletedAt, locale)} ${formatCairoTime(health.stats.lastCompletedAt, locale)}`
        : L("None yet", "لا يوجد بعد"),
    },
    {
      icon: Clock,
      tone: "text-primary-600 dark:text-primary-400",
      label: L("Next scheduled run (Cairo)", "التشغيل التالي (القاهرة)"),
      value: sch?.enabled && sch.nextRunLocal ? sch.nextRunLocal : L("Scheduler off", "المجدول متوقف"),
    },
    {
      icon: HardDrive,
      tone: health.agent?.diskLow ? "text-rose-600 dark:text-rose-400" : "text-secondary-600 dark:text-slate-300",
      label: L("Free disk", "المساحة الحرة"),
      value: free !== undefined ? formatBytes(free) : "-",
    },
    {
      icon: Server,
      tone: "text-secondary-600 dark:text-slate-300",
      label: L("Tools / backups", "الأدوات / النسخ"),
      value: `mongodump ${health.tools?.mongodump ?? "?"} · ${health.stats?.totalBackups ?? 0}`,
    },
  ]

  return (
    <div id="backup-status-card" className="grid gap-3 rounded-2xl border border-secondary-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-start gap-3 rounded-xl bg-secondary-50 p-3 dark:bg-slate-900">
          <it.icon className={cn("mt-0.5 h-5 w-5 shrink-0", it.tone)} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary-500 dark:text-slate-500">{it.label}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-secondary-900 dark:text-white" dir="ltr">
              {it.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

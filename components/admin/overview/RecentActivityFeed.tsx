"use client"

import { Activity, Database, RefreshCw, AlertTriangle, CheckCircle2, User, ShieldAlert, ArrowUpRight } from "lucide-react"
import { Link } from "@/navigation"
import { cn } from "@/lib/utils"
import { ActivityItem } from "./types"

interface Props {
  activities: ActivityItem[]
  locale: string
}

export function RecentActivityFeed({ activities, locale }: Props) {
  const isAr = locale === "ar"

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-white p-8 text-center text-secondary-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
        <Activity className="mx-auto h-8 w-8 text-secondary-400 opacity-60" />
        <p className="mt-2 text-xs font-medium">
          {isAr ? "لا توجد أنشطة مسجلة حديثاً في سجل التدقيق" : "No recent activity recorded in system audit log"}
        </p>
      </div>
    )
  }

  const formatActivityTime = (isoStr: string) => {
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

  const getActivityIcon = (event: string, result: string) => {
    if (event.includes("FAIL") || result === "failure") {
      return { icon: AlertTriangle, color: "text-rose-500 bg-rose-50 dark:bg-rose-950/40" }
    }
    if (event.includes("RESTORE")) {
      return { icon: RefreshCw, color: "text-amber-500 bg-amber-50 dark:bg-amber-950/40" }
    }
    if (event.includes("BACKUP")) {
      return { icon: Database, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" }
    }
    if (event.includes("STAFF")) {
      return { icon: User, color: "text-purple-500 bg-purple-50 dark:bg-purple-950/40" }
    }
    if (event.includes("AUTH")) {
      return { icon: ShieldAlert, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40" }
    }
    return { icon: CheckCircle2, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" }
  }

  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center justify-between border-b border-secondary-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
            {isAr ? "الأنشطة وسجل التدقيق الأخير" : "Recent System Activity & Audit"}
          </h3>
        </div>
        <span className="text-[11px] text-secondary-400">
          {isAr ? "آخر 10 أحداث مسجلة" : "Last 10 Events"}
        </span>
      </div>

      <div className="mt-3 divide-y divide-secondary-100 dark:divide-slate-800/60">
        {activities.map((item) => {
          const { icon: EventIcon, color } = getActivityIcon(item.event, item.result)
          const title = isAr ? item.titleAr : item.titleEn
          const summary = isAr ? item.summaryAr : item.summaryEn

          return (
            <div key={item.id} className="flex items-start justify-between gap-3 py-3 text-xs first:pt-1 last:pb-1">
              <div className="flex items-start gap-3 min-w-0">
                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", color)}>
                  <EventIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-secondary-900 dark:text-white truncate">{title}</h4>
                    {item.actorName && (
                      <span className="shrink-0 rounded-md bg-secondary-100 px-1.5 py-0.2 text-[10px] text-secondary-600 dark:bg-slate-800 dark:text-slate-400">
                        {item.actorName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-secondary-500 dark:text-slate-400 text-[11px] leading-relaxed truncate">
                    {summary}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[10px] text-secondary-400 font-mono">
                  {formatActivityTime(item.createdAt)}
                </span>
                {item.actionUrl && (
                  <Link
                    href={item.actionUrl}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    <span>{isAr ? "تفاصيل" : "Details"}</span>
                    <ArrowUpRight className="h-3 w-3 rtl:rotate-180" />
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

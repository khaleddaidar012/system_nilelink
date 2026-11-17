"use client"

import { AlertTriangle, AlertCircle, Info, ArrowUpRight } from "lucide-react"
import { Link } from "@/navigation"
import { cn } from "@/lib/utils"
import { SystemAlertItem } from "./types"

interface Props {
  alerts: SystemAlertItem[]
  locale: string
}

export function OverviewAlertsBanner({ alerts, locale }: Props) {
  if (alerts.length === 0) return null

  const isAr = locale === "ar"

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const isCritical = alert.level === "critical"
        const isWarning = alert.level === "warning"

        const Icon = isCritical ? AlertCircle : isWarning ? AlertTriangle : Info
        const title = isAr ? alert.titleAr : alert.titleEn
        const message = isAr ? alert.messageAr : alert.messageEn
        const actionLabel = isAr ? alert.actionLabelAr : alert.actionLabelEn

        return (
          <div
            key={alert.id}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between transition-all shadow-sm",
              isCritical
                ? "border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                : isWarning
                ? "border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-sky-200 bg-sky-50/80 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200"
            )}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={cn(
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  isCritical
                    ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
                    : isWarning
                    ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                    : "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold tracking-tight">{title}</h4>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase",
                      isCritical
                        ? "bg-rose-600 text-white"
                        : isWarning
                        ? "bg-amber-600 text-white"
                        : "bg-sky-600 text-white"
                    )}
                  >
                    {isCritical ? (isAr ? "حرج" : "CRITICAL") : isWarning ? (isAr ? "تحذير" : "WARNING") : isAr ? "ملاحظة" : "INFO"}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90 leading-relaxed">{message}</p>
              </div>
            </div>

            {alert.actionUrl && actionLabel && (
              <div className="shrink-0 self-end sm:self-center">
                <Link
                  href={alert.actionUrl}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors",
                    isCritical
                      ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
                      : isWarning
                      ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
                      : "bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500"
                  )}
                >
                  <span>{actionLabel}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

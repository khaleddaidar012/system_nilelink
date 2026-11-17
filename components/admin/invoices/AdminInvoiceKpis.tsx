"use client"

import { useLocale } from "next-intl"
import { DollarSign, CheckCircle2, Clock, FileEdit } from "lucide-react"

interface AdminInvoiceKpisProps {
  metrics: {
    totalDraftCount: number
    totalConfirmedCount: number
    totalInvoicedAmount: number | null
    totalPaidAmount: number | null
    totalRemainingAmount: number | null
    currency?: string | null
    byCurrency?: Record<string, { totalInvoicedAmount: number | null; totalPaidAmount: number | null; totalRemainingAmount: number | null }>
  }
}

export function AdminInvoiceKpis({ metrics }: AdminInvoiceKpisProps) {
  const locale = useLocale()
  const isAr = locale === "ar"
  const amount = (key: "totalInvoicedAmount" | "totalPaidAmount" | "totalRemainingAmount") => {
    if (metrics.byCurrency && Object.keys(metrics.byCurrency).length) {
      return Object.entries(metrics.byCurrency).map(([currency, group]) =>
        `${group[key] === null ? (isAr ? "يتطلب مراجعة" : "Review required") : group[key].toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`).join(" · ")
    }
    return `${(metrics[key] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${metrics.currency || "EGP"}`
  }

  const cards = [
    {
      label: isAr ? "إجمالي الفواتير الصادرة" : "Total Invoiced",
      value: amount("totalInvoicedAmount"),
      icon: DollarSign,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-900/60",
    },
    {
      label: isAr ? "المبالغ المحصلة" : "Payments Collected",
      value: amount("totalPaidAmount"),
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-900/60",
    },
    {
      label: isAr ? "المستحقات المتبقية" : "Outstanding Due",
      value: amount("totalRemainingAmount"),
      icon: Clock,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-900/60",
    },
    {
      label: isAr ? "مسودات قيد المراجعة" : "Drafts Pending Review",
      value: `${metrics.totalDraftCount || 0}`,
      icon: FileEdit,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-900/60",
      highlight: (metrics.totalDraftCount || 0) > 0,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon
        return (
          <div
            key={i}
            className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border ${c.border} shadow-xs flex items-center gap-3.5`}
          >
            <div className={`p-2.5 rounded-xl ${c.color} shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                {c.label}
              </span>
              <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                {c.value}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

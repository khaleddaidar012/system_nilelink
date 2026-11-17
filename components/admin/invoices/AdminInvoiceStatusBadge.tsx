"use client"

import { useLocale } from "next-intl"
import { InvoiceStatus } from "@/lib/models/Invoice"
import { CheckCircle2, Clock, Send, AlertTriangle, XCircle, FileEdit, ShieldCheck } from "lucide-react"

interface AdminInvoiceStatusBadgeProps {
  status: InvoiceStatus | string
  className?: string
}

export function AdminInvoiceStatusBadge({ status, className = "" }: AdminInvoiceStatusBadgeProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const configs: Record<
    string,
    {
      bg: string
      text: string
      border: string
      icon: any
      labelEn: string
      labelAr: string
    }
  > = {
    draft: {
      bg: "bg-amber-50 dark:bg-amber-950/40",
      text: "text-amber-700 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800/60",
      icon: FileEdit,
      labelEn: "Draft",
      labelAr: "مسودة",
    },
    confirmed: {
      bg: "bg-blue-50 dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800/60",
      icon: ShieldCheck,
      labelEn: "Confirmed",
      labelAr: "معتمدة",
    },
    sent: {
      bg: "bg-purple-50 dark:bg-purple-950/40",
      text: "text-purple-700 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800/60",
      icon: Send,
      labelEn: "Sent",
      labelAr: "تم الإرسال",
    },
    partially_paid: {
      bg: "bg-indigo-50 dark:bg-indigo-950/40",
      text: "text-indigo-700 dark:text-indigo-400",
      border: "border-indigo-200 dark:border-indigo-800/60",
      icon: Clock,
      labelEn: "Partially Paid",
      labelAr: "مدفوعة جزئياً",
    },
    paid: {
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      text: "text-emerald-700 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800/60",
      icon: CheckCircle2,
      labelEn: "Paid in Full",
      labelAr: "مدفوعة بالكامل",
    },
    overdue: {
      bg: "bg-rose-50 dark:bg-rose-950/40",
      text: "text-rose-700 dark:text-rose-400",
      border: "border-rose-200 dark:border-rose-800/60",
      icon: AlertTriangle,
      labelEn: "Overdue",
      labelAr: "متأخرة",
    },
    cancelled: {
      bg: "bg-slate-100 dark:bg-slate-800/40",
      text: "text-slate-600 dark:text-slate-400",
      border: "border-slate-300 dark:border-slate-700",
      icon: XCircle,
      labelEn: "Cancelled",
      labelAr: "ملغاة",
    },
  }

  const config = configs[status] || {
    bg: "bg-slate-50 dark:bg-slate-800",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
    icon: Clock,
    labelEn: status,
    labelAr: status,
  }

  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{isAr ? config.labelAr : config.labelEn}</span>
    </span>
  )
}

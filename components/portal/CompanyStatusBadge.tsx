"use client"
import { useLocale } from "next-intl"
import { CheckCircle2, Clock, AlertTriangle, XCircle, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

export function CompanyStatusBadge({ status }: { status: string }) {
  const ar = useLocale() === "ar"
  const active = status === "active", restricted = status === "inactive", reviewing = status === "under_review", warning = status === "warning"
  const Icon = active ? CheckCircle2 : restricted ? XCircle : reviewing ? Clock : warning ? AlertTriangle : ShieldAlert
  const label = active ? (ar ? "شركة موثقة" : "Verified company") : restricted ? (ar ? "حساب مقيّد" : "Restricted account") : reviewing ? (ar ? "قيد المراجعة" : "Under review") : warning ? (ar ? "يتطلب متابعة" : "Action needed") : (ar ? "حساب غير موثّق" : "Unverified account")
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
    active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
    restricted ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400" :
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400") }><Icon className="h-3 w-3" /><span>{label}</span></span>
}

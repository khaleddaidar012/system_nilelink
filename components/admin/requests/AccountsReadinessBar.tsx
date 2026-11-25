"use client"

import { useState } from "react"
import { useLocale } from "next-intl"
import { CheckCircle2, Clock, Send, XCircle, Loader2 } from "lucide-react"
import { useAdminRole, useCanMarkReadyForAccounts } from "@/components/admin/AdminExperienceContext"

interface ReadinessInfo {
  state: "pending_admin" | "approved" | "rejected"
  source: "manual" | "auto"
  markedAt: string
  markedByName: string
  note?: string
  decidedByName?: string
  decisionNote?: string
}

export function AccountsReadinessBar({
  requestId,
  requestStatus,
  readiness,
  onUpdated,
}: {
  requestId: string
  requestStatus: string
  readiness?: ReadinessInfo | null
  onUpdated: () => void | Promise<void>
}) {
  const ar = useLocale() === "ar"
  const label = (a: string, e: string) => (ar ? a : e)
  const canMark = useCanMarkReadyForAccounts()
  const role = useAdminRole()
  const isAdmin = role === "super_admin"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const eligible = ["processing", "completed"].includes(requestStatus)
  if (!eligible && !readiness) return null

  async function act(action: "mark" | "approve" | "reject") {
    const note = action === "reject"
      ? (window.prompt(label("سبب الرفض (اختياري):", "Rejection note (optional):")) ?? "")
      : action === "mark"
        ? (window.prompt(label("ملاحظة للإدارة والحسابات (اختياري):", "Note for Admin & Accounts (optional):")) ?? "")
        : ""
    setBusy(true); setError("")
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/accounts-readiness`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Operation failed")
      await onUpdated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{label("حالة الجاهزية للحسابات", "Ready for Accounts Status")}</p>
          {!readiness && <p className="text-xs text-slate-500">{label("يمكن للتشغيل تحويل الشحنة إلى «جاهزة للحسابات» ليراجعها الأدمن ثم تظهر لفريق الحسابات.", "Operations can flag this shipment as ready for accounts for admin approval.")}</p>}
          {readiness?.state === "pending_admin" && <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><Clock className="h-4 w-4" />{label("تم الإرسال — بانتظار موافقة الأدمن", "Submitted — awaiting admin approval")} ({readiness.markedByName})</p>}
          {readiness?.state === "approved" && <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{label("معتمدة وظاهرة لفريق الحسابات", "Approved and visible to Accounts")}{readiness.decidedByName ? ` · ${readiness.decidedByName}` : ""}</p>}
          {readiness?.state === "rejected" && <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><XCircle className="h-4 w-4" />{label("مرفوضة من الأدمن", "Declined by admin")}{readiness.decisionNote ? ` · ${readiness.decisionNote}` : ""}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {canMark && eligible && (!readiness || readiness.state === "rejected") && (
            <button type="button" disabled={busy} onClick={() => void act("mark")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {label("جاهزة للحسابات", "Mark Ready for Accounts")}
            </button>
          )}
          {isAdmin && readiness?.state === "pending_admin" && (
            <>
              <button type="button" disabled={busy} onClick={() => void act("approve")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {label("موافقة للحسابات", "Approve for Accounts")}
              </button>
              <button type="button" disabled={busy} onClick={() => void act("reject")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300">
                <XCircle className="h-3.5 w-3.5" />
                {label("رفض", "Decline")}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
    </section>
  )
}

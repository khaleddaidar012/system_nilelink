"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Link, useRouter } from "@/navigation"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { CheckCircle2, Clock, XCircle, Receipt, ExternalLink, RefreshCw, Loader2 } from "lucide-react"

type ReadinessState = "pending_admin" | "approved" | "rejected"
interface ReadyShipment {
  id: string
  trackingNumber: string
  subject: string
  customerId: string
  customerName: string
  status: string
  readiness: {
    state: ReadinessState
    source: "manual" | "auto"
    markedAt: string
    markedByName: string
    note?: string
    decidedAt?: string
    decidedByName?: string
    decisionNote?: string
  }
}
interface Viewer { isAdmin: boolean; canDecide: boolean; canMark: boolean; canCreateInvoice: boolean }

export function AccountsReadyQueue() {
  const ar = useLocale() === "ar"
  const label = (a: string, e: string) => (ar ? a : e)
  const router = useRouter()
  const [state, setState] = useState<"all" | ReadinessState>("all")
  const [shipments, setShipments] = useState<ReadyShipment[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({ pending_admin: 0, approved: 0, rejected: 0 })
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const res = await fetch(`/api/admin/accounts-readiness?state=${state}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Unable to load ready shipments")
      setShipments(data.shipments || [])
      setCounts(data.counts || { pending_admin: 0, approved: 0, rejected: 0 })
      setViewer(data.viewer || null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [state])

  useEffect(() => { void load() }, [load])

  async function decide(id: string, decision: "approve" | "reject") {
    const note = decision === "reject" ? (window.prompt(label("سبب الرفض (اختياري):", "Rejection note (optional):")) ?? "") : ""
    setBusyId(id); setError(""); setMessage("")
    try {
      const res = await fetch(`/api/admin/requests/${id}/accounts-readiness`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: decision, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Operation failed")
      setMessage(decision === "approve" ? label("تمت الموافقة وإرسال الشحنة للحسابات", "Approved and sent to Accounts") : label("تم رفض الجاهزية وإخطار التشغيل", "Declined and notified Operations"))
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function openOrCreateInvoice(requestId: string) {
    setBusyId(requestId); setError("")
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/invoices/create`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Unable to create invoice draft")
      router.push(data.invoice?.accounting ? `/admin/shipment-invoices/${data.invoice.id}` : `/admin/invoices?edit=${data.invoice.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusyId(null)
    }
  }

  const badge = (s: ReadinessState) => {
    if (s === "approved") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{label("معتمدة للحسابات", "Approved for Accounts")}</span>
    if (s === "rejected") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"><XCircle className="h-3.5 w-3.5" />{label("مرفوضة", "Declined")}</span>
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"><Clock className="h-3.5 w-3.5" />{label("بانتظار موافقة الأدمن", "Pending Admin Approval")}</span>
  }

  const tabs: { key: "all" | ReadinessState; text: string; count?: number }[] = [
    { key: "all", text: label("الكل", "All"), count: (counts.pending_admin || 0) + (counts.approved || 0) + (counts.rejected || 0) },
    ...(viewer?.isAdmin || !viewer?.canCreateInvoice ? [{ key: "pending_admin" as const, text: label("بانتظار الموافقة", "Pending approval"), count: counts.pending_admin || 0 }] : []),
    { key: "approved", text: label("معتمدة للحسابات", "Approved"), count: counts.approved || 0 },
    ...(viewer?.isAdmin || !viewer?.canCreateInvoice ? [{ key: "rejected" as const, text: label("مرفوضة", "Declined"), count: counts.rejected || 0 }] : []),
  ]

  return (
    <div className="flex min-h-screen flex-col" dir={ar ? "rtl" : "ltr"}>
      <AdminHeader
        title={label("جاهزة للحسابات", "Ready for Accounts")}
        subtitle={label("الشحنات المكتملة أو المُحالة من التشغيل بانتظار اعتماد الأدمن ثم إصدار الفاتورة من الحسابات", "Completed or operations-flagged shipments awaiting admin approval before invoicing")}
      />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map(tab => (
              <button key={tab.key} type="button" onClick={() => setState(tab.key)}
                className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${state === tab.key ? "border-primary-600 bg-primary-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}>
                {tab.text} <span className="ms-1 opacity-80">({tab.count ?? 0})</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {label("تحديث", "Refresh")}
          </button>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">{label("جاري التحميل…", "Loading…")}</p>
          ) : shipments.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{label("لا توجد شحنات في هذه الحالة حاليًا", "No shipments in this state right now")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                    <th className="p-3 text-start">{label("رقم الطلب / الشحنة", "Request / Shipment")}</th>
                    <th className="p-3 text-start">{label("العميل", "Customer")}</th>
                    <th className="p-3 text-start">{label("المُحيل", "Flagged by")}</th>
                    <th className="p-3 text-start">{label("الحالة", "Status")}</th>
                    <th className="p-3 text-end">{label("الإجراءات", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800/80">
                      <td className="p-3">
                        <Link href={`/admin/requests/${item.id}`} className="inline-flex items-center gap-1 font-bold text-primary-700 underline dark:text-primary-300">
                          <bdi>{item.trackingNumber || item.id}</bdi>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                        {item.subject && <p className="mt-0.5 text-xs text-slate-500">{item.subject}</p>}
                      </td>
                      <td className="p-3 font-medium">{item.customerName || "—"}</td>
                      <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{item.readiness.markedByName}</p>
                        <p>{item.readiness.source === "auto" ? label("تلقائي (اكتمال المراحل)", "Auto (all stages done)") : label("يدوي (التشغيل)", "Manual (Operations)")}</p>
                        {item.readiness.note && <p className="mt-1 italic">“{item.readiness.note}”</p>}
                      </td>
                      <td className="p-3">
                        {badge(item.readiness.state)}
                        {item.readiness.decidedByName && <p className="mt-1 text-[11px] text-slate-500">{item.readiness.decidedByName}{item.readiness.decisionNote ? ` · ${item.readiness.decisionNote}` : ""}</p>}
                      </td>
                      <td className="p-3 text-end">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          {viewer?.canDecide && item.readiness.state === "pending_admin" && (
                            <>
                              <button type="button" disabled={busyId === item.id} onClick={() => void decide(item.id, "approve")}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                                {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {label("موافقة للحسابات", "Approve")}
                              </button>
                              <button type="button" disabled={busyId === item.id} onClick={() => void decide(item.id, "reject")}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300">
                                <XCircle className="h-3.5 w-3.5" />
                                {label("رفض", "Decline")}
                              </button>
                            </>
                          )}
                          {viewer?.canCreateInvoice && item.readiness.state === "approved" && (
                            <button type="button" disabled={busyId === item.id} onClick={() => void openOrCreateInvoice(item.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                              {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                              {label("إنشاء / فتح الفاتورة", "Create / Open Invoice")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Link, useRouter } from "@/navigation"
import { AdminHeader } from "@/components/admin/AdminHeader"
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Receipt,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react"

type ReadinessState = "pending_admin" | "approved" | "rejected"
type UnifiedType = "all" | "to_accounts" | "to_customer" | "delete_shipment"

interface UnifiedStaffRequest {
  uid: string
  source: "shipment_staff_request" | "request_readiness" | "invoice_approval"
  rawId: string
  shipmentId?: string
  requestId?: string
  invoiceId?: string
  requestType: "to_accounts" | "to_customer" | "delete_shipment"
  status: ReadinessState
  reference: string
  subtitle?: string
  customerName: string
  requestedByName: string
  sourceDept: string
  targetDept: string
  note?: string
  createdAt: string
  decidedByName?: string | null
  decisionNote?: string | null
}

interface Viewer {
  isAdmin: boolean
  canDecide: boolean
  canCreateInvoice: boolean
}

export function AccountsReadyQueue() {
  const ar = useLocale() === "ar"
  const label = (a: string, e: string) => (ar ? a : e)
  const router = useRouter()

  const [typeFilter, setTypeFilter] = useState<UnifiedType>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | ReadinessState>("all")
  const [items, setItems] = useState<UnifiedStaffRequest[]>([])
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [staffRes, readyRes] = await Promise.all([
        fetch("/api/admin/staff-requests", { cache: "no-store" }),
        fetch("/api/admin/accounts-readiness?state=all", { cache: "no-store" }),
      ])
      const staffData = staffRes.ok ? await staffRes.json() : { items: [], viewer: null }
      const readyData = readyRes.ok ? await readyRes.json() : { shipments: [], viewer: null }

      if (!staffRes.ok && !readyRes.ok) {
        throw new Error(staffData.error || readyData.error || "Unable to load staff requests")
      }

      const mergedViewer: Viewer = {
        isAdmin: Boolean(staffData.viewer?.isAdmin || readyData.viewer?.isAdmin),
        canDecide: Boolean(staffData.viewer?.canDecide || readyData.viewer?.canDecide),
        canCreateInvoice: Boolean(staffData.viewer?.canCreateInvoice || readyData.viewer?.canCreateInvoice),
      }
      setViewer(mergedViewer)

      const fromStaff: UnifiedStaffRequest[] = (staffData.items || []).map((row: any) => ({
        uid: row.requestType === "to_customer" ? `inv:${row.invoiceId}` : `ssr:${row.id}`,
        source: row.requestType === "to_customer" ? "invoice_approval" : "shipment_staff_request",
        rawId: row.id,
        shipmentId: row.shipmentId || undefined,
        invoiceId: row.invoiceId || undefined,
        requestType: row.requestType,
        status: row.status,
        reference: row.shipmentBooking || row.invoiceNumber || row.shipmentId || row.id,
        subtitle: row.shippingLine || (row.ucr ? `UCR: ${row.ucr}` : ""),
        customerName: row.shipmentShipper || "",
        requestedByName: row.requestedByName || "",
        sourceDept: row.sourceDept || "operations",
        targetDept: row.targetDept || "accounts",
        note: row.note || "",
        createdAt: row.createdAt || "",
        decidedByName: row.decidedByName,
        decisionNote: row.decisionNote,
      }))

      const fromReadiness: UnifiedStaffRequest[] = (readyData.shipments || []).map((row: any) => ({
        uid: `req:${row.id}`,
        source: "request_readiness",
        rawId: row.id,
        requestId: row.id,
        requestType: "to_accounts",
        status: row.readiness.state,
        reference: row.trackingNumber || row.id,
        subtitle: row.subject || "",
        customerName: row.customerName || "",
        requestedByName: row.readiness.markedByName || "",
        sourceDept: "operations",
        targetDept: "accounts",
        note: row.readiness.note || "",
        createdAt: row.readiness.markedAt || "",
        decidedByName: row.readiness.decidedByName,
        decisionNote: row.readiness.decisionNote,
      }))

      const merged = [...fromStaff, ...fromReadiness].sort(
        (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
      )
      setItems(merged)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function decideItem(item: UnifiedStaffRequest, decision: "approve" | "reject") {
    const note =
      decision === "reject"
        ? (window.prompt(label("سبب الرفض (اختياري):", "Rejection note (optional):")) ?? "")
        : ""
    setBusyId(item.uid)
    setError("")
    setMessage("")
    try {
      if (item.source === "request_readiness" && item.requestId) {
        const res = await fetch(`/api/admin/requests/${item.requestId}/accounts-readiness`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: decision, note }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Operation failed")
      } else {
        const res = await fetch("/api/admin/staff-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "decide", id: item.rawId, decision, note }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Operation failed")
      }

      setMessage(
        decision === "approve"
          ? item.requestType === "delete_shipment"
            ? label("تمت الموافقة وتنفيذ حذف الشحنة وإخطار الموظف.", "Approved, shipment deleted, and staff notified.")
            : label("تمت الموافقة وتحويل الشحنة للحسابات.", "Approved and transferred to Accounts.")
          : label("تم رفض الطلب وإخطار الموظف.", "Request declined and staff notified.")
      )
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function openOrCreateInvoice(item: UnifiedStaffRequest) {
    setBusyId(item.uid)
    setError("")
    try {
      if (item.source === "request_readiness" && item.requestId) {
        const res = await fetch(`/api/admin/requests/${item.requestId}/invoices/create`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Unable to create invoice draft")
        router.push(data.invoice?.accounting ? `/admin/shipment-invoices/${data.invoice.id}` : `/admin/invoices?edit=${data.invoice.id}`)
      } else if (item.shipmentId) {
        router.push(`/admin/shipment-invoices?shipmentId=${item.shipmentId}`)
      }
    } catch (err) {
      setError((err as Error).message)
      setBusyId(null)
    }
  }

  const deptLabel = (dept: string) => {
    if (dept === "operations") return label("التشغيل", "Operations")
    if (dept === "accounts") return label("الحسابات", "Accounts")
    if (dept === "customer") return label("العميل", "Customer")
    return label("الإدارة", "Admin")
  }

  const typeBadge = (t: UnifiedStaffRequest["requestType"]) => {
    if (t === "delete_shipment") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          <Trash2 className="h-3 w-3" />
          {label("طلب حذف شحنة", "Delete Shipment")}
        </span>
      )
    }
    if (t === "to_customer") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Receipt className="h-3 w-3" />
          {label("تحويل فاتورة للعميل", "Transfer to Customer")}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
        <ArrowRightLeft className="h-3 w-3" />
        {label("تحويل للحسابات", "Transfer to Accounts")}
      </span>
    )
  }

  const statusBadge = (s: ReadinessState) => {
    if (s === "approved") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {label("تمت الموافقة", "Approved")}
        </span>
      )
    }
    if (s === "rejected") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          <XCircle className="h-3.5 w-3.5" />
          {label("مرفوض", "Declined")}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        <Clock className="h-3.5 w-3.5" />
        {label("بانتظار موافقة الأدمن", "Pending Admin Approval")}
      </span>
    )
  }

  const filtered = items.filter(item => {
    if (typeFilter !== "all" && item.requestType !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    return true
  })

  const pageTitle = viewer?.isAdmin
    ? label("طلبات الموظفين", "Staff Requests")
    : viewer?.canCreateInvoice
      ? label("طلبات التحويل للحسابات", "Transfers to Accounts")
      : label("طلبات الموظف", "My Submitted Requests")

  return (
    <div className="flex min-h-screen flex-col" dir={ar ? "rtl" : "ltr"}>
      <AdminHeader
        title={pageTitle}
        subtitle={label(
          "مراجعة واعتماد طلبات التحويل إلى الحسابات، تحويل الفواتير للعميل، وطلبات حذف الشحنات",
          "Review and approve transfers to Accounts, invoice transfers to customers, and shipment deletion requests"
        )}
      />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-7">
        {/* Type & Status Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "all", text: label("كل الطلبات", "All requests"), count: items.length },
                { key: "to_accounts", text: label("تحويل للحسابات", "To Accounts"), count: items.filter(i => i.requestType === "to_accounts").length },
                ...(viewer?.isAdmin || viewer?.canCreateInvoice
                  ? [{ key: "to_customer", text: label("تحويل للعميل", "To Customer"), count: items.filter(i => i.requestType === "to_customer").length }]
                  : []),
                ...(viewer?.isAdmin || !viewer?.canCreateInvoice
                  ? [{ key: "delete_shipment", text: label("طلبات حذف شحنة", "Delete Requests"), count: items.filter(i => i.requestType === "delete_shipment").length }]
                  : []),
              ] as { key: UnifiedType; text: string; count: number }[]
            ).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeFilter(tab.key)}
                className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                  typeFilter === tab.key
                    ? "border-primary-600 bg-primary-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {tab.text} <span className="ms-1 opacity-80">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as "all" | ReadinessState)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">{label("كل الحالات", "All statuses")}</option>
              <option value="pending_admin">{label("بانتظار الموافقة", "Pending approval")}</option>
              <option value="approved">{label("معتمد", "Approved")}</option>
              <option value="rejected">{label("مرفوض", "Declined")}</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {label("تحديث", "Refresh")}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">{label("جاري التحميل…", "Loading…")}</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {label("لا توجد طلبات مطابقة حاليًا", "No matching requests right now")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                    <th className="p-3 text-start">{label("الشحنة / المرجع", "Shipment / Ref")}</th>
                    <th className="p-3 text-start">{label("العميل", "Customer")}</th>
                    <th className="p-3 text-start">{label("نوع الطلب", "Request Type")}</th>
                    <th className="p-3 text-start">{label("اسم الموظف والقسم", "Staff & Department")}</th>
                    <th className="p-3 text-start">{label("الحالة", "Status")}</th>
                    <th className="p-3 text-end">{label("الإجراءات", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const inspectHref =
                      item.source === "invoice_approval" && item.invoiceId
                        ? `/admin/shipment-invoices/${item.invoiceId}`
                        : item.requestId
                          ? `/admin/requests/${item.requestId}`
                          : `/admin/coming-soon/shipments`

                    return (
                      <tr key={item.uid} className="border-b border-slate-100 dark:border-slate-800/80">
                        <td className="p-3">
                          <Link
                            href={inspectHref}
                            className="inline-flex items-center gap-1 font-bold text-primary-700 underline dark:text-primary-300"
                          >
                            <bdi dir="ltr">{item.reference}</bdi>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          {item.subtitle && <p className="mt-0.5 text-xs text-slate-500">{item.subtitle}</p>}
                        </td>
                        <td className="p-3 font-medium">{item.customerName || "—"}</td>
                        <td className="p-3">{typeBadge(item.requestType)}</td>
                        <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{item.requestedByName}</p>
                          <p>
                            {deptLabel(item.sourceDept)} ← {deptLabel(item.targetDept)}
                          </p>
                          {item.note && <p className="mt-1 italic">“{item.note}”</p>}
                        </td>
                        <td className="p-3">
                          {statusBadge(item.status)}
                          {item.decidedByName && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              {item.decidedByName}
                              {item.decisionNote ? ` · ${item.decisionNote}` : ""}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-end">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            {item.source === "invoice_approval" && item.invoiceId && (
                              <Link
                                href={`/admin/shipment-invoices/${item.invoiceId}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                                {viewer?.isAdmin ? label("مراجعة ونشر للعميل", "Review & Publish") : label("فتح الفاتورة", "Open Invoice")}
                              </Link>
                            )}

                            {viewer?.canDecide && item.source !== "invoice_approval" && item.status === "pending_admin" && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === item.uid}
                                  onClick={() => void decideItem(item, "approve")}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {busyId === item.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {item.requestType === "delete_shipment"
                                    ? label("موافقة وحذف", "Approve Delete")
                                    : label("موافقة للحسابات", "Approve")}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === item.uid}
                                  onClick={() => void decideItem(item, "reject")}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  {label("رفض", "Decline")}
                                </button>
                              </>
                            )}

                            {viewer?.canCreateInvoice && item.requestType === "to_accounts" && item.status === "approved" && (
                              <button
                                type="button"
                                disabled={busyId === item.uid}
                                onClick={() => void openOrCreateInvoice(item)}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                              >
                                {busyId === item.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                                {label("إنشاء / فتح الفاتورة", "Create / Open Invoice")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

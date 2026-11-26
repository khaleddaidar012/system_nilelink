"use client"
import {MoneyInput} from "./MoneyInput"

import { useEffect, useRef, useState } from "react"
import { useLocale } from "next-intl"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Link, useRouter } from "@/navigation"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { AccountsHubTabs } from "@/components/admin/accounts/AccountsHubTabs"
import { ProfessionalOnePageInvoice } from "@/components/shared/ProfessionalOnePageInvoice"
import { stages, currencies, previewTotals, draftSchema, minor } from "@/lib/shipments/accounting"
import type { AccountingDraft, CostInput, Publication } from "@/lib/shipments/accounting"
import type { accountingStaffView } from "@/lib/shipments/invoice-privacy"
import { AccountsUpdates } from "./AccountsUpdates"
import { InvoiceBreakdown } from "@/components/shared/InvoiceBreakdown"
import { shipmentOptionLabel, type ShipmentOption } from "@/lib/shipments/accounting-options"
import { LineSalePrice } from "./LineSalePrice"
import { TieredPricingEditor } from "./TieredPricingEditor"

type Invoice = ReturnType<typeof accountingStaffView>
type Permissions = { canCreate: boolean; canEdit: boolean; canPublish: boolean; viewSensitive: boolean; canUseTieredPricing?:boolean }
type Audit = { _id: string; action: string; actorName: string; createdAt: string }
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
const buttonClass = "inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-700"
const primaryClass = buttonClass + " border-transparent bg-primary-600 text-white hover:bg-primary-700"
const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"

async function api(url: string, method = "GET", input?: unknown) {
  const result = await fetch(url, { method, cache: "no-store", headers: { "content-type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
  const data = await result.json()
  if (!result.ok) throw new Error(`${result.status} · ${data.error || "Unable to complete operation"}`)
  return data
}
function useLabels() {
  const ar = useLocale() === "ar"
  return { ar, label: (arabic: string, english: string) => ar ? arabic : english }
}
export interface ShipmentMeta {
  booking?: string
  shipmentDate?: string
  number46?: string
  ucr?: string
  shippingLine?: string
  containerCount?: number | null
  containerSize?: string
}

export function CustomerInvoicePreview({ snapshot, shipmentMeta }: { snapshot: Publication; shipmentMeta?: ShipmentMeta | null }) {
  const { ar } = useLabels()
  const snap = snapshot as Publication & {
    shipmentDate?: string
    number46?: string
    ucr?: string
    containerCount?: number
    containerSize?: string
    shippingLine?: string
  }
  return (
    <ProfessionalOnePageInvoice
      ar={ar}
      invoiceNumber={snapshot.referenceNumber || snapshot.invoiceNumber}
      referenceNumber={snapshot.referenceNumber}
      issueDate={snapshot.publishedAt}
      currency={snapshot.currency}
      customerName={snapshot.customerName}
      bookingNumber={shipmentMeta?.booking || snapshot.booking}
      containerCount={shipmentMeta?.containerCount ?? snap.containerCount}
      containerSize={shipmentMeta?.containerSize || snap.containerSize}
      certificateNumber={shipmentMeta?.ucr || snap.ucr}
      number46={shipmentMeta?.number46 || snap.number46}
      shipmentDate={shipmentMeta?.shipmentDate || snap.shipmentDate || snapshot.publishedAt}
      shippingLine={shipmentMeta?.shippingLine || snap.shippingLine}
      items={snapshot.items.map(i => ({ description: i.description, amount: i.amount }))}
      groups={snapshot.groups}
      total={snapshot.total}
      notes={snapshot.notes}
      showPrintButton
    />
  )
}

export function ShipmentInvoiceList({
  initialShipmentId = "",
  initialCustomerId = "",
  initialCustomerName = "",
  initialScope = "all",
}: {
  initialShipmentId?: string
  initialCustomerId?: string
  initialCustomerName?: string
  initialScope?: "all" | "active"
}) {
  const { ar, label } = useLabels()
  const router = useRouter()
  const [rows, setRows] = useState<Invoice[]>([])
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [filterCustomerId, setFilterCustomerId] = useState(initialCustomerId)
  const [filterCustomerName, setFilterCustomerName] = useState(initialCustomerName)
  const [scope, setScope] = useState<"all" | "active">(initialScope)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(Boolean(initialShipmentId))
  const [busy, setBusy] = useState(false)
  const [shipmentId, setShipmentId] = useState(initialShipmentId)
  const [customerId, setCustomerId] = useState("")
  const [requestId, setRequestId] = useState("")
  const [requestSearch, setRequestSearch] = useState("")
  const [requests, setRequests] = useState<{id:string;trackingNumber:string;subject:string}[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [currency, setCurrency] = useState("EGP")
  const [dueDate, setDueDate] = useState("")
  const [shipmentSearch, setShipmentSearch] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [customers, setCustomers] = useState<{ id: string; customerCode?: string; companyName: string }[]>([])
  useEffect(() => {
    let disposed = false
    setLoading(true)
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ q: search, status, page: String(page), scope })
      if (filterCustomerId) qs.set("customerId", filterCustomerId)
      api(`/api/admin/shipment-invoices?${qs}`)
        .then(data => { if (!disposed) { setRows(data.invoices); setTotal(data.total); setPermissions(data.permissions); setError("") } })
        .catch(error => { if (!disposed) setError(error.message) })
        .finally(() => { if (!disposed) setLoading(false) })
    }, 250)
    return () => { disposed = true; clearTimeout(timer) }
  }, [search, status, page, filterCustomerId, scope])
  useEffect(() => {
    if (!creating || !permissions?.canCreate) return
    let disposed = false
    const timer = setTimeout(() => {
      api(`/api/admin/customers/search?q=${encodeURIComponent(customerSearch)}`)
        .then(customers => { if (!disposed) setCustomers(customers.customers) })
        .catch(error => { if (!disposed) setError(error.message) })
    }, 250)
    return () => { disposed = true; clearTimeout(timer) }
  }, [creating, permissions?.canCreate, customerSearch])
  useEffect(() => {
    if (!creating || !permissions?.canCreate || !customerId) return
    let disposed = false
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ forAccounting: "1", customerId, q: shipmentSearch })
      if (initialShipmentId && !shipmentSearch) params.set("id", initialShipmentId)
      if (requestId && requestId !== "standalone") params.set("requestId", requestId)
      api(`/api/admin/shipments?${params}`).then(data => { if (!disposed) setShipments(data.records) })
        .catch(error => { if (!disposed) setError(error.message) })
    }, 250)
    return () => { disposed = true; clearTimeout(timer) }
  }, [creating, permissions?.canCreate, customerId, requestId, shipmentSearch, initialShipmentId])
  useEffect(() => {
    if (!creating || !permissions?.canCreate || !customerId) return
    let disposed = false
    const timer = setTimeout(() => {
      setRequestsLoading(true)
      api(`/api/admin/shipment-invoices/request-options?${new URLSearchParams({customerId,q:requestSearch})}`)
        .then(data => { if (!disposed) setRequests(data.requests) })
        .catch(error => { if (!disposed) setError(error.message) })
        .finally(() => { if (!disposed) setRequestsLoading(false) })
    }, 250)
    return () => { disposed = true; clearTimeout(timer) }
  }, [creating, permissions?.canCreate, customerId, requestSearch])
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      const data = await api("/api/admin/shipment-invoices", "POST", { shipmentId, customerId, currency, ...(requestId && requestId !== "standalone" ? { requestId } : {}), ...(dueDate ? { dueDate } : {}) })
      router.push(`/admin/shipment-invoices/${data.invoice.id}`)
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  return <div dir={ar ? "rtl" : "ltr"}>
    <AdminHeader title={label("حسابات وفواتير الشحنات", "Shipment accounting & invoices")} subtitle={label("مسودة داخلية لكل شحنة حتى ينشرها الأدمن", "One internal draft per shipment until an administrator publishes it")} />
    <AccountsHubTabs />
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
      {filterCustomerId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs font-bold text-primary-900 dark:border-primary-900 dark:bg-primary-950/40 dark:text-primary-200">
          <span>
            {scope === "active"
              ? label(`فواتير الشحنات النشطة للعميل: ${filterCustomerName || rows[0]?.customerName || filterCustomerId}`, `Active shipment invoices for customer: ${filterCustomerName || rows[0]?.customerName || filterCustomerId}`)
              : label(`فواتير الشحنات للعميل: ${filterCustomerName || rows[0]?.customerName || filterCustomerId}`, `Shipment invoices for customer: ${filterCustomerName || rows[0]?.customerName || filterCustomerId}`)}
          </span>
          <button
            type="button"
            onClick={() => { setFilterCustomerId(""); setFilterCustomerName(""); setScope("all"); setPage(1) }}
            className="rounded-lg border border-primary-300 bg-white px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-slate-900 dark:text-primary-300"
          >
            {label("عرض كل الفواتير", "Show all invoices")}
          </button>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-3"><Link href="/admin/invoices" className={buttonClass}>{label("كل الفواتير والمدفوعات", "All invoices & payments")}</Link>
        {permissions?.canCreate && <button className={primaryClass} onClick={() => setCreating(!creating)}>{creating ? label("إلغاء", "Cancel") : label("فاتورة لشحنة موجودة", "Invoice an existing shipment")}</button>}</div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{label("تعذر تنفيذ العملية. راجع البيانات أو الصلاحيات، وفي حالة التعارض أعد تحميل الفاتورة.", "Operation failed. Check the values and permissions. Reload the invoice if it changed.")} <bdi>{error}</bdi></p>}
      {permissions && <AccountsUpdates />}
      {creating && permissions?.canCreate && <form onSubmit={create} className={panelClass + " grid gap-4 md:grid-cols-2"}>
        <label className="text-sm">{label("١. العميل المسجل · ابحث بالاسم أو كود العميل", "1. Registered customer · search name or code")}<input className={inputClass} value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerId(""); setRequestId(""); setRequests([]); setRequestsLoading(false); setRequestSearch(""); setShipments([]); setShipmentId(initialShipmentId) }} />
          <select required className={inputClass} value={customerId} onChange={event => { setCustomerId(event.target.value); setRequestId(""); setRequests([]); setRequestsLoading(false); setRequestSearch(""); setShipments([]); setShipmentId(initialShipmentId) }}><option value="">{label("اختر الحساب المرتبط بالفاتورة", "Choose the invoice customer account")}</option>{customers.map(item => <option dir="ltr" key={item.id} value={item.id}>{item.customerCode ? `${item.customerCode} · ` : ""}{item.companyName}</option>)}</select></label>
        <label className="text-sm">{label("٢. طلب العميل · ابحث بالرقم أو الموضوع", "2. Customer request · search number or subject")}<input disabled={!customerId} className={inputClass} value={requestSearch} onChange={event => { setRequestSearch(event.target.value); setRequestId(""); setShipments([]); setShipmentId(initialShipmentId) }} />
          <select required disabled={!customerId || requestsLoading} className={inputClass} value={requestId} onChange={event => { setRequestId(event.target.value); setShipments([]); setShipmentId(initialShipmentId) }}><option value="">{requestsLoading ? label("جارٍ تحميل الطلبات…", "Loading requests…") : label("اختر طلب العميل لربط الفاتورة به", "Choose the customer request")}</option>{requests.map(item => <option dir="ltr" key={item.id} value={item.id}>{item.trackingNumber} · {item.subject}</option>)}<option value="standalone">{label("فاتورة مباشرة للعميل · بدون طلب", "Direct customer invoice · no request")}</option></select></label>
        <label className="text-sm md:col-span-2">{label("٣. سجل الشحنة · رقم الطلب أو الحجز", "3. Shipment record · request or booking number")}<input disabled={!customerId} className={inputClass} value={shipmentSearch} onChange={event => { setShipmentSearch(event.target.value); setShipmentId("") }} />
          <select required disabled={!customerId} className={inputClass} value={shipmentId} onChange={event => setShipmentId(event.target.value)}><option value="">{label("اختر سجل الشحنة", "Choose shipment record")}</option>{shipments.map(item => <option dir="ltr" key={item.id} value={item.id}>{shipmentOptionLabel(item, ar)}</option>)}</select>
          <span className="mt-2 block text-xs text-slate-500">{label("رقم الحجز هو مرجع الخط الملاحي. سجلات الشحن غير المرتبطة لا يُنسب لها رقم طلب حتى تربطها صراحة بالعميل والطلب المختارين.", "Booking numbers are carrier references. Unlinked shipment records get a request reference only after you explicitly link them to the selected customer and request.")}</span></label>
        <label className="text-sm">{label("عملة الفاتورة الأساسية", "Invoice base currency")}<select className={inputClass} value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="text-sm">{label("تاريخ الاستحقاق (اختياري)", "Due date (optional)")}<input type="date" className={inputClass} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
        <p className="text-xs text-slate-500 md:col-span-2">{label("الفاتورة مرتبطة بمعرّف الشحنة والعميل المختار. إذا كانت للشحنة فاتورة بالفعل، سيتم فتحها.", "The invoice is linked to this shipment and the selected customer. An existing shipment invoice will be opened.")}</p>
        <button disabled={busy || !customerId || !requestId || !shipmentId} className={primaryClass}>{label("إنشاء / فتح المسودة", "Create / open draft")}</button>
      </form>}
      <section className={panelClass}>
        <div className="mb-4 flex flex-wrap gap-3"><input aria-label={label("البحث", "Search")} placeholder={label("رقم الشحنة أو الفاتورة أو العميل", "Shipment, invoice number or customer")} className={inputClass + " sm:max-w-md"} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
          <select aria-label={label("الحالة", "Status")} className={inputClass + " sm:max-w-xs"} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="all">{label("كل الحالات", "All statuses")}</option><option value="draft">Draft · {label("مسودة / مراجعة", "Draft / revision")}</option><option value="awaiting_approval">{label("بانتظار اعتماد الأدمن", "Awaiting admin approval")}</option><option value="published">Published · {label("منشورة", "Published")}</option></select></div>
        {loading ? <p role="status">{label("جاري التحميل…", "Loading…")}</p> : <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr>{[label("الفاتورة", "Invoice"), label("الشحنة", "Shipment"), label("العميل", "Customer"), label("الحالة", "Status"), label("سعر البيع للعميل", "Selling price")].map(title => <th className="p-3 text-start" key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800">
          <td className="p-3"><Link className="font-bold text-primary-700 underline dark:text-primary-300" href={`/admin/shipment-invoices/${row.id}`}>{row.referenceNumber || row.invoiceNumber}</Link></td><td className="p-3"><bdi>{row.booking}</bdi></td><td className="p-3">{row.customerName}</td><td className="p-3">{row.status === "draft" ? "Draft" : "Published"}{row.pendingRevision && <span className="ms-2 text-amber-700">+ Draft v{row.publications.length + 1}</span>}{row.approvalRequest && <span className="ms-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{label("بانتظار الاعتماد", "Awaiting approval")}</span>}</td><td className="p-3"><bdi>{row.totals.customerTotal} {row.currency}</bdi></td>
        </tr>)}</tbody></table>{!rows.length && <p className="p-5 text-center text-slate-500">{label("لا توجد فواتير مطابقة", "No matching invoices")}</p>}</div>}
        <div className="mt-5 flex justify-end gap-3"><button className={buttonClass} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>{label("السابق", "Previous")}</button><span className="p-2">{page} / {Math.max(1, Math.ceil(total / 20))}</span><button className={buttonClass} disabled={loading || page * 20 >= total} onClick={() => setPage(page + 1)}>{label("التالي", "Next")}</button></div>
      </section>
    </div>
  </div>
}

type EditableDraft = { stages: AccountingDraft["stages"]; sellingPrice: string; notes: string }
function editableDraft(invoice: Invoice): EditableDraft {
  return { stages: structuredClone(invoice.draft.stages), sellingPrice: invoice.draft.sellingPrice, notes: invoice.draft.notes }
}
function draftSaveInput(invoice: Invoice, draft: EditableDraft) {
  return { revision: invoice.revision, pricingMode: "per-item-v1" as const, notes: draft.notes,
    stages: Object.fromEntries(stages.map(stage => [stage, { completed: draft.stages[stage].completed,
      costs: draft.stages[stage].costs.map(cost => ({ id: cost.id, description: cost.description, amount: cost.amount,
        currency: cost.currency, exchangeRate: cost.exchangeRate, notes: cost.notes,
        isTiered:cost.isTiered,tiers:cost.tiers,
        saleEqualsCost: cost.saleEqualsCost !== false, ...(cost.saleEqualsCost === false ? { sellingPrice: cost.sellingPrice } : {}) })) }])) }
}
export function ShipmentInvoiceEditor({ id }: { id: string }) {
  const { ar, label } = useLabels()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [shipmentMeta, setShipmentMeta] = useState<ShipmentMeta | null>(null)
  const [draft, setDraft] = useState<ReturnType<typeof editableDraft> | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])
  const [stage, setStage] = useState<typeof stages[number]>("shipping")
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState<{ snapshot: Publication; previewKey: string; revision: number } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [revisionReason, setRevisionReason] = useState("")
  const [expandedCostId, setExpandedCostId] = useState<string | null>(null)
  const costsContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!expandedCostId) return
      const activeEl = costsContainerRef.current?.querySelector(`[data-cost-id="${expandedCostId}"]`)
      if (activeEl && !activeEl.contains(event.target as Node)) {
        setExpandedCostId(null)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [expandedCostId])
  function accept(data: { invoice: Invoice; shipmentMeta?: ShipmentMeta | null; permissions: Permissions; audit?: Audit[] }) {
    setInvoice(data.invoice); setDraft(editableDraft(data.invoice)); setPermissions(data.permissions); setDirty(false); setPreview(null)
    if (data.shipmentMeta !== undefined) setShipmentMeta(data.shipmentMeta)
    if (data.audit) setAudit(data.audit)
  }
  async function reload() {
    setBusy(true); setError("")
    try { accept(await api(`/api/admin/shipment-invoices/${id}`)) } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => {
    let disposed = false
    api(`/api/admin/shipment-invoices/${id}`).then(data => { if (!disposed) accept(data) }).catch(error => { if (!disposed) setError(error.message) })
    return () => { disposed = true }
  }, [id])
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])
  function change(next: NonNullable<typeof draft>) { setDraft(next); setDirty(true); setPreview(null); setMessage(""); setError("") }
  function changeCost(index: number, patch: Partial<CostInput>) {
    if (!draft) return
    const next = structuredClone(draft)
    Object.assign(next.stages[stage].costs[index], patch)
    change(next)
  }
  function addCost() {
    if (!draft || !invoice || busy) return
    const next = structuredClone(draft)
    const newId = crypto.randomUUID()
    next.stages[stage].costs.unshift({ id: newId, description: "", amount: "", saleEqualsCost: true, currency: invoice.currency, exchangeRate: "1", notes: "", createdAt: "", createdBy: "", updatedAt: "", updatedBy: "" })
    change(next)
    setExpandedCostId(newId)
  }
  async function operation(action: "save" | "preview" | "publish" | "revise" | "request-approval") {
    if (!invoice || !draft || busy) return
    if (action === "save" && (!canSave || !amountsValid)) {
      const issue = saveValidation?.success === false ? saveValidation.error.issues[0] : undefined
      const invalidStage = issue?.path[0] === "stages" ? issue.path[1] : undefined
      if (stages.includes(invalidStage as typeof stages[number])) setStage(invalidStage as typeof stages[number])
      setError(saveProblem)
      document.getElementById("shipment-invoice-costs")?.scrollIntoView({ block: "start", behavior: "smooth" })
      return
    }
    if ((action === "preview" || action === "publish" || action === "request-approval") && (dirty || !canPreview)) {
      setError("Complete at least one stage and enter the customer selling price before publication")
      return
    }
    setBusy(true); setError(""); setMessage("")
    try {
      if (action === "save") {
        accept(await api(`/api/admin/shipment-invoices/${id}`, "PUT", draftSaveInput(invoice, draft)))
        setMessage(label("تم حفظ المسودة وحساب الإجماليات على الخادم", "Draft saved and totals calculated on the server"))
      } else {
        const data = await api(`/api/admin/shipment-invoices/${id}/${action}`, "POST", { revision: invoice.revision,
          ...(action === "publish" ? { previewKey: preview?.previewKey } : {}), ...(action === "revise" ? { reason: revisionReason } : {}) })
        if (action === "preview") { setPreview(data); setConfirmed(false) }
        else { accept(data); setRevisionReason(""); setMessage(action === "publish" ? label("تم النشر للعميل", "Published to customer") : action === "request-approval" ? label("تم إرسال طلب اعتماد الفاتورة للأدمن", "Approval request sent to administrator") : label("تم فتح مسودة مراجعة مستقلة عن النسخة المنشورة", "Revision draft started. The published version remains unchanged.")) }
      }
      if (action !== "preview") {
        const detail = await api(`/api/admin/shipment-invoices/${id}`)
        setAudit(detail.audit)
      }
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  const title = invoice?.shipmentId ? label("فاتورة الشحنة", "Shipment invoice") : label("فاتورة الطلب", "Request invoice")
  const stageLabels = { shipping: label("الشحن", "Shipping"), transportation: label("النقل", "Transportation"), customs: label("التخليص الجمركي", "Customs clearance") }
  const auditLabels: Record<string, string> = {
    shipment_invoice_created: label("إنشاء مسودة فاتورة الشحنة", "Shipment invoice draft created"),
    shipment_draft_saved: label("حفظ بيانات المسودة", "Draft saved"),
    shipment_revision_started: label("فتح إصدار مراجعة", "Revision started"),
    shipment_invoice_published: label("نشر الفاتورة للعميل", "Invoice published to customer"),
    shipment_approval_requested: label("إرسال طلب اعتماد للأدمن", "Sent for admin approval"),
    invoice_request_linked: label("ربط الفاتورة بالطلب", "Invoice linked to request"),
    payment_recorded: label("تسجيل دفعة", "Payment recorded"),
  }
  const editing = Boolean(invoice && permissions?.canEdit && (invoice.status === "draft" || invoice.pendingRevision))
  const requiresPricingSave = editing && invoice?.draft.pricingMode !== "per-item-v1"
  let displayTotals = invoice?.totals
  let amountsValid = true
  const saveValidation = invoice && draft ? draftSchema.safeParse(draftSaveInput(invoice, draft)) : null
  const canSave = Boolean(saveValidation?.success)
  if (invoice && draft) {
    try { displayTotals = previewTotals({ ...draft, pricingMode: editing ? "per-item-v1" : invoice.draft.pricingMode, internalSellingPrice: draft.sellingPrice, customerItems: [] }, invoice.currency) }
    catch { amountsValid = false }
  }
  const incompleteStages = draft ? stages.filter(key => !draft.stages[key].completed) : []
  const saveIssue = saveValidation?.success === false ? saveValidation.error.issues[0] : undefined
  const issueStage = saveIssue?.path[0] === "stages" ? saveIssue.path[1] as typeof stages[number] : undefined
  const issueRow = typeof saveIssue?.path[3] === "number" ? saveIssue.path[3] + 1 : undefined
  const fieldLabels: Record<string, string> = {
    description: label("وصف البند", "Item description"), amount: label("المبلغ", "Amount"),
    exchangeRate: label("سعر التحويل", "Exchange rate"), currency: label("العملة", "Currency"),
    sellingPrice: label("سعر البيع", "Selling price"), notes: label("الملاحظات", "Notes"),
  }
  const issueField = String(saveIssue?.path.at(-1) ?? "")
  const saveProblem = saveIssue
    ? [label("راجع الخانة المطلوبة أو القيمة غير الصحيحة", "Check the required field or invalid value"), issueStage ? stageLabels[issueStage] : "", issueRow ? label(`البند ${issueRow}`, `Item ${issueRow}`) : "", fieldLabels[issueField] ?? ""].filter(Boolean).join(" · ")
    : label("راجع المبالغ وأسعار التحويل في المراحل الثلاث؛ سعر التحويل لنفس العملة يجب أن يكون 1.", "Check amounts and exchange rates in all three stages; the same-currency exchange rate must be 1.")
  const positiveSellingPrice = amountsValid && minor(displayTotals?.customerTotal ?? "0.00") > BigInt(0)
  const canPreview = canSave && amountsValid && !requiresPricingSave && positiveSellingPrice && incompleteStages.length < stages.length
  const isLoss = displayTotals?.expectedProfit?.startsWith("-") ?? false
  const publicationError = error.includes("Complete at least one stage and enter the customer selling price")
  const errorMessages: [string, string][] = [
    ["Invoice changed.", "الفاتورة اتعدلت منذ فتح الصفحة. تعديلاتك الحالية ما زالت موجودة؛ احتفظ بها قبل إعادة التحميل."],
    ["Workflow changed concurrently", "حدث تعديل متزامن أثناء الحفظ. تعديلاتك ما زالت موجودة؛ جرّب الحفظ مرة أخرى."],
    ["Invalid draft data", "بعض بيانات المسودة غير صالحة. راجع وصف ومبلغ وعملة كل بند وسعر البيع."],
    ["Invalid financial amount or exchange rate", "راجع المبالغ وأسعار التحويل؛ سعر التحويل لنفس العملة يجب أن يكون 1."],
    ["Invoice editing permission required", "صلاحية تعديل الفواتير غير متاحة لحسابك حاليًا. اطلب من الأدمن مراجعتها."],
    ["Invalid origin", "تعذر التحقق من عنوان الموقع. افتح nilelinklogistics.com مباشرة ثم حاول الحفظ."],
    ["Start an explicit revision", "الفاتورة منشورة بالفعل؛ ابدأ إصدار مراجعة قبل تعديلها."],
  ]
  const translatedError = errorMessages.find(([match]) => error.includes(match))?.[1]
  const errorStatus = error.match(/^\d{3}/)?.[0]
  return <div dir={ar ? "rtl" : "ltr"}>
    <AdminHeader title={title} subtitle={invoice ? `${invoice.referenceNumber || invoice.invoiceNumber} · ${invoice.booking} · ${invoice.customerName}` : undefined} />
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
      <div className="flex flex-wrap justify-between gap-3"><div className="flex flex-wrap gap-3"><Link href={invoice?.customerId ? `/admin/shipment-invoices?customerId=${encodeURIComponent(invoice.customerId)}&customerName=${encodeURIComponent(invoice.customerName || "")}&scope=active` : "/admin/shipment-invoices"} className={buttonClass}>{label("قائمة فواتير الشحنات", "Shipment invoice list")}</Link>{invoice?.relatedRequestId && <Link href={`/admin/requests/${invoice.relatedRequestId}`} className={buttonClass}>{label("الرجوع للطلب المرتبط", "Back to linked request")}</Link>}</div><button disabled={busy} onClick={() => { if (!dirty || window.confirm(label("إلغاء التعديلات غير المحفوظة؟", "Discard unsaved changes?"))) void reload() }} className={buttonClass}>{label("إعادة تحميل", "Reload")}</button></div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{publicationError
        ? label("أكمل أي مرحلة واحدة وأدخل سعر البيع، ثم احفظ التعديلات قبل المعاينة والنشر.", "Complete any one stage, enter the selling price, then save before previewing or publishing.")
        : ar ? translatedError ?? error : "Operation failed. Check data and permissions. Reload if the invoice changed."}{ar && translatedError && errorStatus && <bdi className="ms-2">({errorStatus})</bdi>}{!ar && <bdi className="ms-2">{error}</bdi>}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</p>}
      {!invoice || !draft ? <p role="status">{label("جاري التحميل…", "Loading…")}</p> : <>
        <section className={panelClass + " flex flex-wrap justify-between gap-4"}><div><h2 className="text-xl font-bold">{invoice.customerName}</h2><p className="mt-2 text-sm"><bdi>{invoice.booking} · {invoice.currency}</bdi></p><p className="mt-1 text-xs text-slate-500">{label("معرّف الشحنة", "Shipment ID")} · <bdi>{invoice.shipmentId}</bdi></p></div>
          <div><p className="rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">{invoice.status === "draft" ? "DRAFT" : `Published v${invoice.publications.length}`}{invoice.pendingRevision && ` + DRAFT v${invoice.publications.length + 1}`}</p><p className="mt-2 text-xs text-slate-500">{invoice.status === "draft" ? label("للموظفين فقط · غير متاحة للعميل", "Staff only · hidden from customer") : label("التعديل يتطلب إصدار مراجعة ونشرًا جديدًا", "Changes require an explicit revision and publication")}</p></div>
        </section>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={panelClass}><p className="text-sm text-slate-500">{label("إجمالي التكاليف", "Total costs")}</p><p className="mt-2 text-xl font-bold"><bdi>{displayTotals?.totalCosts} {invoice.currency}</bdi></p></div>
          <div className={panelClass}><p className="text-sm text-slate-500">{label("إجمالي سعر البيع للعميل", "Customer selling total")}</p><p className="mt-2 text-xl font-bold"><bdi>{displayTotals?.customerTotal} {invoice.currency}</bdi></p><p className="mt-2 text-xs text-slate-500">{label("يُحسب تلقائيًا من أسعار بيع البنود", "Calculated automatically from line selling prices")}</p></div>
          {permissions?.viewSensitive && <div className={panelClass + (isLoss ? " bg-rose-50 dark:bg-rose-950/30" : " bg-emerald-50 dark:bg-emerald-950/30")}><p className="text-sm text-slate-500">{isLoss ? label("خسارة · للأدمن فقط", "Loss · admin only") : label("الربح · للأدمن فقط", "Profit · admin only")}</p><p className={"mt-2 text-xl font-bold" + (isLoss ? " text-rose-700 dark:text-rose-300" : "")}><bdi>{displayTotals?.expectedProfit} {invoice.currency}</bdi></p></div>}
        </div>
        {dirty && <p className="text-sm text-amber-700" role="status">{amountsValid && canSave ? label("تعديلات غير محفوظة. الإجماليات محدثة وسيعيد الخادم حسابها عند الحفظ.", "Unsaved changes. Totals are updated and will be recalculated on the server when saved.") : label("أكمل وصف ومبلغ وسعر تحويل كل بند أو احذف البند الفارغ قبل الحفظ.", "Complete each description, amount and exchange rate, or remove the empty row before saving.")}</p>}
        {requiresPricingSave && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{label("راجع أسعار بيع البنود ثم احفظ المسودة لتفعيل التسعير التفصيلي. سعر البيع الإجمالي المسجل سابقًا لا يُوزّع تلقائيًا على البنود، والنسخ المنشورة لا تتغير.", "Review line selling prices, then save to enable itemized pricing. The previous overall selling price is not automatically allocated to lines. Published snapshots remain unchanged.")}</p>}

        {editing && (!canPreview || dirty) && <section role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-bold">{label("المطلوب قبل معاينة الفاتورة ونشرها", "Before previewing and publishing")}</p>
          {incompleteStages.length === stages.length && <div className="flex flex-wrap items-center gap-2"><span>{label("أكمل أي مرحلة واحدة فقط", "Complete any one stage")}</span>{incompleteStages.map(key => <button key={key} className="rounded-lg border border-amber-300 px-3 py-1 font-semibold underline dark:border-amber-800" onClick={() => { setStage(key); document.getElementById("shipment-invoice-costs")?.scrollIntoView({ block: "start", behavior: "smooth" }) }}>{stageLabels[key]}</button>)}</div>}
          {!positiveSellingPrice && <p>{label("أدخل أسعار بيع للبنود بحيث يكون إجمالي الفاتورة أكبر من صفر.", "Enter line selling prices so the invoice total is greater than zero.")}</p>}
          {!canSave && <p>{label("أكمل بيانات البنود أو احذف الصفوف الفارغة.", "Complete item details or remove empty rows.")}</p>}
          {dirty && <p>{label("اضغط حفظ التعديلات لتسجيل اكتمال المراحل والأرقام المدخلة.", "Save changes to record stage completion and entered amounts.")}</p>}
        </section>}
        <section id="shipment-invoice-costs" className={panelClass + " scroll-mt-24"}>
          <div role="tablist" aria-label={label("المراحل", "Stages")} className="mb-5 flex flex-wrap gap-3">{stages.map(key => <button role="tab" aria-selected={stage === key} key={key} className={stage === key ? primaryClass : buttonClass} onClick={() => setStage(key)}>{draft.stages[key].completed ? "✓ " : ""}{stageLabels[key]} · {label("تكلفة", "Cost")} <bdi>{displayTotals?.perStage[key]} {invoice.currency}</bdi>{(editing || invoice.draft.pricingMode === "per-item-v1") && <span> · {label("بيع", "Sale")} <bdi>{displayTotals?.perStageSales[key]} {invoice.currency}</bdi></span>}</button>)}</div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{stageLabels[stage]} · {label("بنود التكلفة والبيع", "Cost and selling items")}</h2>{editing && <div className="flex gap-2"><button className={primaryClass} disabled={busy || draft.stages[stage].costs.length >= 100} onClick={addCost}>＋ {label("إضافة بند", "Add item")}</button><button className={buttonClass} disabled={busy || (!dirty && !requiresPricingSave)} onClick={() => void operation("save")}>{label("حفظ التعديلات", "Save changes")}</button></div>}</div>
          <p className="mb-4 text-xs text-slate-500">{label("سعر التحويل هو عدد وحدات عملة الفاتورة لكل وحدة من عملة البند. يُسجّل يدويًا ويُحفظ مع البند.", "The exchange rate is invoice-currency units per entry-currency unit. It is manually recorded with each entry.")}</p>
          <fieldset disabled={!editing || busy} className="space-y-3 disabled:opacity-70">
            <div ref={costsContainerRef} className="space-y-3">
            {draft.stages[stage].costs.map((cost, index) => {
              const isExpanded = expandedCostId === cost.id
              const saleDisplay = cost.saleEqualsCost === false ? (cost.sellingPrice || "0.00") : (cost.amount || "0.00")
              return (
                <div key={cost.id} data-cost-id={cost.id} className="rounded-xl border border-slate-200 bg-white transition dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setExpandedCostId(isExpanded ? null : cost.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-primary-600" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {cost.description?.trim() || label(`بند #${index + 1} (اضغط للتعديل)`, `Item #${index + 1} (click to edit)`)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs font-bold tabular-nums">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {label("بيع", "Sale")}: <bdi dir="ltr">{saleDisplay} {cost.currency}</bdi>
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs sm:col-span-2">{label("وصف البند", "Description")}<input maxLength={500} className={inputClass} value={cost.description} onChange={event => changeCost(index, { description: event.target.value })} /></label>
                        <label className="text-xs">{label("تكلفة البند · داخلية", "Item cost · internal")}<MoneyInput className={inputClass} value={cost.amount} onValueChange={value => changeCost(index, { amount: value })} /></label>
                        {editing || invoice.draft.pricingMode === "per-item-v1" ? <LineSalePrice cost={cost} ar={ar} disabled={!editing || busy} onChange={patch => changeCost(index, patch)} /> : <p className="text-xs text-slate-500 sm:col-span-2">{label("سعر البيع في النسخة القديمة مسجل كإجمالي، وليس موزعًا على البنود.", "The legacy selling price is recorded as a total, without individual line prices.")}</p>}
                        <TieredPricingEditor cost={cost} stage={stage} ar={ar} disabled={!editing||busy} allowed={permissions?.canUseTieredPricing===true} onChange={patch=>changeCost(index,patch)} />
                        <label className="text-xs">{label("العملة", "Currency")}<select className={inputClass} value={cost.currency} onChange={event => changeCost(index, { currency: event.target.value as CostInput["currency"], exchangeRate: event.target.value === invoice.currency ? "1" : "" })}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
                        <label className="text-xs">{label("سعر التحويل", "Exchange rate")}<MoneyInput disabled={cost.currency === invoice.currency} className={inputClass} value={cost.exchangeRate} onValueChange={value => changeCost(index, { exchangeRate: value })} /></label>
                        <label className="text-xs sm:col-span-2">{label("ملاحظات داخلية", "Internal notes")}<input maxLength={2000} className={inputClass} value={cost.notes} onChange={event => changeCost(index, { notes: event.target.value })} /></label>
                        <button type="button" className={buttonClass + " self-end text-rose-700"} onClick={() => { const next = structuredClone(draft); next.stages[stage].costs.splice(index, 1); change(next); setExpandedCostId(null) }}>{label("حذف البند", "Remove item")}</button>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">{label("أضيف بواسطة", "Added by")} <bdi>{cost.createdBy}</bdi> · {cost.createdAt ? new Date(cost.createdAt).toLocaleString(ar ? "ar-EG" : "en-GB", { hour12: true }) : label("لم يُحفظ بعد", "Not saved yet")}</p>
                    </div>
                  )}
                </div>
              )
            })}
            </div>
            {!draft.stages[stage].costs.length && <p className="text-sm text-slate-500">{label("لا توجد بنود في هذه المرحلة", "No costs in this stage")}</p>}

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.stages[stage].completed} onChange={event => { const next = structuredClone(draft); next.stages[stage].completed = event.target.checked; if (!event.target.checked) stages.slice(stages.indexOf(stage) + 1).forEach(key => { next.stages[key].completed = false }); change(next) }} />{label("اكتملت المرحلة · بدون تكاليف إضافية إذا كانت فارغة", "Stage complete · no further costs if empty")}</label>
          </fieldset>
        </section>
        <section className={panelClass}><label className="block text-sm">{label("ملاحظات الفاتورة للعميل", "Invoice notes for the customer")}<textarea disabled={!editing || busy} maxLength={2000} rows={3} className={inputClass} value={draft.notes} onChange={event => change({ ...draft, notes: event.target.value })} /></label></section>
        {editing && dirty && (!canSave || !amountsValid) && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{saveProblem}</p>}
        {invoice.approvalRequest && (invoice.status === "draft" || invoice.pendingRevision) && <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><p className="font-bold">{label("تم إرسال طلب اعتماد هذه المسودة للأدمن", "Approval requested from administrator")}</p><p className="mt-1 text-xs">{invoice.approvalRequest.byName} · {new Date(invoice.approvalRequest.at).toLocaleString(ar ? "ar-EG" : "en-GB", { hour12: true })}{permissions?.canPublish ? " — " + label("راجع نسخة العميل ثم اضغط «نشر الفاتورة» لإظهارها للعميل.", "Preview the customer invoice below and click Publish to make it visible to the customer.") : ""}</p></section>}
        <div className="flex flex-wrap gap-3">{editing && <button disabled={busy || (!dirty && !requiresPricingSave)} className={primaryClass} onClick={() => void operation("save")}>{label("حفظ المسودة", "Save draft")}</button>}
          {editing && <button className={buttonClass} disabled={busy || dirty || !canPreview} onClick={() => void operation("preview")}>{label("معاينة نسخة العميل قبل النشر", "Preview customer invoice before publication")}</button>}
          {editing && !permissions?.canPublish && <button className={primaryClass} disabled={busy || dirty || !canPreview || Boolean(invoice.approvalRequest)} onClick={() => void operation("request-approval")}>{invoice.approvalRequest ? label("تم إرسال طلب الاعتماد", "Approval requested") : label("إرسال طلب اعتماد للأدمن", "Send for Admin Approval")}</button>}
        </div>
        {preview && <section role="region" aria-label={label("مراجعة النشر", "Publication review")} className="space-y-4 rounded-2xl border-2 border-primary-300 p-5"><h2 className="font-bold">{label("مراجعة نسخة العميل", "Review customer invoice")}</h2><CustomerInvoicePreview snapshot={preview.snapshot} shipmentMeta={shipmentMeta} />
          {permissions?.canPublish && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{label("راجعت هذه النسخة وأوافق على نشرها للعميل المرتبط بالشحنة", "I reviewed this version and approve publication to the linked customer")}</label>
          <button className={primaryClass} disabled={busy || dirty || !confirmed || !canPreview} onClick={() => void operation("publish")}>{label("نشر الفاتورة", "Publish invoice")}</button></>}<button className={buttonClass + " ms-3"} disabled={busy} onClick={() => setPreview(null)}>{label("إلغاء", "Cancel")}</button>
        </section>}
        {invoice.status === "published" && !invoice.pendingRevision && permissions?.canPublish && <section className={panelClass}><h2 className="font-bold">{label("إنشاء إصدار مراجعة", "Start a revision")}</h2><p className="mt-2 text-xs text-slate-500">{label("تبقى النسخة المنشورة كما هي حتى نشر المراجعة. الفواتير المسدد منها تتطلب تسوية مالية أولًا.", "The current publication remains visible until the revision is published. Invoices with payments require reconciliation first.")}</p><label className="mt-3 block text-sm">{label("سبب المراجعة", "Revision reason")}<input maxLength={1000} className={inputClass} value={revisionReason} onChange={event => setRevisionReason(event.target.value)} /></label><button className={buttonClass + " mt-3"} disabled={busy || !revisionReason.trim()} onClick={() => void operation("revise")}>{label("فتح مسودة مراجعة", "Open revision draft")}</button></section>}
        {invoice.publications.length > 0 && <section className={panelClass}><h2 className="mb-4 font-bold">{label("النسخ المنشورة المحفوظة", "Saved publication snapshots")}</h2>{invoice.publications.map(snapshot => <details key={snapshot.version} className="mb-3"><summary className="cursor-pointer text-sm">v{snapshot.version} · {new Date(snapshot.publishedAt).toLocaleString(ar ? "ar-EG" : "en-GB", { hour12: true })} · {label("نشر بواسطة", "Published by")} <bdi>{snapshot.publishedBy}</bdi></summary><div className="mt-3"><CustomerInvoicePreview snapshot={snapshot} shipmentMeta={shipmentMeta} /></div></details>)}</section>}
        <section className={panelClass}><h2 className="mb-3 font-bold">{label("سجل التعديلات", "Audit log")}</h2>{audit.map(entry => <p key={entry._id} className="border-b border-slate-100 py-2 text-xs dark:border-slate-800">{auditLabels[entry.action] || entry.action} · {entry.actorName} · {new Date(entry.createdAt).toLocaleString(ar ? "ar-EG" : "en-GB", { hour12: true })}</p>)}</section>
      </>}
    </div>
  </div>
}

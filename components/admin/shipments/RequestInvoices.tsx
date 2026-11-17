"use client"
import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Link, useRouter } from "@/navigation"
import { shipmentOptionLabel, type ShipmentOption } from "@/lib/shipments/accounting-options"

type Row = { accounting?:boolean; id: string; invoiceNumber: string; referenceNumber?: string; shipmentId: string | null; booking: string; status: string; currency: string; total?: string; token?: string }
const control = "w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
const button = "rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
async function call(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw new Error(`${response.status} · ${data.error ?? "Unable to load invoices"}`)
  return data
}
export function RequestInvoices({ requestId, customerId = "", portal = false, open = false, onClose }: { requestId: string; customerId?: string; portal?: boolean; open?: boolean; onClose?: () => void }) {
  const ar = useLocale() === "ar", router = useRouter()
  const label = (a: string, e: string) => ar ? a : e
  const endpoint = `/api/${portal ? "portal" : "admin"}/requests/${requestId}/invoices`
  const [rows, setRows] = useState<Row[]>([]), [candidates, setCandidates] = useState<Row[]>([])
  const [permissions, setPermissions] = useState<{ canEdit: boolean; canCreate: boolean } | null>(null)
  const [allowed, setAllowed] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false)
  const [query, setQuery] = useState(""), [selected, setSelected] = useState("")
  const [shipmentQuery, setShipmentQuery] = useState(""), [shipmentId, setShipmentId] = useState("")
  const [shipments, setShipments] = useState<ShipmentOption[]>([])
  const [currency, setCurrency] = useState("EGP")
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const data = await call(endpoint + `?q=${encodeURIComponent(query)}`)
        if (active) { setRows(data.invoices); setCandidates(data.candidates ?? []); setPermissions(data.permissions ?? null); setAllowed(true); setError("") }
      } catch (error) { if (active) { if ((error as Error).message.startsWith("403")) setAllowed(false); else setError((error as Error).message) } }
    }
    const timer = setTimeout(refresh, 200)
    const onFocus = () => { if (document.visibilityState === "visible") void refresh() }
    const interval = setInterval(onFocus, 30000)
    window.addEventListener("focus", onFocus)
    return () => { active = false; clearTimeout(timer); clearInterval(interval); window.removeEventListener("focus", onFocus) }
  }, [endpoint, open, query])
  useEffect(() => {
    if (!open || portal || !permissions?.canCreate) return
    let active = true
    const timer = setTimeout(() => { call(`/api/admin/shipments?${new URLSearchParams({forAccounting:"1",customerId,requestId,q:shipmentQuery})}`).then(data => { if (active) setShipments(data.records) }).catch(error => { if (active) setError(error.message) }) }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [open, portal, permissions?.canCreate, shipmentQuery, customerId, requestId])
  async function link() {
    setBusy(true); setError("")
    try { await call(endpoint, { invoiceId: selected }); setSelected(""); setRows((await call(endpoint)).invoices); onClose?.() }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function createFromRequest() {
    setBusy(true);setError("");try{const data=await call(endpoint+"/create",{});onClose?.();router.push(data.invoice.accounting?`/admin/shipment-invoices/${data.invoice.id}`:`/admin/invoices?edit=${data.invoice.id}`)}catch(error){setError((error as Error).message)}finally{setBusy(false)}
  }
  async function create() {
    setBusy(true); setError("")
    try {
      const data = await call("/api/admin/shipment-invoices", { shipmentId, customerId, currency, requestId })
      onClose?.(); router.push(`/admin/shipment-invoices/${data.invoice.id}`)
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  if (!allowed && !open) return portal ? null : <p className="rounded-xl border border-amber-200 p-4 text-sm text-amber-800">{label("فواتير الطلب تحتاج صلاحية دخول الحسابات وإنشاء الفواتير. يمكن للمدير منحها من صلاحيات الموظفين.", "Request invoices require accounts access and invoice creation permission. An administrator can grant these in staff permissions.")}</p>
  if (portal && !rows.length && !error) return null
  return <>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 font-bold">{label("الفاتورة الحالية للطلب", "Current request invoice")}</h2>
      {!portal && permissions?.canCreate && <button className={button+" mb-3"} disabled={busy} onClick={()=>void createFromRequest()}>{label("+ إنشاء / فتح فاتورة الطلب مباشرة", "+ Create / open request invoice")}</button>}
      {!rows.length && <p className="text-sm text-slate-500">{label("لا توجد فواتير مرتبطة بعد.", "No linked invoices yet.")}</p>}
      <div className="space-y-3">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <div><p className="font-semibold">{row.referenceNumber || row.invoiceNumber} · {row.booking}</p><p className="text-xs text-slate-500">{row.status === "draft" ? label("مسودة داخلية · مخفية عن العميل", "Internal draft · hidden from customer") : label("منشورة للعميل", "Published to customer")}{portal && ` · ${row.total} ${row.currency}`}</p></div>
        <Link className="text-sm font-bold text-primary-600 underline" href={portal ? `/invoice/${row.token}` : (row.shipmentId || row.accounting) ? `/admin/shipment-invoices/${row.id}` : `/admin/invoices?edit=${row.id}`}>{portal?label("معاينة الفاتورة","Preview invoice"):label("عرض الفاتورة", "View invoice")}</Link>
      </div>)}</div>
      {!open && error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    </section>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={label("فاتورة الطلب", "Request invoice")}><section className="max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-slate-900" dir={ar ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{label("فاتورة الطلب", "Request invoice")}</h2><button disabled={busy} onClick={onClose} className="rounded-lg border px-3 py-2">{label("إغلاق", "Close")}</button></div>
      <p className="text-sm text-slate-500">{label("المسودات داخلية فقط. لا تظهر الفاتورة للعميل إلا بعد نشرها.", "Drafts are internal. Customers only see published invoices.")}</p>
      {rows.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{label("اختيار فاتورة أخرى يفصل الفاتورة الحالية عن الطلب فقط، دون حذفها أو تغيير مدفوعاتها.", "Selecting another invoice replaces the current request link without deleting the previous invoice or changing its payments.")}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!allowed && <p>{label("تحتاج صلاحية الحسابات للوصول للفواتير.", "Accounts permission is required.")}</p>}
      {permissions?.canEdit && <div className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">{label("ربط فاتورة موجودة", "Link an existing invoice")}</h3>
        <input aria-label={label("ابحث برقم الفاتورة أو الحجز", "Search invoice or booking")} placeholder={label("ابحث برقم الفاتورة أو الحجز", "Search invoice or booking")} className={control} value={query} onChange={event => {setQuery(event.target.value);setSelected("")}} />
        <select aria-label={label("فاتورة العميل", "Customer invoice")} className={control} value={selected} onChange={event => setSelected(event.target.value)}><option value="">{label("اختر فاتورة لنفس العميل", "Choose an invoice for this customer")}</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.referenceNumber || row.invoiceNumber} · {row.booking} · {row.status === "draft" ? "Draft" : "Published"}</option>)}</select>
        <button className={button} disabled={busy || !selected} onClick={() => void link()}>{label("ربط بالطلب", "Link to request")}</button>
      </div>}
      {permissions?.canCreate && <div className="space-y-3 rounded-xl border p-4"><button className={button} disabled={busy} onClick={()=>void createFromRequest()}>{label("إنشاء مسودة من الخدمات المقبولة دون اختيار شحنة", "Create draft from accepted services without selecting a shipment")}</button><p className="text-xs text-slate-500">{label("أسعار البيع تُنسخ من العرض المقبول. راجع التكاليف قبل النشر.", "Selling prices come from the accepted quote. Review internal costs before publication.")}</p><h3 className="font-bold">{label("إنشاء فاتورة من الحسابات", "Create an accounting invoice")}</h3>
        <input className={control} aria-label={label("ابحث عن الشحنة", "Find shipment")} placeholder={label("ابحث عن الشحنة", "Find shipment")} value={shipmentQuery} onChange={event => {setShipmentQuery(event.target.value);setShipmentId("")}} />
        <select className={control} aria-label={label("الشحنة", "Shipment")} value={shipmentId} onChange={event => setShipmentId(event.target.value)}><option value="">{label("اختر الشحنة المرتبطة بالخدمة", "Choose the service shipment")}</option>{shipments.map(row => <option dir="auto" key={row.id} value={row.id}>{shipmentOptionLabel(row,ar)}</option>)}</select>
        <select className={control} aria-label={label("العملة", "Currency")} value={currency} onChange={event => setCurrency(event.target.value)}>{["EGP", "USD", "EUR"].map(value => <option key={value}>{value}</option>)}</select>
        <button className={button} disabled={busy || !shipmentId || !customerId} onClick={() => void create()}>{label("إنشاء / فتح المسودة وربطها بالطلب", "Create / open draft and link to request")}</button>
      </div>}
    </section></div>}
  </>
}

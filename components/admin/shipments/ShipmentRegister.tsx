"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useLocale } from "next-intl"
import {
  ArrowRightLeft,
  Calendar,
  Container,
  Lock,
  Pencil,
  Plus,
  Receipt,
  Search,
  Ship,
  Trash2,
  X,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { Link } from "@/navigation"
import {
  useAdminRole,
  useCanAccessAccounts,
  useCanMarkReadyForAccounts,
} from "@/components/admin/AdminExperienceContext"
import { containerFields, shipmentFields, shipmentSuggestionFields, type ShipmentRecord } from "@/lib/shipments/fields"
import { loadPortCatalogue, type PortCatalogue } from "@/lib/shipments/port-catalogue"
import { resolveDatePreset, type DateRangePreset } from "@/lib/shipments/smart-search"
import { CountryPortPicker } from "./CountryPortPicker"
import { ShippingLineCombobox } from "./ShippingLineCombobox"

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
const buttonClass = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700"

type ShipmentWorkflowMeta = {
  transferState: "pending_admin" | "approved" | "rejected" | null
  deleteState: "pending_admin" | "approved" | "rejected" | null
  invoiceId: string | null
  invoiceStatus: string | null
  invoiceApprovalPending: boolean
}

type ShipmentRowWithMeta = ShipmentRecord & { workflow?: ShipmentWorkflowMeta }

function newShipment(): ShipmentRecord {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    shipment_date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo" }).format(new Date()),
    booking: "",
    number_46: "",
    ucr: "",
    containers: [],
    shipping_line: "",
    container_count: 1,
    container_size: "",
    export_invoice: "",
    broker: "",
    shipper: "",
    port_of_loading: "",
    port_of_discharge: "",
    item_name: "",
    hs_code: "",
  }
}

type RegisterResult = { records: ShipmentRowWithMeta[]; total: number; containers: number; pageSize: number }

export function ShipmentRegister() {
  const role = useAdminRole()
  const isAdmin = role === "super_admin"
  const canAccessAccounts = useCanAccessAccounts()
  const canTransferToAccounts = isAdmin || useCanMarkReadyForAccounts()
  const arabic = useLocale() === "ar"
  const label = (ar: string, en: string) => (arabic ? ar : en)

  const [shipperFilter, setShipperFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [activePreset, setActivePreset] = useState<DateRangePreset>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<RegisterResult | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [draft, setDraft] = useState<ShipmentRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<"conflict" | "failed" | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [options, setOptions] = useState<Partial<Record<typeof shipmentSuggestionFields[number], string[]>>>({})
  const [portCatalogue, setPortCatalogue] = useState<PortCatalogue | null>(null)
  const [catalogueError, setCatalogueError] = useState(false)
  const [catalogueRetry, setCatalogueRetry] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const draftId = draft?.id

  // Load shipper/customer filter options on mount
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/shipments?options=1", { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (data && !controller.signal.aborted) setOptions(data.options || {})
      })
      .catch(() => {})
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (!draftId || portCatalogue) return
    let active = true
    setCatalogueError(false)
    loadPortCatalogue().then(data => { if (active) setPortCatalogue(data) }).catch(() => { if (active) setCatalogueError(true) })
    return () => { active = false }
  }, [draftId, portCatalogue, catalogueRetry])

  useEffect(() => {
    if (!draftId) return
    formRef.current?.scrollIntoView({ block: "nearest" })
  }, [draftId])

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({
      q: search,
      shipper: shipperFilter,
      dateFrom,
      dateTo,
      page: String(page),
    })
    setLoadError(false)
    setResult(null)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/shipments?${query}`, { signal: controller.signal })
        if (!response.ok) throw Error("Unable to load shipments")
        const data: RegisterResult = await response.json()
        if (!controller.signal.aborted) setResult(data)
      } catch {
        if (!controller.signal.aborted) setLoadError(true)
      }
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [search, shipperFilter, dateFrom, dateTo, page, refresh])

  function applyPreset(preset: DateRangePreset) {
    const range = resolveDatePreset(preset)
    setActivePreset(preset)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
    setPage(1)
  }

  function clearFilters() {
    setShipperFilter("")
    setDateFrom("")
    setDateTo("")
    setActivePreset("all")
    setSearch("")
    setPage(1)
  }

  function edit(record: ShipmentRecord) {
    setSaveError(null)
    setDraft(record)
  }

  function cancel() {
    setDraft(null)
    if (saveError === "conflict") setRefresh(value => value + 1)
    setSaveError(null)
  }

  // Prevent accidental implicit submit when pressing Enter inside shipment form inputs
  function preventEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement | null
    if (!target) return
    const tag = target.tagName.toLowerCase()
    if (tag === "textarea") return
    if (tag === "button" && (target as HTMLButtonElement).type === "submit") return
    event.preventDefault()
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    setSaveError(null)
    const { id, revision, ...shipment } = draft
    try {
      const response = await fetch("/api/admin/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, revision: revision || undefined, shipment }),
      })
      if (!response.ok) {
        setSaveError(response.status === 409 ? "conflict" : "failed")
        return
      }
      setDraft(null)
      setPage(1)
      setRefresh(value => value + 1)
    } catch {
      setSaveError("failed")
    } finally {
      setSaving(false)
    }
  }

  async function submitTransferToAccounts(record: ShipmentRowWithMeta) {
    const note = window.prompt(
      label("ملاحظة لطلب التحويل إلى الحسابات (اختياري):", "Note for Transfer to Accounts (optional):")
    )
    if (note === null) return
    setBusyRowId(record.id)
    setActionFeedback(null)
    try {
      const res = await fetch("/api/admin/staff-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          shipmentId: record.id,
          requestType: "to_accounts",
          note: note.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setActionFeedback({
        kind: "ok",
        text: label(
          `تم إرسال طلب تحويل الشحنة (${record.booking}) إلى الحسابات بانتظار موافقة الأدمن.`,
          `Transfer to Accounts request sent for shipment (${record.booking}), awaiting Admin approval.`
        ),
      })
      setRefresh(v => v + 1)
    } catch (err) {
      setActionFeedback({ kind: "err", text: (err as Error).message })
    } finally {
      setBusyRowId(null)
    }
  }

  async function handleDeleteOrRequestDelete(record: ShipmentRowWithMeta) {
    if (isAdmin) {
      if (!window.confirm(label(`هل أنت متأكد من حذف الشحنة (${record.booking})؟`, `Delete shipment (${record.booking})?`))) {
        return
      }
      setBusyRowId(record.id)
      setActionFeedback(null)
      try {
        const res = await fetch(`/api/admin/shipments?id=${encodeURIComponent(record.id)}`, {
          method: "DELETE",
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed")
        setActionFeedback({
          kind: "ok",
          text: label(`تم حذف الشحنة (${record.booking}).`, `Shipment (${record.booking}) deleted.`),
        })
        setRefresh(v => v + 1)
      } catch (err) {
        setActionFeedback({ kind: "err", text: (err as Error).message })
      } finally {
        setBusyRowId(null)
      }
      return
    }

    // Operations staff: submit delete request to Admin (appears in Staff Requests)
    const reason = window.prompt(
      label(
        `أدخل سبب طلب حذف الشحنة (${record.booking}) ليتم إرساله للأدمن للموافقة:`,
        `Enter reason to request deletion of shipment (${record.booking}) for Admin approval:`
      )
    )
    if (reason === null) return
    setBusyRowId(record.id)
    setActionFeedback(null)
    try {
      const res = await fetch("/api/admin/staff-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          shipmentId: record.id,
          requestType: "delete_shipment",
          note: reason.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setActionFeedback({
        kind: "ok",
        text: label(
          `تم إرسال طلب حذف الشحنة (${record.booking}) إلى الأدمن في خانة «طلبات الموظفين».`,
          `Deletion request for (${record.booking}) sent to Admin under Staff Requests.`
        ),
      })
      setRefresh(v => v + 1)
    } catch (err) {
      setActionFeedback({ kind: "err", text: (err as Error).message })
    } finally {
      setBusyRowId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 25)))
  const hasFilters = Boolean(search || shipperFilter || dateFrom || dateTo)

  const presets: { key: DateRangePreset; ar: string; en: string }[] = [
    { key: "all", ar: "كل الفترات", en: "All dates" },
    { key: "today", ar: "اليوم", en: "Today" },
    { key: "last7", ar: "آخر 7 أيام", en: "Last 7 days" },
    { key: "thisMonth", ar: "هذا الشهر", en: "This month" },
    { key: "last30", ar: "آخر 30 يومًا", en: "Last 30 days" },
    { key: "last90", ar: "آخر 3 أشهر", en: "Last 3 months" },
  ]

  function renderInvoiceCell(record: ShipmentRowWithMeta) {
    const wf = record.workflow
    const isApprovedForAccounts = wf?.transferState === "approved"
    const hasInvoice = Boolean(wf?.invoiceId)
    const canOpenInvoice = canAccessAccounts && (isApprovedForAccounts || hasInvoice)

    let statusBadge: { text: string; tone: string } = {
      text: label("مقفول", "Locked"),
      tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    }

    if (wf?.invoiceStatus && wf.invoiceStatus !== "draft") {
      statusBadge = {
        text: label("منشورة للعميل", "Published"),
        tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
      }
    } else if (wf?.invoiceApprovalPending) {
      statusBadge = {
        text: label("بانتظار اعتماد التحويل للعميل", "Awaiting Admin Approval"),
        tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
      }
    } else if (hasInvoice) {
      statusBadge = {
        text: label("مسودة Draft", "Draft"),
        tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
      }
    } else if (isApprovedForAccounts) {
      statusBadge = {
        text: label("جاهز للفاتورة", "Ready to Invoice"),
        tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
      }
    } else if (wf?.transferState === "pending_admin") {
      statusBadge = {
        text: label("بانتظار موافقة الأدمن", "Transfer Pending"),
        tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
      }
    }

    const invoiceHref = hasInvoice
      ? `/admin/shipment-invoices/${wf!.invoiceId}`
      : `/admin/shipment-invoices?shipmentId=${record.id}`

    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadge.tone}`}>
          {statusBadge.text}
        </span>
        {canOpenInvoice ? (
          <Link
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
            href={invoiceHref}
          >
            <Receipt className="h-3.5 w-3.5" />
            {hasInvoice ? label("فتح الفاتورة", "Open Invoice") : label("إنشاء فاتورة", "Create Invoice")}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title={label(
              "زر الفاتورة مقفول حتى يتم إرسال طلب تحويل للحسابات وموافقة الأدمن (ومتاح لفريق الحسابات فقط)",
              "Invoice button is locked until Admin approves Transfer to Accounts (Accounts team only)"
            )}
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
          >
            <Lock className="h-3.5 w-3.5" />
            {label("الفاتورة", "Invoice")}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <AdminHeader title={label("بيانات الشحنات", "Shipment data")} />
      <div dir={arabic ? "rtl" : "ltr"} className="space-y-5 p-4 text-slate-900 sm:p-7 dark:text-slate-100">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
              <Ship className="mb-2 h-5 w-5 text-sky-700 dark:text-sky-300" />
              <p className="text-xs">{label("الشحنات في النتائج", "Shipments in results")}</p>
              <p className="text-2xl font-bold tabular-nums">{result?.total ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
              <Container className="mb-2 h-5 w-5 text-indigo-700 dark:text-indigo-300" />
              <p className="text-xs">{label("الحاويات في النتائج", "Containers in results")}</p>
              <p className="text-2xl font-bold tabular-nums">{result?.containers ?? "—"}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            aria-expanded={Boolean(draft)}
            aria-controls={draft ? "shipment-form" : undefined}
            onClick={() => (draft ? cancel() : edit(newShipment()))}
            className={draft ? buttonClass : "inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"}
          >
            {draft ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {draft?.revision
              ? label("إلغاء التعديل", "Cancel edit")
              : draft
                ? label("إلغاء الإضافة", "Cancel addition")
                : label("إضافة شحنة", "Add shipment")}
          </button>
        </div>

        {actionFeedback && (
          <div
            role={actionFeedback.kind === "err" ? "alert" : "status"}
            className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-sm font-medium ${
              actionFeedback.kind === "err"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            <span>{actionFeedback.text}</span>
            <button type="button" onClick={() => setActionFeedback(null)} className="rounded p-1 hover:bg-black/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {draft && (
          <form
            id="shipment-form"
            ref={formRef}
            onSubmit={save}
            onKeyDown={preventEnterSubmit}
            className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
          >
            <h2 className="mb-4 font-bold">{draft.revision ? label("تعديل الشحنة", "Edit shipment") : label("شحنة جديدة", "New shipment")}</h2>
            <fieldset disabled={saving} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {shipmentFields.map(field => {
                if (field.key === "port_of_loading" || field.key === "port_of_discharge") {
                  return (
                    <CountryPortPicker
                      key={draft.id + field.key}
                      id={field.key}
                      value={draft[field.key]}
                      catalogue={portCatalogue}
                      ar={arabic}
                      inputClass={inputClass}
                      onChange={value => setDraft(previous => previous && { ...previous, [field.key]: value })}
                    />
                  )
                }
                if (field.key === "shipping_line") {
                  return (
                    <ShippingLineCombobox
                      key={draft.id + field.key}
                      value={draft.shipping_line}
                      extraOptions={options.shipping_line || []}
                      ar={arabic}
                      inputClass={inputClass}
                      onChange={value => setDraft(previous => previous && { ...previous, shipping_line: value })}
                    />
                  )
                }
                const suggestionField = shipmentSuggestionFields.find(key => key === field.key)
                return (
                  <label key={field.key} className="space-y-1 text-sm">
                    <span>{label(field.ar, field.en)}</span>
                    <input
                      className={inputClass}
                      type={field.type}
                      required={["shipment_date", "booking", "container_count"].includes(field.key)}
                      min={field.type === "number" ? 1 : undefined}
                      max={field.type === "number" ? 10000 : undefined}
                      maxLength={field.type === "text" ? 200 : undefined}
                      list={suggestionField ? `shipment-options-${suggestionField}` : undefined}
                      value={(field.key === "container_count" && draft.containers.length ? draft.containers.length : draft[field.key]) || ""}
                      readOnly={field.key === "container_count" && draft.containers.length > 0}
                      onChange={event => {
                        const value = event.target.value
                        setDraft(previous => previous && { ...previous, [field.key]: field.type === "number" ? Number(value) : value })
                      }}
                    />
                    {suggestionField && (
                      <datalist id={`shipment-options-${suggestionField}`}>
                        {options[suggestionField]?.map(value => <option key={value} value={value} />)}
                      </datalist>
                    )}
                  </label>
                )
              })}
            </fieldset>
            <p className="mt-3 text-xs text-slate-500">
              {portCatalogue ? (
                <>
                  {label("دليل الدول ومنافذ النقل", "Country and transport directory")}:{" "}
                  <a href="https://unlocode.unece.org/publications/" target="_blank" rel="noreferrer" className="underline">
                    UNECE UN/LOCODE {portCatalogue.version}
                  </a>{" "}
                  · {portCatalogue.countries.length} {label("بلدًا وإقليمًا", "countries and territories")} ·{" "}
                  {portCatalogue.locationCount.toLocaleString("en-US")} {label("موقع نقل مسجل", "listed transport locations")}
                </>
              ) : catalogueError ? (
                <span role="alert">
                  {label("تعذّر تحميل دليل منافذ النقل.", "Unable to load the transport directory.")}{" "}
                  <button type="button" disabled={saving} className="underline" onClick={() => setCatalogueRetry(value => value + 1)}>
                    {label("إعادة المحاولة", "Retry")}
                  </button>
                </span>
              ) : (
                <span role="status">{label("جارٍ تحميل الدول ومنافذ النقل…", "Loading countries and transport locations…")}</span>
              )}
            </p>
            <fieldset disabled={saving} className="mt-5 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-2 text-sm font-semibold">{label("تفاصيل الحاويات", "Container details")}</legend>
              {draft.containers.map((container, index) => (
                <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  {containerFields.map(field => (
                    <label key={field.key} className="space-y-1 text-sm">
                      <span>{label(field.ar, field.en)} {index + 1}</span>
                      <input
                        className={inputClass}
                        required={field.key === "number"}
                        maxLength={200}
                        value={container[field.key]}
                        onChange={event => {
                          const value = event.target.value
                          setDraft(previous => previous && {
                            ...previous,
                            containers: previous.containers.map((row, position) => position === index ? { ...row, [field.key]: value } : row),
                          })
                        }}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setDraft(previous => previous && {
                      ...previous,
                      containers: previous.containers.filter((_, position) => position !== index),
                    })}
                  >
                    {label("إزالة", "Remove")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={buttonClass}
                disabled={draft.containers.length >= 100}
                onClick={() => setDraft(previous => previous && {
                  ...previous,
                  containers: [...previous.containers, { number: "", driver_number: "", truck_number: "" }],
                })}
              >
                <Plus className="h-4 w-4" />{label("إضافة حاوية", "Add container")}
              </button>
            </fieldset>
            {saveError && (
              <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
                {saveError === "conflict"
                  ? label("الشحنة اتعدّلت من مستخدم تاني. الغِ التعديل وافتح آخر نسخة.", "Someone updated this shipment. Cancel and reopen the latest version.")
                  : label("تعذّر الحفظ. راجع البيانات وحاول مرة تانية.", "Save failed. Check the fields and try again.")}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={saving || saveError === "conflict"} className={buttonClass + " bg-blue-700 text-white border-blue-700"}>
                {saving ? label("جاري الحفظ", "Saving") : label("حفظ الشحنة", "Save shipment")}
              </button>
              <button type="button" disabled={saving} className={buttonClass} onClick={cancel}>
                {label("إلغاء", "Cancel")}
              </button>
            </div>
          </form>
        )}

        {/* Smart Search & Filters (Task 37: Customer -> Date Range -> Smart Instant Search) */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {/* 1. Customer / Shipper Filter */}
              <label className="space-y-1 text-xs font-bold">
                <span>{label("1. العميل / الشاحن", "1. Customer / Shipper")}</span>
                <select
                  className={inputClass}
                  value={shipperFilter}
                  onChange={event => {
                    setShipperFilter(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">{label("كل العملاء", "All customers")}</option>
                  {(options.shipper || []).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              {/* 2. Date From */}
              <label className="space-y-1 text-xs font-bold">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{label("2. من تاريخ", "2. From date")}</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dateFrom}
                  onChange={event => {
                    setDateFrom(event.target.value)
                    setActivePreset("all")
                    setPage(1)
                  }}
                />
              </label>

              {/* 3. Date To */}
              <label className="space-y-1 text-xs font-bold">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{label("إلى تاريخ", "To date")}</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dateTo}
                  onChange={event => {
                    setDateTo(event.target.value)
                    setActivePreset("all")
                    setPage(1)
                  }}
                />
              </label>

              {/* 4. Smart Instant Search */}
              <label className="space-y-1 text-xs font-bold">
                <span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" />{label("بحث ذكي", "Smart search")}</span>
                <input
                  className={inputClass}
                  value={search}
                  maxLength={200}
                  placeholder={label("الحجز، UCR، الخط الملاحي، الحاوية…", "Booking, UCR, shipping line, container…")}
                  onChange={event => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                />
              </label>
            </div>

            {/* Quick Date Presets + Reset */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {presets.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      activePreset === p.key && (p.key !== "all" || (!dateFrom && !dateTo))
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {label(p.ar, p.en)}
                  </button>
                ))}
              </div>
              {hasFilters && (
                <button type="button" className={buttonClass} onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                  {label("مسح الفلاتر", "Clear filters")}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-start text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900">
                <tr>
                  {shipmentFields.map(field => <th scope="col" className="px-3 py-3 text-start" key={field.key}>{label(field.ar, field.en)}</th>)}
                  <th scope="col" className="px-3 py-3 text-start">{label("تفاصيل الحاويات", "Container details")}</th>
                  <th scope="col" className="px-3 py-3 text-start">{label("الفواتير", "Invoices")}</th>
                  <th scope="col" className="px-3 py-3 text-start">{label("الإجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {result?.records.map(record => {
                  const wf = record.workflow
                  const transferPendingOrDone = wf?.transferState === "pending_admin" || wf?.transferState === "approved"
                  const deletePending = wf?.deleteState === "pending_admin"
                  return (
                    <tr key={record.id} className="border-b border-slate-100 even:bg-slate-50 dark:border-slate-800 dark:even:bg-slate-900/50">
                      {shipmentFields.map(field => <td className="px-3 py-3" key={field.key}><bdi>{record[field.key] || "—"}</bdi></td>)}
                      <td className="px-3 py-3">
                        {record.containers.length ? (
                          <details>
                            <summary className="cursor-pointer font-medium">{label("عرض الحاويات", "View containers")}</summary>
                            <ul className="mt-2 space-y-2">
                              {record.containers.map((row, index) => (
                                <li key={index} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                                  {containerFields.map(field => (
                                    <div key={field.key}>
                                      {label(field.ar, field.en)} <bdi>{row[field.key] || "—"}</bdi>
                                    </div>
                                  ))}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">{renderInvoiceCell(record)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" className={buttonClass} disabled={Boolean(draft) || busyRowId === record.id} onClick={() => edit(record)}>
                            <Pencil className="h-3.5 w-3.5" />{label("تعديل", "Edit")}
                          </button>

                          {canTransferToAccounts && (
                            <button
                              type="button"
                              disabled={busyRowId === record.id || transferPendingOrDone}
                              onClick={() => void submitTransferToAccounts(record)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              {wf?.transferState === "approved"
                                ? label("تم التحويل للحسابات", "Transferred")
                                : wf?.transferState === "pending_admin"
                                  ? label("طلب تحويل معلّق", "Transfer Pending")
                                  : label("طلب تحويل للحسابات", "Transfer to Accounts")}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={busyRowId === record.id || (!isAdmin && deletePending)}
                            onClick={() => void handleDeleteOrRequestDelete(record)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {!isAdmin && deletePending
                              ? label("طلب حذف معلّق", "Delete Pending")
                              : label("حذف", "Delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!result?.records.length && (
            <div className="p-8 text-center text-sm" role={loadError ? "alert" : "status"}>
              {loadError
                ? label("تعذّر تحميل الشحنات", "Unable to load shipments")
                : result
                  ? label("مفيش شحنات مطابقة للفلاتر الحالية", "No shipments match the current filters")
                  : label("جاري التحميل", "Loading")}
              {loadError && (
                <button type="button" className={buttonClass + " ms-3"} onClick={() => setRefresh(value => value + 1)}>
                  {label("حاول تاني", "Retry")}
                </button>
              )}
            </div>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-3 p-3 text-sm">
              <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {label("السابق", "Previous")}
              </button>
              <span>{page} / {pageCount}</span>
              <button type="button" className={buttonClass} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                {label("التالي", "Next")}
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

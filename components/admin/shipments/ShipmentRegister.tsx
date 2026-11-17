"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useLocale } from "next-intl"
import { Container, Pencil, Plus, Search, Ship, X } from "lucide-react"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { Link } from "@/navigation"
import { useCanAccessAccounts } from "@/components/admin/AdminExperienceContext"
import { containerFields, shipmentFields, shipmentSuggestionFields, type ShipmentRecord } from "@/lib/shipments/fields"
import { loadPortCatalogue, type PortCatalogue } from "@/lib/shipments/port-catalogue"
import { CountryPortPicker } from "./CountryPortPicker"

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
const buttonClass = "inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700"

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

type RegisterResult = { records: ShipmentRecord[]; total: number; containers: number; pageSize: number }

export function ShipmentRegister() {
  const canAccessAccounts = useCanAccessAccounts()
  const arabic = useLocale() === "ar"
  const label = (ar: string, en: string) => arabic ? ar : en
  const [search, setSearch] = useState("")
  const [month, setMonth] = useState("")
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<RegisterResult | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [draft, setDraft] = useState<ShipmentRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<"conflict" | "failed" | null>(null)
  const [options, setOptions] = useState<Partial<Record<typeof shipmentSuggestionFields[number], string[]>>>({})
  const [portCatalogue, setPortCatalogue] = useState<PortCatalogue | null>(null)
  const [catalogueError, setCatalogueError] = useState(false)
  const [catalogueRetry, setCatalogueRetry] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const draftId = draft?.id
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
    const controller = new AbortController()
    fetch("/api/admin/shipments?options=1", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data && !controller.signal.aborted) setOptions(data.options) })
      .catch(() => {})
    return () => controller.abort()
  }, [draftId])

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ q: search, month, page: String(page) })
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
  }, [search, month, page, refresh])

  function edit(record: ShipmentRecord) {
    setSaveError(null)
    setDraft(record)
  }

  function cancel() {
    setDraft(null)
    if (saveError === "conflict") setRefresh(value => value + 1)
    setSaveError(null)
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

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 25)))

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
            onClick={() => draft ? cancel() : edit(newShipment())}
            className={draft ? buttonClass : "inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"}
          >
            {draft ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {draft?.revision ? label("إلغاء التعديل", "Cancel edit")
              : draft ? label("إلغاء الإضافة", "Cancel addition")
              : label("إضافة شحنة", "Add shipment")}
          </button>
        </div>

        {draft && (
          <form id="shipment-form" ref={formRef} onSubmit={save} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h2 className="mb-4 font-bold">{draft.revision ? label("تعديل الشحنة", "Edit shipment") : label("شحنة جديدة", "New shipment")}</h2>
            <fieldset disabled={saving} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {shipmentFields.map(field => {
                if (field.key === "port_of_loading" || field.key === "port_of_discharge") return <CountryPortPicker key={draft.id + field.key} id={field.key} value={draft[field.key]} catalogue={portCatalogue} ar={arabic} inputClass={inputClass} onChange={value => setDraft(previous => previous && { ...previous, [field.key]: value })} />
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
                  {suggestionField && <datalist id={`shipment-options-${suggestionField}`}>
                    {options[suggestionField]?.map(value => <option key={value} value={value} />)}
                  </datalist>}
                </label>
                )
              })}
            </fieldset>
            <p className="mt-3 text-xs text-slate-500">{portCatalogue ? <>{label("دليل الدول ومنافذ النقل", "Country and transport directory")}: <a href="https://unlocode.unece.org/publications/" target="_blank" rel="noreferrer" className="underline">UNECE UN/LOCODE {portCatalogue.version}</a> · {portCatalogue.countries.length} {label("بلدًا وإقليمًا", "countries and territories")} · {portCatalogue.locationCount.toLocaleString(arabic ? "ar-EG" : "en-GB")} {label("موقع نقل مسجل", "listed transport locations")} · {label("قد يظهر الموقع في أكثر من تصنيف إذا كان متعدد الوسائط.", "Multimodal locations can appear in more than one category.")}</> : catalogueError ? <span role="alert">{label("تعذّر تحميل دليل منافذ النقل. القيم المحفوظة لم تتغير.", "Unable to load the transport directory. Saved values are unchanged.")} <button type="button" disabled={saving} className="underline" onClick={() => setCatalogueRetry(value => value + 1)}>{label("إعادة المحاولة", "Retry")}</button></span> : <span role="status">{label("جارٍ تحميل الدول ومنافذ النقل…", "Loading countries and transport locations…")}</span>}</p>
            <fieldset disabled={saving} className="mt-5 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-2 text-sm font-semibold">{label("تفاصيل الحاويات", "Container details")}</legend>
              {draft.containers.map((container, index) => (
                <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  {containerFields.map(field => (
                    <label key={field.key} className="space-y-1 text-sm">
                      <span>{label(field.ar, field.en)} {index + 1}</span>
                      <input className={inputClass} required={field.key === "number"} maxLength={200}
                        value={container[field.key]} onChange={event => {
                          const value = event.target.value
                          setDraft(previous => previous && {
                            ...previous,
                            containers: previous.containers.map((row, position) => position === index ? { ...row, [field.key]: value } : row),
                          })
                        }} />
                    </label>
                  ))}
                  <button type="button" className={buttonClass} onClick={() => setDraft(previous => previous && {
                    ...previous,
                    containers: previous.containers.filter((_, position) => position !== index),
                  })}>{label("إزالة", "Remove")}</button>
                </div>
              ))}
              <button type="button" className={buttonClass} disabled={draft.containers.length >= 100}
                onClick={() => setDraft(previous => previous && {
                  ...previous,
                  containers: [...previous.containers, { number: "", driver_number: "", truck_number: "" }],
                })}>
                <Plus className="h-4 w-4" />{label("إضافة حاوية", "Add container")}
              </button>
            </fieldset>
            {saveError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
              {saveError === "conflict"
                ? label("الشحنة اتعدّلت من مستخدم تاني. الغِ التعديل وافتح آخر نسخة.", "Someone updated this shipment. Cancel and reopen the latest version.")
                : label("تعذّر الحفظ. راجع البيانات وحاول مرة تانية.", "Save failed. Check the fields and try again.")}
            </p>}
            <div className="mt-4 flex gap-2">
              <button disabled={saving || saveError === "conflict"} className={buttonClass + " bg-blue-700 text-white"}>{saving ? label("جاري الحفظ", "Saving") : label("حفظ", "Save")}</button>
              <button type="button" disabled={saving} className={buttonClass} onClick={cancel}>{label("إلغاء", "Cancel")}</button>
            </div>
          </form>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <label className="min-w-48 flex-1 space-y-1 text-sm">
              <span className="flex items-center gap-2"><Search className="h-4 w-4" />{label("بحث في الشحنات", "Search shipments")}</span>
              <input className={inputClass} value={search} maxLength={200} placeholder={label("الحجز، UCR، رقم الحاوية، رقم العربية…", "Booking, UCR, container or truck number…")} onChange={event => { setSearch(event.target.value); setPage(1) }} />
            </label>
            <label className="space-y-1 text-sm">
              <span>{label("الشهر", "Month")}</span>
              <input type="month" className={inputClass} value={month} onChange={event => { setMonth(event.target.value); setPage(1) }} />
            </label>
            {(search || month) && <button type="button" className={buttonClass} onClick={() => { setSearch(""); setMonth(""); setPage(1) }}>{label("مسح الفلاتر", "Clear filters")}</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-start text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900">
                <tr>
                  {shipmentFields.map(field => <th scope="col" className="px-3 py-3 text-start" key={field.key}>{label(field.ar, field.en)}</th>)}
                  <th scope="col" className="px-3 py-3 text-start">{label("تفاصيل الحاويات", "Container details")}</th>
                  <th scope="col" className="px-3 py-3 text-start">{label("الإجراء", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {result?.records.map(record => (
                  <tr key={record.id} className="border-b border-slate-100 even:bg-slate-50 dark:border-slate-800 dark:even:bg-slate-900/50">
                    {shipmentFields.map(field => <td className="px-3 py-3" key={field.key}><bdi>{record[field.key] || "—"}</bdi></td>)}
                    <td className="px-3 py-3">
                      {record.containers.length ? <details>
                        <summary className="cursor-pointer font-medium">{label("عرض الحاويات", "View containers")}</summary>
                        <ul className="mt-2 space-y-2">
                          {record.containers.map((row, index) => <li key={index} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                            {containerFields.map(field => <div key={field.key}>
                              {label(field.ar, field.en)} <bdi>{row[field.key] || "—"}</bdi>
                            </div>)}
                          </li>)}
                        </ul>
                      </details> : "—"}
                    </td>
                    <td className="space-x-2 px-3 py-2 rtl:space-x-reverse">
                      <button type="button" className={buttonClass} disabled={Boolean(draft)} onClick={() => edit(record)}><Pencil className="h-4 w-4" />{label("تعديل", "Edit")}</button>
                      {canAccessAccounts && <Link className={buttonClass} href={`/admin/shipment-invoices?shipmentId=${record.id}`}>{label("فاتورة الشحنة", "Shipment invoice")}</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result?.records.length && <div className="p-8 text-center text-sm" role={loadError ? "alert" : "status"}>
            {loadError ? label("تعذّر تحميل الشحنات", "Unable to load shipments") : result ? label("مفيش شحنات مطابقة", "No matching shipments") : label("جاري التحميل", "Loading")}
            {loadError && <button type="button" className={buttonClass + " ms-3"} onClick={() => setRefresh(value => value + 1)}>{label("حاول تاني", "Retry")}</button>}
          </div>}
          {pageCount > 1 && <div className="flex items-center justify-end gap-3 p-3 text-sm">
            <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setPage(page - 1)}>{label("السابق", "Previous")}</button>
            <span>{page} / {pageCount}</span>
            <button type="button" className={buttonClass} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>{label("التالي", "Next")}</button>
          </div>}
        </section>
      </div>
    </>
  )
}

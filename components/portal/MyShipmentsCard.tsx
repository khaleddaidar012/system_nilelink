"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Calendar, Container, ExternalLink, Receipt, Search, Ship, X } from "lucide-react"
import { Link } from "@/navigation"
import { resolveDatePreset, type DateRangePreset } from "@/lib/shipments/smart-search"

interface PortalShipment {
  id: string
  shipmentDate: string
  booking: string
  number46: string
  ucr: string
  shippingLine: string
  containerCount: number
  containerSize: string
  portOfLoading: string
  portOfDischarge: string
  itemName: string
  containerNumbers: string[]
  publishedInvoice: {
    id: string
    invoiceNumber: string
    token: string
  } | null
}

interface PortalShipmentsResponse {
  shipments: PortalShipment[]
  total: number
  containers: number
  page: number
  pageSize: number
}

export function MyShipmentsCard() {
  const isAr = useLocale() === "ar"
  const label = (ar: string, en: string) => (isAr ? ar : en)

  const [q, setQ] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [activePreset, setActivePreset] = useState<DateRangePreset>("all")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PortalShipmentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({
      q,
      dateFrom,
      dateTo,
      page: String(page),
    })
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/portal/shipments?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!res.ok) throw new Error("Failed")
        const json: PortalShipmentsResponse = await res.json()
        if (!controller.signal.aborted) setData(json)
      } catch {
        if (!controller.signal.aborted) setError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [q, dateFrom, dateTo, page])

  function applyPreset(preset: DateRangePreset) {
    const range = resolveDatePreset(preset)
    setActivePreset(preset)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
    setPage(1)
  }

  function clearFilters() {
    setQ("")
    setDateFrom("")
    setDateTo("")
    setActivePreset("all")
    setPage(1)
  }

  const hasFilters = Boolean(q || dateFrom || dateTo)
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)))

  const presets: { key: DateRangePreset; ar: string; en: string }[] = [
    { key: "all", ar: "كل الفترات", en: "All dates" },
    { key: "today", ar: "اليوم", en: "Today" },
    { key: "last7", ar: "آخر 7 أيام", en: "Last 7 days" },
    { key: "thisMonth", ar: "هذا الشهر", en: "This month" },
    { key: "last30", ar: "آخر 30 يومًا", en: "Last 30 days" },
  ]

  return (
    <section
      id="my-shipments"
      dir={isAr ? "rtl" : "ltr"}
      className="overflow-hidden rounded-2xl border border-secondary-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <Ship className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-secondary-900 dark:text-white">
              {label("شحناتي", "My Shipments")}
            </h2>
            <p className="text-xs text-secondary-500 dark:text-slate-400">
              {label("تابع شحناتك النشطة والسابقة والبحث الذكي حسب الفترة", "Track your shipments with smart keyword & date range search")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <Ship className="h-3.5 w-3.5" />
            <bdi dir="ltr">{data?.total ?? 0}</bdi> {label("شحنة", "shipments")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Container className="h-3.5 w-3.5" />
            <bdi dir="ltr">{data?.containers ?? 0}</bdi> {label("حاوية", "containers")}
          </span>
        </div>
      </div>

      {/* Smart Search & Date Range Filter Bar (Task 37) */}
      <div className="space-y-3 border-b border-secondary-100 bg-secondary-50/50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-bold text-secondary-700 dark:text-slate-300">
            <span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" />{label("بحث ذكي في شحناتي", "Smart search")}</span>
            <input
              type="text"
              value={q}
              maxLength={200}
              onChange={e => { setQ(e.target.value); setPage(1) }}
              placeholder={label("رقم الحجز، UCR، الخط الملاحي، الميناء…", "Booking, UCR, shipping line, port…")}
              className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2 text-xs text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <label className="space-y-1 text-xs font-bold text-secondary-700 dark:text-slate-300">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{label("من تاريخ", "From date")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActivePreset("all"); setPage(1) }}
              className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2 text-xs text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <label className="space-y-1 text-xs font-bold text-secondary-700 dark:text-slate-300">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{label("إلى تاريخ", "To date")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActivePreset("all"); setPage(1) }}
              className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2 text-xs text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                  activePreset === p.key && (p.key !== "all" || (!dateFrom && !dateTo))
                    ? "border-primary-600 bg-primary-600 text-white"
                    : "border-secondary-200 bg-white text-secondary-700 hover:bg-secondary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {label(p.ar, p.en)}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-secondary-200 bg-white px-2.5 py-1 text-[11px] font-bold text-secondary-700 hover:bg-secondary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <X className="h-3 w-3" />
              {label("مسح الفلاتر", "Clear filters")}
            </button>
          )}
        </div>
      </div>

      {/* Shipments List */}
      <div className="p-4 sm:p-5">
        {loading ? (
          <p className="py-8 text-center text-sm text-secondary-500">{label("جارٍ تحميل شحناتك…", "Loading your shipments…")}</p>
        ) : error ? (
          <p role="alert" className="py-8 text-center text-sm text-rose-600">{label("تعذّر تحميل الشحنات حاليًا.", "Unable to load shipments right now.")}</p>
        ) : !data?.shipments.length ? (
          <div className="py-10 text-center">
            <Ship className="mx-auto mb-2 h-8 w-8 text-secondary-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-secondary-700 dark:text-slate-300">
              {hasFilters
                ? label("لا توجد شحنات مطابقة للبحث أو الفترة المحددة.", "No shipments match your search or selected period.")
                : label("لا توجد شحنات مسجلة لحسابك حتى الآن.", "No shipments are registered for your account yet.")}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 rounded-lg bg-primary-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
              >
                {label("عرض كل شحناتي", "Show all my shipments")}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-start text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-secondary-200 text-xs text-secondary-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-3 py-2.5 text-start">{label("التاريخ", "Date")}</th>
                  <th className="px-3 py-2.5 text-start">{label("رقم الحجز", "Booking")}</th>
                  <th className="px-3 py-2.5 text-start">{label("الخط الملاحي", "Shipping Line")}</th>
                  <th className="px-3 py-2.5 text-start">{label("الحاويات", "Containers")}</th>
                  <th className="px-3 py-2.5 text-start">UCR</th>
                  <th className="px-3 py-2.5 text-start">{label("المسار", "Route")}</th>
                  <th className="px-3 py-2.5 text-end">{label("الفاتورة", "Invoice")}</th>
                </tr>
              </thead>
              <tbody>
                {data.shipments.map(s => (
                  <tr key={s.id} className="border-b border-secondary-100 last:border-0 dark:border-slate-800/80">
                    <td className="px-3 py-3 tabular-nums"><bdi dir="ltr">{s.shipmentDate || "—"}</bdi></td>
                    <td className="px-3 py-3 font-bold text-secondary-900 dark:text-white">
                      <bdi dir="ltr">{s.booking || "—"}</bdi>
                      {s.number46 && (
                        <span className="ms-1.5 rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-600 dark:bg-slate-800 dark:text-slate-400">
                          46: <bdi dir="ltr">{s.number46}</bdi>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3"><bdi dir="ltr">{s.shippingLine || "—"}</bdi></td>
                    <td className="px-3 py-3 tabular-nums">
                      <bdi dir="ltr">{s.containerCount}{s.containerSize ? ` × ${s.containerSize}` : ""}</bdi>
                    </td>
                    <td className="px-3 py-3"><bdi dir="ltr">{s.ucr || "—"}</bdi></td>
                    <td className="px-3 py-3 text-xs text-secondary-600 dark:text-slate-300">
                      {s.portOfLoading || s.portOfDischarge
                        ? `${s.portOfLoading || "—"} → ${s.portOfDischarge || "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-end">
                      {s.publishedInvoice ? (
                        <Link
                          href={s.publishedInvoice.token ? `/invoice/${s.publishedInvoice.token}` : "/portal/financials"}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          <bdi dir="ltr">{s.publishedInvoice.invoiceNumber}</bdi>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-secondary-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="rounded-lg border border-secondary-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700"
            >
              {label("السابق", "Previous")}
            </button>
            <span className="font-bold tabular-nums">{page} / {pageCount}</span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage(p => p + 1)}
              className="rounded-lg border border-secondary-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700"
            >
              {label("التالي", "Next")}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

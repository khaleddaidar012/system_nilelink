"use client"

import { useSearchParams } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import { useLocale } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { AdminInvoiceKpis } from "@/components/admin/invoices/AdminInvoiceKpis"
import { AdminInvoicesToolbar } from "@/components/admin/invoices/AdminInvoicesToolbar"
import { AdminInvoicesTable } from "@/components/admin/invoices/AdminInvoicesTable"
import { CreateInvoiceModal } from "@/components/admin/invoices/CreateInvoiceModal"
import { EditInvoiceModal } from "@/components/admin/invoices/EditInvoiceModal"
import { InvoiceReviewDrawer } from "@/components/admin/invoices/InvoiceReviewDrawer"
import { SendInvoiceDialog } from "@/components/admin/invoices/SendInvoiceDialog"
import { Building2, Calendar, ChevronLeft, ChevronRight, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Link } from "@/navigation"
import { useAdminRole, useCanAccessAccounts } from "@/components/admin/AdminExperienceContext"
import { resolveDatePreset, type DateRangePreset } from "@/lib/shipments/smart-search"

interface CompanyTotalRow {
  customerId: string
  companyName: string
  currency: string
  invoiceCount: number
  draftCount: number
  confirmedCount: number
  totalInvoicedAmount: number
  totalPaidAmount: number
  totalRemainingAmount: number
}

export default function AdminInvoicesPage() {
  const role = useAdminRole()
  const isAdmin = role === "super_admin"
  const canAccessAccounts = useCanAccessAccounts()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const isAr = locale === "ar"
  const label = (ar: string, en: string) => (isAr ? ar : en)

  const [invoices, setInvoices] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any | null>(null)
  const [companyTotals, setCompanyTotals] = useState<CompanyTotalRow[]>([])
  const [allCustomers, setAllCustomers] = useState<{ id: string; companyName: string }[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)

  // Filters (Task 39: Company + Month / Date Range + Status + Document Type + Search)
  const [customerIdFilter, setCustomerIdFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState("")
  const [startDateFilter, setStartDateFilter] = useState("")
  const [endDateFilter, setEndDateFilter] = useState("")
  const [activePreset, setActivePreset] = useState<DateRangePreset>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all")

  // Modals & Drawers state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  useEffect(() => {
    const id = searchParams.get("edit")
    if (id && /^[a-f\d]{24}$/i.test(id)) setEditingInvoiceId(id)
  }, [searchParams])
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [sendingInvoice, setSendingInvoice] = useState<any | null>(null)

  // Load company options once for the Company selector
  useEffect(() => {
    fetch("/api/admin/customers/search?q=", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.customers) setAllCustomers(data.customers)
      })
      .catch(() => {})
  }, [])

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(pagination.page))
      params.set("limit", String(pagination.limit))
      if (customerIdFilter !== "all") params.set("customerId", customerIdFilter)
      if (monthFilter) params.set("month", monthFilter)
      if (startDateFilter) params.set("startDate", startDateFilter)
      if (endDateFilter) params.set("endDate", endDateFilter)
      if (searchQuery.trim()) params.set("search", searchQuery.trim())
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (documentTypeFilter !== "all") params.set("documentType", documentTypeFilter)

      const res = await fetch(`/api/admin/invoices?${params.toString()}`, { cache: "no-store" })
      const data = await res.json()

      if (data.success) {
        setInvoices(data.invoices || [])
        if (data.pagination) setPagination(data.pagination)
        setMetrics(data.metrics ?? null)
        setCompanyTotals(data.companyTotals || [])
      } else {
        toast.error(data.error || "Failed to fetch invoices")
      }
    } catch {
      toast.error("Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }, [
    pagination.page,
    pagination.limit,
    customerIdFilter,
    monthFilter,
    startDateFilter,
    endDateFilter,
    searchQuery,
    statusFilter,
    documentTypeFilter,
  ])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const applyPreset = (preset: DateRangePreset) => {
    const range = resolveDatePreset(preset)
    setActivePreset(preset)
    setMonthFilter("")
    setStartDateFilter(range.dateFrom)
    setEndDateFilter(range.dateTo)
    setPagination(p => ({ ...p, page: 1 }))
  }

  const clearPeriodAndCompany = () => {
    setCustomerIdFilter("all")
    setMonthFilter("")
    setStartDateFilter("")
    setEndDateFilter("")
    setActivePreset("all")
    setSearchQuery("")
    setStatusFilter("all")
    setDocumentTypeFilter("all")
    setPagination(p => ({ ...p, page: 1 }))
  }

  const handleDeleteDraft = async (invoice: any) => {
    const confirmMsg = isAr
      ? `هل أنت متأكد من رغبتك في حذف المسودة ${invoice.invoiceNumber}؟ لا يمكن التراجع عن هذا الإجراء.`
      : `Are you sure you want to delete draft invoice ${invoice.invoiceNumber}? This action cannot be undone.`

    if (!window.confirm(confirmMsg)) return

    try {
      const res = await fetch(`/api/admin/invoices/${invoice._id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete draft invoice")
      toast.success(isAr ? "تم حذف المسودة بنجاح" : "Draft deleted successfully")
      fetchInvoices()
    } catch (err: any) {
      toast.error(err.message || "Failed to delete draft")
    }
  }

  const selectedCompanyName =
    customerIdFilter !== "all"
      ? allCustomers.find(c => c.id === customerIdFilter)?.companyName ||
        companyTotals.find(c => c.customerId === customerIdFilter)?.companyName ||
        ""
      : ""

  const hasPeriodOrCompanyFilter = Boolean(
    customerIdFilter !== "all" || monthFilter || startDateFilter || endDateFilter
  )

  const presets: { key: DateRangePreset; ar: string; en: string }[] = [
    { key: "all", ar: "كل الفترات", en: "All dates" },
    { key: "thisMonth", ar: "هذا الشهر", en: "This month" },
    { key: "last30", ar: "آخر 30 يومًا", en: "Last 30 days" },
    { key: "last90", ar: "آخر 3 أشهر", en: "Last 3 months" },
  ]

  return (
    <div className="flex min-h-full flex-col space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <AdminHeader
        title={isAr ? "إدارة الفواتير والماليات" : "Commercial Invoices & Billing"}
        subtitle={
          isAr
            ? "إصدار ومراجعة واعتماد الفواتير التجارية وحساب إجماليات كل شركة حسب الشهر أو الفترة"
            : "Generate, review, and track commercial invoices and per-company totals by month or date range"
        }
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {canAccessAccounts && (
              <Link
                href="/admin/shipment-invoices"
                className="inline-flex rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-300"
              >
                {isAr ? "حسابات وفواتير الشحنات" : "Shipment accounting & invoices"}
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-primary-500"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? "إنشاء فاتورة جديدة" : "Create Invoice"}</span>
          </button>
        </div>

        {/* Professional Company + Month / Date Range Search Bar (Task 39) */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {label("بحث واحتساب الإجمالي حسب الشركة والشهر أو الفترة", "Search & Calculate Totals by Company and Month / Period")}
            </h2>
            {hasPeriodOrCompanyFilter && (
              <button
                type="button"
                onClick={clearPeriodAndCompany}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
                {label("مسح الفلاتر", "Clear filters")}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {label("الشركة / العميل", "Company / Customer")}
              </span>
              <select
                value={customerIdFilter}
                onChange={e => {
                  setCustomerIdFilter(e.target.value)
                  setPagination(p => ({ ...p, page: 1 }))
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="all">{label("كل الشركات", "All companies")}</option>
                {allCustomers.map(c => (
                  <option key={c.id} value={c.id}>{c.companyName}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {label("شهر محدد", "Specific month")}
              </span>
              <input
                type="month"
                value={monthFilter}
                onChange={e => {
                  setMonthFilter(e.target.value)
                  setStartDateFilter("")
                  setEndDateFilter("")
                  setActivePreset("all")
                  setPagination(p => ({ ...p, page: 1 }))
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>{label("أو من تاريخ", "Or from date")}</span>
              <input
                type="date"
                value={startDateFilter}
                onChange={e => {
                  setStartDateFilter(e.target.value)
                  setMonthFilter("")
                  setActivePreset("all")
                  setPagination(p => ({ ...p, page: 1 }))
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>{label("إلى تاريخ", "To date")}</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={e => {
                  setEndDateFilter(e.target.value)
                  setMonthFilter("")
                  setActivePreset("all")
                  setPagination(p => ({ ...p, page: 1 }))
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                  activePreset === p.key && (p.key !== "all" || (!monthFilter && !startDateFilter && !endDateFilter))
                    ? "border-primary-600 bg-primary-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                }`}
              >
                {label(p.ar, p.en)}
              </button>
            ))}
          </div>
        </section>

        {/* KPI Cards: Grand Total ONLY for Super Admin; Company Total for Accounts + Super Admin when a company is selected */}
        {metrics && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {metrics.scope === "company"
                  ? label(
                      `إجمالي فواتير شركة: ${selectedCompanyName}${monthFilter ? ` (${monthFilter})` : ""}`,
                      `Company Invoice Totals: ${selectedCompanyName}${monthFilter ? ` (${monthFilter})` : ""}`
                    )
                  : label("الإجمالي العام لجميع الشركات (للأدمن فقط)", "Grand Total Across All Companies (Admin Only)")}
              </h3>
            </div>
            <AdminInvoiceKpis metrics={metrics} />
          </div>
        )}

        {!isAdmin && !metrics && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            {label(
              "اختر شركة من الأعلى أو من جدول «إجمالي الفواتير لكل شركة» بالأسفل لعرض إجمالي فواتيرها خلال الشهر أو الفترة المحددة (الإجمالي العام متاح للأدمن فقط).",
              "Select a company above or from the Per-Company Totals table below to view its totals for any month or period (Grand Total is restricted to Administrators)."
            )}
          </div>
        )}

        {/* Per-Company Totals Breakdown (Visible to Accounts & Super Admin) */}
        {companyTotals.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {label("إجمالي الفواتير لكل شركة", "Invoice Totals per Company")}
                </h3>
                <p className="text-xs text-slate-500">
                  {label("اضغط على أي شركة لتصفية فواتيرها واحتساب إجماليها", "Click any company to filter its invoices and period totals")}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <bdi dir="ltr">{companyTotals.length}</bdi> {label("شركة", "companies")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60">
                    <th className="px-4 py-2.5 text-start">{label("الشركة", "Company")}</th>
                    <th className="px-4 py-2.5 text-start">{label("عدد الفواتير", "Invoices")}</th>
                    <th className="px-4 py-2.5 text-start">{label("إجمالي الفواتير", "Total Invoiced")}</th>
                    <th className="px-4 py-2.5 text-start">{label("المحصّل", "Collected")}</th>
                    <th className="px-4 py-2.5 text-start">{label("المتبقي", "Remaining")}</th>
                    <th className="px-4 py-2.5 text-end">{label("تصفية", "Filter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {companyTotals.map((row, idx) => (
                    <tr
                      key={`${row.customerId || row.companyName}-${row.currency}-${idx}`}
                      className={`border-b border-slate-100 last:border-0 dark:border-slate-800/80 ${
                        row.customerId && customerIdFilter === row.customerId
                          ? "bg-primary-50/50 dark:bg-primary-950/30"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{row.companyName}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <bdi dir="ltr">{row.invoiceCount}</bdi>
                        {row.draftCount > 0 && (
                          <span className="ms-1.5 text-[11px] text-slate-500">
                            ({row.draftCount} {label("مسودة", "draft")})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-slate-900 dark:text-white">
                        <bdi dir="ltr">{row.totalInvoicedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</bdi>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        <bdi dir="ltr">{row.totalPaidAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</bdi>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                        <bdi dir="ltr">{row.totalRemainingAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</bdi>
                      </td>
                      <td className="px-4 py-3 text-end">
                        {row.customerId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerIdFilter(customerIdFilter === row.customerId ? "all" : row.customerId)
                              setPagination(p => ({ ...p, page: 1 }))
                            }}
                            className="rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/50 dark:text-primary-300"
                          >
                            {customerIdFilter === row.customerId ? label("إلغاء التحديد", "Unselect") : label("عرض الشركة", "View company")}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Master Invoices Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <AdminInvoicesToolbar
            searchQuery={searchQuery}
            onSearchChange={q => {
              setSearchQuery(q)
              setPagination(p => ({ ...p, page: 1 }))
            }}
            statusFilter={statusFilter}
            onStatusChange={s => {
              setStatusFilter(s)
              setPagination(p => ({ ...p, page: 1 }))
            }}
            documentTypeFilter={documentTypeFilter}
            onDocumentTypeChange={dt => {
              setDocumentTypeFilter(dt)
              setPagination(p => ({ ...p, page: 1 }))
            }}
            onRefresh={fetchInvoices}
            loading={loading}
          />

          <AdminInvoicesTable
            invoices={invoices}
            loading={loading}
            onSelectInvoice={inv => setSelectedInvoice(inv)}
            onEditDraft={id => setEditingInvoiceId(id)}
            onSendInvoice={inv => setSendingInvoice(inv)}
            onDeleteDraft={handleDeleteDraft}
          />

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500 dark:border-slate-800">
              <span>
                {isAr
                  ? `صفحة ${pagination.page} من ${pagination.totalPages} (${pagination.total} فاتورة)`
                  : `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} invoices)`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700"
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700"
                >
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isCreateOpen && (
        <CreateInvoiceModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={() => fetchInvoices()} />
      )}
      {editingInvoiceId && (
        <EditInvoiceModal isOpen={!!editingInvoiceId} onClose={() => setEditingInvoiceId(null)} invoiceId={editingInvoiceId} onSuccess={() => fetchInvoices()} />
      )}
      {selectedInvoice && (
        <InvoiceReviewDrawer
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          invoice={selectedInvoice}
          onStatusUpdated={() => fetchInvoices()}
          onOpenEdit={id => setEditingInvoiceId(id)}
          onOpenSend={inv => setSendingInvoice(inv)}
        />
      )}
      {sendingInvoice && (
        <SendInvoiceDialog isOpen={!!sendingInvoice} onClose={() => setSendingInvoice(null)} invoice={sendingInvoice} onSuccess={() => fetchInvoices()} />
      )}
    </div>
  )
}

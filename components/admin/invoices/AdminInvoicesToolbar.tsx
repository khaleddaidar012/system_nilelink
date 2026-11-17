"use client"

import { useLocale } from "next-intl"
import { Search, RefreshCw, Filter } from "lucide-react"

interface AdminInvoicesToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: string
  onStatusChange: (status: string) => void
  documentTypeFilter?: string
  onDocumentTypeChange?: (type: string) => void
  onRefresh: () => void
  loading?: boolean
}

export function AdminInvoicesToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  documentTypeFilter = "all",
  onDocumentTypeChange,
  onRefresh,
  loading = false,
}: AdminInvoicesToolbarProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const statusOptions = [
    { value: "all", labelEn: "All Statuses", labelAr: "جميع الحالات" },
    { value: "draft", labelEn: "Drafts", labelAr: "المسودات" },
    { value: "confirmed", labelEn: "Confirmed", labelAr: "المعتمدة" },
    { value: "sent", labelEn: "Sent", labelAr: "المرسلة" },
    { value: "partially_paid", labelEn: "Partially Paid", labelAr: "مدفوعة جزئياً" },
    { value: "paid", labelEn: "Paid", labelAr: "المدفوعة" },
    { value: "overdue", labelEn: "Overdue", labelAr: "المتأخرة" },
    { value: "cancelled", labelEn: "Cancelled", labelAr: "الملغاة" },
  ]

  const documentTypeOptions = [
    { value: "all", labelEn: "All Doc Types", labelAr: "جميع أنواع المستندات" },
    { value: "statement", labelEn: "Statement (كشف حساب)", labelAr: "كشف حساب" },
    { value: "invoice", labelEn: "Invoice (فاتورة)", labelAr: "فاتورة" },
    { value: "tax_invoice", labelEn: "Tax Invoice (فاتورة ضريبية)", labelAr: "فاتورة ضريبية" },
  ]

  return (
    <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 rtl:left-auto rtl:right-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={isAr ? "بحث برقم الفاتورة، اسم العميل، رقم الشحنة..." : "Search by invoice #, customer name, tracking #..."}
          className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
        />
      </div>

      {/* Filter Tabs & Refresh */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
        {onDocumentTypeChange && (
          <select
            value={documentTypeFilter}
            onChange={(e) => onDocumentTypeChange(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold focus:outline-none"
          >
            {documentTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {isAr ? opt.labelAr : opt.labelEn}
              </option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold focus:outline-none"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {isAr ? opt.labelAr : opt.labelEn}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          title={isAr ? "تحديث" : "Refresh"}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary-500" : ""}`} />
        </button>
      </div>
    </div>
  )
}

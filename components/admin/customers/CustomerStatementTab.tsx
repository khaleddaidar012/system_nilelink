"use client"

import { useState, useEffect, useCallback } from "react"
import { useLocale } from "next-intl"
import {
  Calendar,
  Filter,
  Download,
  Printer,
  Send,
  RefreshCw,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Receipt,
  CreditCard,
  Ship,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { ICustomerStatement, ICustomerLedgerEntry } from "@/types/customer-statement"
import { SendStatementDialog } from "./SendStatementDialog"
import { toast } from "sonner"

interface CustomerStatementTabProps {
  customerId: string
  customerName: string
  customerEmail?: string
}

export function CustomerStatementTab({
  customerId,
  customerName,
  customerEmail = "",
}: CustomerStatementTabProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  // Filter States
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [filterType, setFilterType] = useState<"all" | "shipments" | "invoices" | "payments">("all")

  // Data States
  const [statement, setStatement] = useState<ICustomerStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEmailOpen, setIsEmailOpen] = useState(false)

  // Fetch statement data
  const fetchStatement = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set("fromDate", fromDate)
      if (toDate) params.set("toDate", toDate)
      if (filterType !== "all") params.set("type", filterType)

      const res = await fetch(`/api/admin/customers/${customerId}/statement?${params.toString()}`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load statement")
      }

      setStatement(data.statement)
    } catch (err: any) {
      toast.error(err.message || "Failed to load customer statement")
    } finally {
      setLoading(false)
    }
  }, [customerId, fromDate, toDate, filterType])

  useEffect(() => {
    fetchStatement()
  }, [fetchStatement])

  // Date Presets
  const applyPreset = (preset: "this_month" | "last_30" | "ytd" | "all") => {
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    if (preset === "all") {
      setFromDate("")
      setToDate("")
    } else if (preset === "last_30") {
      const past = new Date()
      past.setDate(today.getDate() - 30)
      setFromDate(formatYMD(past))
      setToDate(formatYMD(today))
    } else if (preset === "this_month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      setFromDate(formatYMD(start))
      setToDate(formatYMD(today))
    } else if (preset === "ytd") {
      const start = new Date(today.getFullYear(), 0, 1)
      setFromDate(formatYMD(start))
      setToDate(formatYMD(today))
    }
  }

  // PDF Export
  const handleExportPdf = () => {
    const params = new URLSearchParams()
    if (fromDate) params.set("fromDate", fromDate)
    if (toDate) params.set("toDate", toDate)
    if (filterType !== "all") params.set("type", filterType)
    window.open(`/api/admin/customers/${customerId}/statement/pdf?${params.toString()}`, "_blank")
  }

  // Print
  const handlePrint = () => {
    const params = new URLSearchParams()
    if (fromDate) params.set("fromDate", fromDate)
    if (toDate) params.set("toDate", toDate)
    if (filterType !== "all") params.set("type", filterType)
    window.open(`/api/admin/customers/${customerId}/statement/pdf?${params.toString()}`, "_blank")
  }

  const summary = statement?.summary || {
    openingBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    closingBalance: 0,
    currency: "EGP",
    totalTransactions: 0,
  }

  const entries = statement?.entries || []

  return (
    <div className="space-y-6">
      {/* 1. Filter Toolbar */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Date Range Inputs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">{isAr ? "من:" : "From:"}</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">{isAr ? "إلى:" : "To:"}</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-3 rtl:border-l-0 rtl:border-r rtl:pl-0 rtl:pr-3">
              <button
                type="button"
                onClick={() => applyPreset("this_month")}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isAr ? "هذا الشهر" : "This Month"}
              </button>
              <button
                type="button"
                onClick={() => applyPreset("last_30")}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isAr ? "آخر 30 يوم" : "Last 30 Days"}
              </button>
              <button
                type="button"
                onClick={() => applyPreset("ytd")}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isAr ? "السنة الحالية" : "Year to Date"}
              </button>
              <button
                type="button"
                onClick={() => applyPreset("all")}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isAr ? "الكل" : "All Time"}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchStatement}
              disabled={loading}
              className="h-8.5 rounded-xl text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{isAr ? "تحديث" : "Refresh"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={loading || entries.length === 0}
              className="h-8.5 rounded-xl text-xs gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? "طباعة" : "Print"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPdf}
              disabled={loading || entries.length === 0}
              className="h-8.5 rounded-xl text-xs gap-1.5 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? "تحميل PDF" : "Export PDF"}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsEmailOpen(true)}
              disabled={loading || entries.length === 0}
              className="h-8.5 rounded-xl text-xs gap-1.5 bg-primary-600 hover:bg-primary-700 text-white font-bold"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isAr ? "إرسال للعميل" : "Email Statement"}</span>
            </Button>
          </div>
        </div>

        {/* Transaction Category Filter Pills */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-xs font-bold text-slate-400 mr-2 rtl:mr-0 rtl:ml-2">
            {isAr ? "نوع المعاملات:" : "Transactions:"}
          </span>
          {[
            { id: "all", labelAr: "كامل المعاملات", labelEn: "All Transactions" },
            { id: "shipments", labelAr: "شحنات وخدمات لوجستية", labelEn: "Shipments & Freight" },
            { id: "invoices", labelAr: "الفواتير والمطالبات", labelEn: "Invoices & Debits" },
            { id: "payments", labelAr: "المدفوعات والسدادات", labelEn: "Payments & Credits" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === tab.id
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {isAr ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Financial Summary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Opening Balance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            {isAr ? "الرصيد الافتتاحي (قبل الفترة)" : "Opening Balance"}
          </span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1 block">
            {Number(summary.openingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
            <span className="text-xs font-semibold text-slate-400">{summary.currency}</span>
          </span>
          <p className="text-[11px] text-slate-500 mt-1">
            {isAr ? "الرصيد المرحل التراكمي" : "Carried forward balance"}
          </p>
        </div>

        {/* Total Charges / Debit */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider block">
            {isAr ? "إجمالي المطالبات (مدين +)" : "Total Invoiced (Debit +)"}
          </span>
          <span className="text-xl font-black font-mono text-rose-600 dark:text-rose-400 mt-1 block">
            +{Number(summary.totalDebit).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
            <span className="text-xs font-semibold text-slate-400">{summary.currency}</span>
          </span>
          <p className="text-[11px] text-slate-500 mt-1">
            {isAr ? "فواتير ورسوم الفترة المحددة" : "Total charges in period"}
          </p>
        </div>

        {/* Total Payments / Credit */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            {isAr ? "إجمالي السدادات (دائن -)" : "Total Payments (Credit -)"}
          </span>
          <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
            -{Number(summary.totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
            <span className="text-xs font-semibold text-slate-400">{summary.currency}</span>
          </span>
          <p className="text-[11px] text-slate-500 mt-1">
            {isAr ? "التحصيلات والمدفوعات المسجلة" : "Collected payments in period"}
          </p>
        </div>

        {/* Closing Balance Due */}
        <div
          className={`p-5 rounded-2xl border shadow-xs ${
            summary.closingBalance > 0
              ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
              : summary.closingBalance < 0
                ? "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40"
                : "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
          }`}
        >
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
            {isAr ? "الرصيد الختامي المستحق" : "Closing Balance Due"}
          </span>
          <span
            className={`text-xl font-black font-mono mt-1 block ${
              summary.closingBalance > 0
                ? "text-amber-700 dark:text-amber-300"
                : summary.closingBalance < 0
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {Number(summary.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
            <span className="text-xs font-semibold text-slate-500">{summary.currency}</span>
          </span>
          <p className="text-[11px] text-slate-500 mt-1 font-semibold">
            {summary.closingBalance > 0
              ? isAr
                ? "مستحق على العميل (مدين)"
                : "Customer Liability"
              : summary.closingBalance < 0
                ? isAr
                  ? "رصيد دائن لصالح العميل"
                  : "Customer Credit"
                : isAr
                  ? "الحساب مسوى بالكامل"
                  : "Account Balanced"}
          </p>
        </div>
      </div>

      {/* 3. Chronological Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-primary-600" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "جدول كشف الحساب التفصيلي" : "Chronological Ledger Statement"}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {entries.length} {isAr ? "معاملة" : "entries"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <p className="text-xs font-semibold">{isAr ? "جاري احتساب كشف الحساب..." : "Computing ledger..."}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-3">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "لا توجد معاملات مسجلة في هذه الفترة" : "No transactions found in this period"}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {isAr
                ? "يمكنك توسيع نطاق البحث باختيار 'كامل السجل' لمراجعة كافة الفواتير والمدفوعات"
                : "You can widen the date range to review all recorded invoices and payments"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider">
                  <th className="py-3 px-5">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="py-3 px-4">{isAr ? "النوع" : "Type"}</th>
                  <th className="py-3 px-4">{isAr ? "البيان والتفاصيل" : "Description"}</th>
                  <th className="py-3 px-4">{isAr ? "المرجع" : "Reference"}</th>
                  <th className="py-3 px-4 text-right rtl:text-left">{isAr ? "مدين (+)" : "Debit (+)"}</th>
                  <th className="py-3 px-4 text-right rtl:text-left">{isAr ? "دائن (-)" : "Credit (-)"}</th>
                  <th className="py-3 px-5 text-right rtl:text-left">{isAr ? "الرصيد التراكمي" : "Balance"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {/* Initial Opening Balance Row */}
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 text-slate-500 font-semibold italic">
                  <td className="py-2.5 px-5">
                    {fromDate ? fromDate : isAr ? "بداية الحساب" : "Initial"}
                  </td>
                  <td className="py-2.5 px-4">-</td>
                  <td className="py-2.5 px-4">
                    {isAr ? "الرصيد الافتتاحي ما قبل الفترة" : "Opening Balance Prior to Period"}
                  </td>
                  <td className="py-2.5 px-4">-</td>
                  <td className="py-2.5 px-4 text-right rtl:text-left">-</td>
                  <td className="py-2.5 px-4 text-right rtl:text-left">-</td>
                  <td className="py-2.5 px-5 text-right rtl:text-left font-mono font-bold text-slate-800 dark:text-slate-200">
                    {Number(summary.openingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                    {summary.currency}
                  </td>
                </tr>

                {/* In-Period Transaction Rows */}
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {entry.date ? entry.date.split("T")[0] : "-"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {entry.type === "invoice" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50">
                          <Receipt className="w-2.5 h-2.5" />
                          <span>{isAr ? "فاتورة" : "Invoice"}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
                          <CreditCard className="w-2.5 h-2.5" />
                          <span>{isAr ? "سداد" : "Payment"}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{entry.description}</p>
                      {entry.relatedShipmentTracking && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                          <Ship className="w-3 h-3 text-slate-400" />
                          <span>{entry.relatedShipmentTracking}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {entry.reference}
                    </td>
                    <td className="py-3 px-4 text-right rtl:text-left font-mono font-bold whitespace-nowrap">
                      {entry.debit > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">
                          +{Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right rtl:text-left font-mono font-bold whitespace-nowrap">
                      {entry.credit > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          -{Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right rtl:text-left font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">
                      {Number(entry.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                      <span className="text-[10px] font-normal text-slate-400">{entry.currency}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Statement Dialog */}
      {statement && (
        <SendStatementDialog
          isOpen={isEmailOpen}
          onClose={() => setIsEmailOpen(false)}
          customerId={customerId}
          customerName={customerName}
          defaultEmail={customerEmail || statement.customer.contactEmail}
          fromDate={fromDate}
          toDate={toDate}
          closingBalance={summary.closingBalance}
          currency={summary.currency}
        />
      )}
    </div>
  )
}

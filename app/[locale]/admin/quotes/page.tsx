"use client"

import { useState, useEffect } from "react"
import { useLocale } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"
import {
  Search,
  RefreshCw,
  FileSpreadsheet,
  Receipt,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  ArrowUpRight,
  Building2,
  DollarSign,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { Link } from "@/navigation"

export default function AdminQuotesPage() {
  const locale = useLocale()
  const isAr = locale === "ar"

  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const fetchQuotes = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/quotes")
      const data = await res.json()
      if (data.success && data.quotes) {
        setQuotes(data.quotes)
      }
    } catch (err) {
      console.error("Failed to load quotes:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotes()
  }, [])

  const filteredQuotes = quotes.filter((q) => {
    const matchesStatus = statusFilter === "all" || q.status === statusFilter
    const qNum = (q.quoteNumber || "").toLowerCase()
    const compName = (q.customerId?.companyName || "").toLowerCase()
    const tracking = (q.requestId?.trackingNumber || "").toLowerCase()
    const query = searchQuery.toLowerCase().trim()
    const matchesSearch = !query || qNum.includes(query) || compName.includes(query) || tracking.includes(query)
    return matchesStatus && matchesSearch
  })

  const stats = {
    total: quotes.length,
    sent: quotes.filter((q) => q.status === "sent").length,
    accepted: quotes.filter((q) => q.status === "accepted").length,
    rejected: quotes.filter((q) => q.status === "rejected").length,
  }

  return (
    <div className="flex flex-col pb-16">
      <AdminHeader
        title={isAr ? "عروض الأسعار والعملاء" : "Quotation & Rate Engine"}
        subtitle={
          isAr
            ? "متابعة وإدارة كافة عروض الأسعار الصادرة للعملاء ومتابعة حالات القبول والرفض"
            : "Manage and track all issued client quotations and approval statuses"
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-secondary-200/80 bg-white p-5 shadow-xs dark:border-secondary-800 dark:bg-secondary-900">
            <div className="flex items-center justify-between text-secondary-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">{isAr ? "إجمالي العروض" : "Total Quotes"}</span>
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <p className="text-2xl font-black text-secondary-900 dark:text-white">{stats.total}</p>
          </div>

          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/50 p-5 shadow-xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">{isAr ? "بانتظار العميل" : "Pending Review"}</span>
              <Clock className="h-4 w-4" />
            </div>
            <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{stats.sent}</p>
          </div>

          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-5 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">{isAr ? "عروض معتمدة" : "Accepted"}</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{stats.accepted}</p>
          </div>

          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-5 shadow-xs dark:border-rose-900/40 dark:bg-rose-950/20">
            <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">{isAr ? "عروض مرفوضة" : "Rejected"}</span>
              <XCircle className="h-4 w-4" />
            </div>
            <p className="text-2xl font-black text-rose-700 dark:text-rose-300">{stats.rejected}</p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col gap-4 rounded-2xl border border-secondary-200/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-secondary-800 dark:bg-secondary-900">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-secondary-400 rtl:left-auto rtl:right-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث برقم العرض، اسم العميل، أو رقم الطلب..." : "Search by quote #, client, or tracking #..."}
              className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 py-2.5 pl-10 pr-4 text-xs font-medium text-secondary-900 shadow-inner transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pl-4 rtl:pr-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-secondary-100 p-1 dark:bg-secondary-800">
              {[
                { key: "all", labelAr: "الكل", labelEn: "All" },
                { key: "sent", labelAr: "مُرسل", labelEn: "Sent" },
                { key: "accepted", labelAr: "معتمد", labelEn: "Accepted" },
                { key: "rejected", labelAr: "مرفوض", labelEn: "Rejected" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                    statusFilter === tab.key
                      ? "bg-white text-secondary-900 shadow-xs dark:bg-secondary-700 dark:text-white"
                      : "text-secondary-500 hover:text-secondary-900 dark:text-secondary-400"
                  )}
                >
                  {isAr ? tab.labelAr : tab.labelEn}
                </button>
              ))}
            </div>

            <Button onClick={fetchQuotes} variant="outline" size="sm" className="rounded-xl">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Master Quotes Table */}
        <div className="overflow-hidden rounded-2xl border border-secondary-200/80 bg-white shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs rtl:text-right">
              <thead className="border-b border-secondary-100 bg-secondary-50/75 text-[11px] font-bold text-secondary-600 uppercase tracking-wider dark:border-secondary-800 dark:bg-secondary-800/50 dark:text-secondary-400">
                <tr>
                  <th className="px-5 py-3.5">{isAr ? "رقم عرض السعر" : "Quote Number"}</th>
                  <th className="px-4 py-3.5">{isAr ? "العميل والشركة" : "Client / Company"}</th>
                  <th className="px-4 py-3.5">{isAr ? "الطلب المرتبط" : "Related Request"}</th>
                  <th className="px-4 py-3.5">{isAr ? "إجمالي العرض" : "Total Price"}</th>
                  <th className="px-4 py-3.5">{isAr ? "الصلاحية" : "Valid Until"}</th>
                  <th className="px-4 py-3.5">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-5 py-3.5 text-right rtl:text-left">{isAr ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-secondary-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-primary-500" />
                        <span>{isAr ? "جاري تحميل عروض الأسعار..." : "Loading quotations..."}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-100 text-secondary-400 dark:bg-secondary-800 dark:text-secondary-500">
                        <Receipt className="h-7 w-7" />
                      </div>
                      <p className="mt-3 text-sm font-bold text-secondary-900 dark:text-white">
                        {isAr ? "لم يتم العثور على أي عروض أسعار" : "No quotations found"}
                      </p>
                      <p className="text-xs text-secondary-500 mt-1">
                        {isAr
                          ? "يمكنك إنشاء عروض أسعار جديدة من خلال صفحة تفاصيل أي طلب خدمة."
                          : "You can generate new quotations from the request detail pages."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredQuotes.map((q) => {
                    const reqId = q.requestId?._id || q.requestId
                    return (
                      <tr key={q._id} className="group hover:bg-secondary-50/60 dark:hover:bg-secondary-800/40 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400 block">
                            {q.quoteNumber}
                          </span>
                          <span className="text-[10px] text-secondary-400">
                            {q.createdAt ? new Date(q.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span className="font-bold text-secondary-900 dark:text-white block text-sm">
                            {q.customerId?.companyName || "N/A"}
                          </span>
                          <span className="text-[11px] text-secondary-500">
                            {q.customerId?.contactEmail || ""}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <Link
                            href={`/admin/requests/${reqId}`}
                            className="font-mono font-bold text-xs text-primary-600 hover:underline inline-flex items-center gap-1 dark:text-primary-400"
                          >
                            <span>{q.requestId?.trackingNumber || "View Request"}</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                          {q.requestId?.subject && (
                            <p className="text-[11px] text-secondary-500 truncate max-w-[200px]">
                              {q.requestId.subject}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <span className="font-black text-sm text-secondary-900 dark:text-white">
                            {q.totalAmount?.toLocaleString()} {q.currency || "USD"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span className="font-semibold text-secondary-700 dark:text-secondary-300 text-xs">
                            {q.validUntil ? new Date(q.validUntil).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase",
                            q.status === "accepted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            q.status === "rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          )}>
                            {q.status === "accepted" ? (
                              <><CheckCircle2 className="h-3 w-3" /> {isAr ? "معتمد" : "Accepted"}</>
                            ) : q.status === "rejected" ? (
                              <><XCircle className="h-3 w-3" /> {isAr ? "مرفوض" : "Rejected"}</>
                            ) : (
                              <><Clock className="h-3 w-3" /> {isAr ? "مُرسل" : "Sent"}</>
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right rtl:text-left">
                          <div className="flex items-center justify-end gap-1.5 rtl:justify-start">
                            <Link href={`/admin/requests/${reqId}`}>
                              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-secondary-700 dark:text-secondary-300">
                                <Eye className="h-3.5 w-3.5 mr-1 rtl:mr-0 rtl:ml-1" />
                                {isAr ? "الطلب" : "Request"}
                              </Button>
                            </Link>

                            <Link href={`/admin/requests/${reqId}/quote`}>
                              <Button size="sm" className="h-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                                {isAr ? "تعديل العرض" : "Edit Quote"}
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

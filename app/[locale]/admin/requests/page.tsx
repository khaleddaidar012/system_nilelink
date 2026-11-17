"use client"

import { useState, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"
import {
  Search,
  Clock,
  RefreshCw,
  Layers,
  Edit,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  PlayCircle,
  XCircle,
  Filter,
  Package,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { Link } from "@/navigation"
import { RequestQRCode } from "@/components/admin/requests/RequestQRCode"

type FilterCategory = "all" | "review" | "document_required" | "quotes" | "processing" | "completed" | "cancelled"

export default function AdminRequestsPage() {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"

  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/requests")
      const data = await res.json()
      if (data.requests) setRequests(data.requests)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const CATEGORIES = [
    {
      key: "all" as FilterCategory,
      labelAr: "كل الطلبات",
      labelEn: "All Requests",
      icon: Layers,
      match: (status: string) => true,
    },
    {
      key: "review" as FilterCategory,
      labelAr: "قيد المراجعة",
      labelEn: "Under Review",
      icon: Clock,
      match: (status: string) => ["submitted", "document_under_review"].includes(status),
      cardBorder: "border-sky-200 dark:border-sky-800/60",
      cardBg: "bg-sky-50/50 dark:bg-sky-950/20",
      iconBg: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
      activeChip: "bg-sky-600 text-white shadow-sm shadow-sky-500/20",
    },
    {
      key: "document_required" as FilterCategory,
      labelAr: "مطلوب مستندات",
      labelEn: "Docs Required",
      icon: AlertCircle,
      match: (status: string) => status === "document_required",
      cardBorder: "border-amber-200 dark:border-amber-800/60",
      cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
      iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
      activeChip: "bg-amber-600 text-white shadow-sm shadow-amber-500/20",
    },
    {
      key: "quotes" as FilterCategory,
      labelAr: "عروض الأسعار",
      labelEn: "Quotations",
      icon: DollarSign,
      match: (status: string) => ["quote_pending", "quote_provided", "quote_accepted"].includes(status),
      cardBorder: "border-indigo-200 dark:border-indigo-800/60",
      cardBg: "bg-indigo-50/50 dark:bg-indigo-950/20",
      iconBg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
      activeChip: "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20",
    },
    {
      key: "processing" as FilterCategory,
      labelAr: "قيد التنفيذ (نشط)",
      labelEn: "In Processing (Active)",
      icon: PlayCircle,
      match: (status: string) => status === "processing",
      cardBorder: "border-blue-200 dark:border-blue-800/60",
      cardBg: "bg-blue-50/50 dark:bg-blue-950/20",
      iconBg: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
      activeChip: "bg-blue-600 text-white shadow-sm shadow-blue-500/20",
    },
    {
      key: "completed" as FilterCategory,
      labelAr: "مكتمل",
      labelEn: "Completed",
      icon: CheckCircle2,
      match: (status: string) => status === "completed",
      cardBorder: "border-emerald-200 dark:border-emerald-800/60",
      cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
      iconBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
      activeChip: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20",
    },
    {
      key: "cancelled" as FilterCategory,
      labelAr: "ملغى",
      labelEn: "Cancelled",
      icon: XCircle,
      match: (status: string) => status === "cancelled",
      cardBorder: "border-rose-200 dark:border-rose-800/60",
      cardBg: "bg-rose-50/50 dark:bg-rose-950/20",
      iconBg: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
      activeChip: "bg-rose-600 text-white shadow-sm shadow-rose-500/20",
    },
  ]

  const getCategoryCount = (cat: (typeof CATEGORIES)[number]) => {
    return requests.filter((r) => cat.match(r.status)).length
  }

  const filteredRequests = requests.filter((req) => {
    // 1. Status Filter
    const activeCatObj = CATEGORIES.find((c) => c.key === activeCategory)
    const matchesStatus = activeCatObj ? activeCatObj.match(req.status) : true

    // 2. Search Query Filter
    const query = searchQuery.toLowerCase().trim()
    if (!query) return matchesStatus

    const trackingMatch = [req.trackingNumber, req.legacyTrackingNumber, req.customerCode, ...(req.previousTrackingNumbers || [])].some(value => String(value || "").toLowerCase().includes(query))
    const companyMatch = (req.customerId?.companyName || "").toLowerCase().includes(query)
    const subjectMatch = (req.subject || "").toLowerCase().includes(query)
    const serviceTypeMatch = (req.serviceType || "").toLowerCase().includes(query)
    const multiServiceMatch = req.services?.some((s: any) =>
      typeof s === "object" && (s.serviceKey || "").toLowerCase().includes(query)
    )

    return matchesStatus && (trackingMatch || companyMatch || subjectMatch || serviceTypeMatch || multiServiceMatch)
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return {
          label: isAr ? "طلب جديد" : "Submitted",
          className: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
          icon: Clock,
        }
      case "document_under_review":
        return {
          label: isAr ? "المستند قيد المراجعة" : "Doc Under Review",
          className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
          icon: Clock,
        }
      case "document_required":
        return {
          label: isAr ? "مطلوب مستندات" : "Document Required",
          className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
          icon: AlertCircle,
        }
      case "quote_pending":
        return {
          label: isAr ? "جاري تجهيز السعر" : "Quote Pending",
          className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
          icon: DollarSign,
        }
      case "quote_provided":
        return {
          label: isAr ? "عرض السعر جاهز" : "Quote Ready",
          className: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
          icon: DollarSign,
        }
      case "quote_accepted":
        return {
          label: isAr ? "تم قبول العرض" : "Quote Accepted",
          className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
          icon: CheckCircle2,
        }
      case "processing":
        return {
          label: isAr ? "قيد التنفيذ (نشط)" : "In Processing",
          className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
          icon: PlayCircle,
        }
      case "completed":
        return {
          label: isAr ? "مكتمل" : "Completed",
          className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
          icon: CheckCircle2,
        }
      case "cancelled":
        return {
          label: isAr ? "ملغى" : "Cancelled",
          className: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
          icon: XCircle,
        }
      default:
        return {
          label: status?.replace(/_/g, " ") || "—",
          className: "bg-secondary-100 text-secondary-800 border-secondary-200 dark:bg-secondary-800 dark:text-secondary-300",
          icon: Clock,
        }
    }
  }

  const SERVICE_LABELS: Record<string, string> = {
    sea_freight: "شحن بحري",
    ocean_freight: "شحن بحري",
    air_freight: "شحن جوي",
    land_freight: "شحن بري",
    land_transport: "نقل بري",
    customs_clearance: "تخليص جمركي",
    warehousing: "تخزين",
    inland_transportation: "نقل داخلي",
    general_inquiry: "استفسار عام",
    storage: "تخزين",
    freight_booking: "حجز شحن",
  }

  return (
    <div className="flex flex-col pb-16">
      <AdminHeader
        title={t("admin.sidebar.requests") || (isAr ? "طلبات خدمات العملاء" : "Client Service Requests")}
        subtitle={
          isAr
            ? "إدارة ومتابعة طلبات الشحن والخدمات اللوجستية وتصنيفها حسب المرحلة التشغيلية"
            : "Manage, track, and filter incoming client requests by operational status"
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Top Header & Refresh */}
        <div className="flex flex-col gap-3 rounded-2xl border border-secondary-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-secondary-800 dark:bg-secondary-900">
          <div>
            <h2 className="text-base font-bold text-secondary-900 dark:text-white">
              {isAr ? "قائمة طلبات الخدمات" : "Master Requests Queue"}
            </h2>
            <p className="text-xs text-secondary-500">
              {isAr
                ? "اضغط على أي تصنيف أدناه لفرز وعرض الطلبات الخاصة بتلك المرحلة مباشرة"
                : "Click any category below to immediately filter requests by operational status"}
            </p>
          </div>
          <Button
            onClick={fetchRequests}
            variant="outline"
            className="rounded-xl font-semibold transition-colors"
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4 rtl:mr-0 rtl:ml-1.5", loading && "animate-spin")} />
            <span>{isAr ? "تحديث البيانات" : "Refresh Data"}</span>
          </Button>
        </div>

        {/* ─── Classification KPI Cards (Clickable) ─── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.filter((c) => c.key !== "cancelled").map((cat) => {
            const Icon = cat.icon
            const count = getCategoryCount(cat)
            const isActive = activeCategory === cat.key

            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "group relative flex flex-col justify-between rounded-2xl border p-4 text-start transition-all cursor-pointer",
                  isActive
                    ? "border-primary-500 bg-primary-50/80 shadow-md ring-2 ring-primary-500/20 dark:bg-primary-950/40 dark:border-primary-500"
                    : "border-secondary-200/80 bg-white hover:border-secondary-300 hover:shadow-xs dark:border-secondary-800 dark:bg-secondary-900 dark:hover:border-secondary-700"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                      isActive
                        ? "bg-primary-600 text-white"
                        : cat.iconBg || "bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-400"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-xs font-black",
                      isActive
                        ? "bg-primary-600 text-white"
                        : "bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-300"
                    )}
                  >
                    {count}
                  </span>
                </div>
                <div>
                  <span
                    className={cn(
                      "block text-xs font-bold leading-tight",
                      isActive
                        ? "text-primary-900 dark:text-primary-100"
                        : "text-secondary-700 dark:text-secondary-300"
                    )}
                  >
                    {isAr ? cat.labelAr : cat.labelEn}
                  </span>
                  <span className="block text-[10px] text-secondary-400 mt-0.5">
                    {count} {isAr ? "طلب" : "requests"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* ─── Search Bar & Filter Chips ─── */}
        <div className="flex flex-col gap-3 rounded-2xl border border-secondary-200/80 bg-white p-4 shadow-xs dark:border-secondary-800 dark:bg-secondary-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-secondary-400 rtl:left-auto rtl:right-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAr
                    ? "بحث برقم التتبع، اسم الشركة، نوع الخدمة، أو الموضوع..."
                    : "Search by tracking #, company, service, or subject..."
                }
                className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 py-2.5 pl-10 pr-4 text-xs font-medium text-secondary-900 shadow-inner transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pl-4 rtl:pr-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-200 rtl:right-auto rtl:left-3"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Filter Tabs / Chips */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {CATEGORIES.map((cat) => {
                const count = getCategoryCount(cat)
                const isActive = activeCategory === cat.key

                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategory(cat.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                      isActive
                        ? "bg-primary-600 text-white shadow-xs"
                        : "bg-secondary-100 text-secondary-600 hover:bg-secondary-200 dark:bg-secondary-800 dark:text-secondary-300 dark:hover:bg-secondary-700"
                    )}
                  >
                    <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.2 text-[10px] font-black",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-white dark:bg-secondary-900 text-secondary-700 dark:text-secondary-300"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active Filter Notice if filtered */}
          {(activeCategory !== "all" || searchQuery) && (
            <div className="flex items-center justify-between pt-2 border-t border-secondary-100 dark:border-secondary-800 text-xs text-secondary-500">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-primary-500" />
                <span>
                  {isAr ? "النتائج المعروضة:" : "Filtered results:"}{" "}
                  <strong className="text-secondary-900 dark:text-white">{filteredRequests.length}</strong>{" "}
                  {isAr ? "من إجمالي" : "of"} {requests.length} {isAr ? "طلب" : "requests"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("all")
                  setSearchQuery("")
                }}
                className="text-primary-600 hover:underline font-semibold cursor-pointer dark:text-primary-400"
              >
                {isAr ? "إعادة ضبط التصفية" : "Reset filter"}
              </button>
            </div>
          )}
        </div>

        {/* ─── Requests Master Table ─── */}
        <div className="overflow-hidden rounded-2xl border border-secondary-200/80 bg-white shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs rtl:text-right">
              <thead className="border-b border-secondary-100 bg-secondary-50/75 text-[11px] font-bold text-secondary-600 uppercase tracking-wider dark:border-secondary-800 dark:bg-secondary-800/50 dark:text-secondary-400">
                <tr>
                  <th className="px-5 py-3.5">{t("admin.requests.colCompany") || (isAr ? "العميل / الشركة" : "Client / Company")}</th>
                  <th className="px-4 py-3.5">{t("admin.requests.colTracking") || (isAr ? "رقم التتبع والموضوع" : "Tracking & Subject")}</th>
                  <th className="px-4 py-3.5">{t("admin.requests.colService") || (isAr ? "نوع الخدمة" : "Service Type")}</th>
                  <th className="px-4 py-3.5">{t("admin.requests.colStatus") || (isAr ? "الحالة التشغيلية" : "Status")}</th>
                  <th className="px-5 py-3.5 text-right rtl:text-left">{t("admin.requests.colActions") || (isAr ? "الإجراءات" : "Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-secondary-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-primary-500" />
                        <span>{t("admin.requests.loading") || (isAr ? "جاري تحميل الطلبات..." : "Loading requests...")}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-100 text-secondary-400 dark:bg-secondary-800 dark:text-secondary-500">
                        <Layers className="h-7 w-7" />
                      </div>
                      <p className="mt-3 text-sm font-bold text-secondary-900 dark:text-white">
                        {isAr ? "لا توجد طلبات تطابق هذا التصنيف" : "No requests found for this classification"}
                      </p>
                      <p className="text-xs text-secondary-500 mt-1">
                        {isAr
                          ? "حاول تغيير حالة التصنيف أو إفراغ خانة البحث لإظهار الطلبات."
                          : "Try changing the filter category or clearing the search query."}
                      </p>
                      {(activeCategory !== "all" || searchQuery) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveCategory("all")
                            setSearchQuery("")
                          }}
                          className="mt-3 rounded-xl"
                        >
                          {isAr ? "عرض كل الطلبات" : "Show All Requests"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const badge = getStatusBadge(req.status)
                    const BadgeIcon = badge.icon

                    return (
                      <tr key={req._id} className="group hover:bg-secondary-50/60 dark:hover:bg-secondary-800/40 transition-colors">
                        <td className="px-5 py-4">
                          <span className="block font-bold text-secondary-900 dark:text-white text-sm">
                            {req.customerId?.companyName || (isAr ? "غير محدد" : "Unknown")}
                          </span>
                          <span className="text-[11px] text-secondary-500">
                            {req.customerId?.contactEmail || ""}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="block font-mono font-bold text-primary-600 dark:text-primary-400 text-xs">
                              <bdi dir="ltr">{req.trackingNumber}</bdi>
                            </span>
                            <RequestQRCode requestId={req._id} trackingNumber={req.trackingNumber} />
                          </div>
                          <span className="block font-medium text-secondary-700 dark:text-secondary-300">
                            {req.subject}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          {(() => {
                            // ① Multi-service array
                            const populatedServices = req.services?.filter((s: any) => typeof s === "object" && s.serviceKey)
                            if (populatedServices?.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {populatedServices.map((s: any, i: number) => (
                                    <span key={i} className="inline-block rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
                                      {SERVICE_LABELS[s.serviceKey] || s.serviceKey.replace(/_/g, " ")}
                                    </span>
                                  ))}
                                </div>
                              )
                            }

                            // ② Single serviceType
                            if (req.serviceType) {
                              return (
                                <span className="inline-block rounded-md bg-secondary-100 px-2 py-0.5 text-[10px] font-bold text-secondary-700 dark:bg-secondary-800 dark:text-secondary-300">
                                  {SERVICE_LABELS[req.serviceType] || req.serviceType.replace(/_/g, " ")}
                                </span>
                              )
                            }

                            return (
                              <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                                {isAr ? "متعدد الخدمات" : "Multi-Service"}
                              </span>
                            )
                          })()}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
                              badge.className
                            )}
                          >
                            <BadgeIcon className="h-3.5 w-3.5" />
                            <span>{badge.label}</span>
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right rtl:text-left">
                          <Link href={`/admin/requests/${req._id}`}>
                            <Button
                              size="sm"
                              className="rounded-xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 cursor-pointer"
                            >
                              <Edit className="mr-1.5 h-3.5 w-3.5 rtl:mr-0 rtl:ml-1.5" />
                              <span>{t("admin.requests.viewDetails") || (isAr ? "عرض التفاصيل" : "View Details")}</span>
                            </Button>
                          </Link>
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

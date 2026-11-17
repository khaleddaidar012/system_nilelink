"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { UCRSection } from "@/components/portal/requests/UCRSection"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { ArrowLeft, Clock, FileText, RefreshCw, DollarSign, Eye, CheckCircle, XCircle, X, Receipt, Calendar, Tag, ShieldCheck, Edit3 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { Link } from "@/navigation"
import { toast } from "sonner"
import { RequestQRCode } from "@/components/admin/requests/RequestQRCode"
import { RequestInvoices } from "@/components/admin/shipments/RequestInvoices"
import { RequestWorkflowSettings } from "@/components/admin/requests/RequestWorkflowSettings"
import { StageManager } from "@/components/admin/requests/StageManager"
import { ServiceProgressEditor } from "@/components/admin/requests/ServiceProgressEditor"

export default function AdminRequestDetailPage() {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"
  const params = useParams()
  const id = params.id as string

  const [request, setRequest] = useState<any>(null)
  const [suggestedPrices, setSuggestedPrices] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmingOrder, setConfirmingOrder] = useState(false)
  const [quote, setQuote] = useState<any>(null)
  const [quoteItems, setQuoteItems] = useState<any[]>([])
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)

  // Inline document review modal
  const [reviewDoc, setReviewDoc] = useState<any>(null)
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null)
  const [reviewExpiryDate, setReviewExpiryDate] = useState("")
  const [reviewRejectionReason, setReviewRejectionReason] = useState("")
  const [reviewTitle, setReviewTitle] = useState("")
  const [reviewCategory, setReviewCategory] = useState("")
  const [submittingReview, setSubmittingReview] = useState(false)

  const priorityLabels: Record<string, { ar: string; en: string }> = {
    urgent: { ar: "عاجل", en: "Urgent" },
    high: { ar: "مرتفع", en: "High" },
    medium: { ar: "متوسط", en: "Medium" },
    low: { ar: "منخفض", en: "Low" },
  }

  const statusLabels: Record<string, { ar: string; en: string }> = {
    submitted: { ar: "قيد المراجعة", en: "Submitted" },
    document_required: { ar: "إجراء مطلوب", en: "Document Required" },
    document_under_review: { ar: "المستند قيد المراجعة", en: "Document Under Review" },
    quote_pending: { ar: "جاري تجهيز عرض السعر", en: "Quote Pending" },
    quote_provided: { ar: "عرض السعر جاهز", en: "Quote Provided" },
    quote_accepted: { ar: "تم قبول العرض", en: "Quote Accepted" },
    quote_rejected: { ar: "تم رفض العرض", en: "Quote Rejected" },
    processing: { ar: "قيد التنفيذ", en: "Processing" },
    completed: { ar: "مكتمل", en: "Completed" },
    cancelled: { ar: "ملغى", en: "Cancelled" },
    pending: { ar: "قيد الانتظار", en: "Pending" },
  }

  const docCategoryLabels: Record<string, { ar: string; en: string }> = {
    commercial_register: { ar: "السجل التجاري", en: "Commercial Register" },
    tax_card: { ar: "البطاقة الضريبية", en: "Tax Card" },
    import_card: { ar: "بطاقة استيرادية", en: "Import Card" },
    export_card: { ar: "بطاقة تصديرية", en: "Export Card" },
    license: { ar: "رخصة الاستيراد والتصدير", en: "Trade License" },
    customs_certificate: { ar: "شهادة الجمارك", en: "Customs Certificate" },
    contract: { ar: "العقود والاتفاقيات", en: "Contract" },
    other: { ar: "مستند آخر", en: "Other" },
  }

  const docStatusLabels: Record<string, { ar: string; en: string }> = {
    pending_review: { ar: "قيد المراجعة", en: "Pending Review" },
    approved: { ar: "معتمد", en: "Approved" },
    rejected: { ar: "مرفوض", en: "Rejected" },
    expiring_soon: { ar: "ينتهي قريباً", en: "Expiring Soon" },
    expired: { ar: "منتهي", en: "Expired" },
  }

  const serviceLabels: Record<string, { ar: string; en: string }> = {
    sea_freight: { ar: "شحن بحري", en: "Sea Freight" },
    ocean_freight: { ar: "شحن بحري", en: "Ocean Freight" },
    air_freight: { ar: "شحن جوي", en: "Air Freight" },
    land_freight: { ar: "شحن بري", en: "Land Freight" },
    land_transport: { ar: "نقل بري", en: "Land Transport" },
    customs_clearance: { ar: "تخليص جمركي", en: "Customs Clearance" },
    warehousing: { ar: "تخزين", en: "Warehousing" },
    inland_transportation: { ar: "نقل داخلي", en: "Inland Transportation" },
    general_inquiry: { ar: "استفسار عام", en: "General Inquiry" },
    storage: { ar: "تخزين", en: "Storage" },
    freight_booking: { ar: "حجز شحن", en: "Freight Booking" },
  }

  const fetchRequestAndPrices = async () => {
    setLoading(true)
    try {
      // 1. Fetch Request
      const res = await fetch(`/api/admin/requests/${id}`)
      const data = await res.json()
      if (data.request) {
        setRequest(data.request)
      }
      if (data.quote) {
        setQuote(data.quote)
      } else {
        setQuote(null)
      }
      if (data.quoteItems) {
        setQuoteItems(data.quoteItems)
      } else {
        setQuoteItems([])
      }

      // 2. Fetch Suggested Prices from PricingEngine
      const priceRes = data.request?.quoteRequired === false ? null : await fetch(`/api/admin/requests/${id}/price`)
      const priceData = priceRes ? await priceRes.json() : { success: false }
      if (!priceRes) setSuggestedPrices([])
      if (priceData.success) {
        setSuggestedPrices(priceData.data)
      }

      // 3. Fetch Documents
      const docsRes = await fetch(`/api/admin/requests/${id}/documents`)
      const docsData = await docsRes.json()
      if (docsData.success) {
        setDocuments(docsData.documents)
      }
    } catch {
      toast.error(isAr ? "فشل تحميل تفاصيل الطلب أو الأسعار." : "Failed to fetch request details or prices.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchRequestAndPrices()
  }, [id])

  const handleConfirmOrder = async () => {
    setConfirmingOrder(true)
    try {
      const res = await fetch(`/api/admin/requests/${id}/confirm-order`, {
        method: "POST",
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to confirm order")
      }
      toast.success(isAr ? "تم تأكيد الطلب وبدء المعالجة بنجاح" : "Order confirmed and processing started")
      fetchRequestAndPrices()
    } catch (err: any) {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء التأكيد" : "An error occurred"))
    } finally {
      setConfirmingOrder(false)
    }
  }

  const openReview = (doc: any) => {
    setReviewDoc(doc)
    setReviewAction(null)
    setReviewExpiryDate("")
    setReviewRejectionReason("")
    setReviewTitle(doc.title || doc.fileName || "")
    setReviewCategory(doc.category || "")
  }

  const closeReview = () => {
    setReviewDoc(null)
    setReviewAction(null)
    setReviewExpiryDate("")
    setReviewRejectionReason("")
    setReviewTitle("")
    setReviewCategory("")
  }

  const handleSubmitReview = async () => {
    if (!reviewDoc || !reviewAction) return
    if (reviewAction === "approve" && !reviewExpiryDate) {
      toast.error(isAr ? "يرجى إدخال تاريخ انتهاء الصلاحية" : "Please enter an expiry date")
      return
    }
    if (reviewAction === "reject" && !reviewRejectionReason.trim()) {
      toast.error(isAr ? "يرجى إدخال سبب الرفض" : "Please enter a rejection reason")
      return
    }
    setSubmittingReview(true)
    try {
      const body: Record<string, any> = {
        status: reviewAction === "approve" ? "approved" : "rejected",
        title: reviewTitle.trim() || reviewDoc.title || reviewDoc.fileName,
        category: reviewCategory || reviewDoc.category,
      }
      if (reviewAction === "approve") body.expiryDate = reviewExpiryDate
      if (reviewAction === "reject") body.rejectionReason = reviewRejectionReason

      const res = await fetch(`/api/admin/documents/${reviewDoc.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Verification failed")
      }
      toast.success(
        reviewAction === "approve"
          ? (isAr ? "تمت الموافقة على المستند بنجاح" : "Document approved successfully")
          : (isAr ? "تم رفض المستند" : "Document rejected")
      )
      closeReview()
      fetchRequestAndPrices()
    } catch (err: any) {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء المراجعة" : "Review failed"))
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] items-center justify-center text-secondary-500">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-500 mb-4" />
        <p>{t("admin.requests.detail.loading") || (isAr ? "جاري التحميل..." : "Loading...")}</p>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-rose-600">
          {t("admin.requests.detail.notFound") || (isAr ? "لم يتم العثور على الطلب" : "Request not found")}
        </h2>
        <Link href="/admin/requests" className="mt-4 inline-block text-primary-600 hover:underline">
          {t("admin.requests.detail.returnToQueue") || (isAr ? "الرجوع لقائمة الطلبات" : "Return to Queue")}
        </Link>
      </div>
    )
  }

  return (
    <>
    <div className="flex flex-col pb-12">
      <AdminHeader
        title={`${isAr ? "الطلب" : "Request"}: ${request.trackingNumber}`}
        subtitle={request.subject}
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Actions & Meta */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Link href="/admin/requests">
              <Button variant="outline" className="rounded-xl text-xs">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5 rtl:mr-0 rtl:ml-1.5 rtl:rotate-180" />
                {t("admin.requests.detail.backToQueue") || (isAr ? "رجوع للقائمة" : "Back to Queue")}
              </Button>
            </Link>
            <Button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="rounded-xl text-xs bg-primary-600 hover:bg-primary-500 font-bold text-white shadow-xs cursor-pointer"
            >
              <Receipt className="mr-1.5 h-3.5 w-3.5 rtl:mr-0 rtl:ml-1.5" />
              {isAr ? "ربط / إنشاء فاتورة" : "Link / create invoice"}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-bold uppercase",
                request.priority === "urgent"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                  : request.priority === "high"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-300"
              )}
            >
              {priorityLabels[request.priority]?.[isAr ? "ar" : "en"] || request.priority}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-500/20 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
              <Clock className="h-3.5 w-3.5" />
              <span>{statusLabels[request.status]?.[isAr ? "ar" : "en"] || request.status?.replace(/_/g, " ")}</span>
            </span>
            <div className="bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-800 rounded-lg p-0.5 shadow-sm">
              <RequestQRCode requestId={request._id} trackingNumber={request.trackingNumber} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
              <h3 className="text-sm font-bold text-secondary-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-500" />
                {isAr ? "معلومات البضاعة" : "Cargo Information"}
              </h3>
              {(() => {
                // Key translation map
                const keyLabels: Record<string, { ar: string; en: string }> = {
                  commodity:        { ar: "البضاعة / السلعة", en: "Commodity" },
                  "gross weight":   { ar: "الوزن الإجمالي", en: "Gross Weight" },
                  weight:           { ar: "الوزن", en: "Weight" },
                  volume:           { ar: "الحجم", en: "Volume" },
                  cargo:            { ar: "نوع الشحنة", en: "Cargo Type" },
                  acid:             { ar: "رقم ACID", en: "ACID Number" },
                  duration:         { ar: "مدة التخزين", en: "Storage Duration" },
                }
                // Parse "Key: Value, Key2: Value2" format
                const pairs: { label: string; value: string }[] = []
                if (request.description) {
                  const parts = request.description.split(/,(?=[^,]*:)/)
                  parts.forEach((part: string) => {
                    const colonIdx = part.indexOf(":")
                    if (colonIdx === -1) return
                    const rawKey = part.slice(0, colonIdx).trim().toLowerCase()
                    const val = part.slice(colonIdx + 1).trim()
                    const label = keyLabels[rawKey]
                      ? (isAr ? keyLabels[rawKey].ar : keyLabels[rawKey].en)
                      : part.slice(0, colonIdx).trim()
                    pairs.push({ label, value: val })
                  })
                }
                if (pairs.length === 0) {
                  return <p className="text-sm text-secondary-600 dark:text-secondary-400">{request.description || "—"}</p>
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pairs.map((p, i) => (
                      <div key={i} className="rounded-xl bg-secondary-50 dark:bg-secondary-800/50 px-4 py-3">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-secondary-400 mb-1">
                          {p.label}
                        </span>
                        <span className="text-sm font-semibold text-secondary-900 dark:text-white">
                          {p.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Nested Services and Pricing Engine */}
            <StageManager requestId={request._id} onUpdated={fetchRequestAndPrices} />
            <ServiceProgressEditor requestId={request._id} updatedAt={request.updatedAt} onUpdated={fetchRequestAndPrices} />
            <h3 className="text-lg font-bold text-secondary-900 dark:text-white mt-8 mb-4">
              {t("admin.requests.detail.servicesTitle") || (isAr ? "الخدمات المطلوبة ومحرك التسعير" : "Requested Services & Pricing Engine")}
            </h3>
            
            {request.services?.map((service: any) => {
              const priceMatch = suggestedPrices.find((p) => p.serviceId === service._id)

              return (
                <div
                  key={service._id}
                  className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900 mb-4"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-bold capitalize text-lg text-primary-700 dark:text-primary-400">
                      {service.serviceKey
                        ? (t(`portal.requests.new.${service.serviceKey}`) !== `portal.requests.new.${service.serviceKey}`
                            ? t(`portal.requests.new.${service.serviceKey}`)
                            : service.serviceKey.replace(/_/g, " "))
                        : t("admin.requests.detail.serviceLabel") || (isAr ? "الخدمة" : "Service")}
                    </h4>
                    <span className="text-xs font-semibold px-2 py-1 bg-secondary-100 dark:bg-secondary-800 dark:text-secondary-300 rounded-lg uppercase">
                      {statusLabels[service.status]?.[isAr ? "ar" : "en"] || service.status || "—"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-secondary-50 p-4 rounded-xl dark:bg-secondary-800/50 mb-4">
                    {service.details?.origin && (
                      <div>
                        <span className="block text-[10px] font-bold text-secondary-500 uppercase tracking-wider mb-1">
                          {t("admin.requests.detail.origin") || (isAr ? "نقطة الانطلاق" : "Origin")}
                        </span>
                        <span className="font-semibold text-secondary-900 dark:text-white">
                          {service.details.origin}
                        </span>
                      </div>
                    )}
                    {service.details?.destination && (
                      <div>
                        <span className="block text-[10px] font-bold text-secondary-500 uppercase tracking-wider mb-1">
                          {t("admin.requests.detail.destination") || (isAr ? "وجهة الوصول" : "Destination")}
                        </span>
                        <span className="font-semibold text-secondary-900 dark:text-white">
                          {service.details.destination}
                        </span>
                      </div>
                    )}
                    {service.details?.weight && (
                      <div>
                        <span className="block text-[10px] font-bold text-secondary-500 uppercase tracking-wider mb-1">
                          {t("admin.requests.detail.weight") || (isAr ? "الوزن" : "Weight")}
                        </span>
                        <span className="font-semibold text-secondary-900 dark:text-white">
                          {service.details.weight} kg
                        </span>
                      </div>
                    )}
                  {service.details?.containerType && <div><span className="font-semibold">{t("portal.requests.details.container_type")}:</span> {t.has(`portal.requests.details.container_types.${service.details.containerType}`) ? t(`portal.requests.details.container_types.${service.details.containerType}`) : service.details.containerType}</div>}
                  {service.details?.containerSize && <div><span className="font-semibold">{t("portal.requests.details.container_size")}:</span> {t.has(`portal.requests.details.container_sizes.${service.details.containerSize}`) ? t(`portal.requests.details.container_sizes.${service.details.containerSize}`) : service.details.containerSize}</div>}
                    {service.details?.volume && (
                      <div>
                        <span className="block text-[10px] font-bold text-secondary-500 uppercase tracking-wider mb-1">
                          {t("admin.requests.detail.volume") || (isAr ? "الحجم" : "Volume")}
                        </span>
                        <span className="font-semibold text-secondary-900 dark:text-white">
                          {service.details.volume} CBM
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pricing Engine Suggestion */}
                  {request.quoteRequired !== false && <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <h5 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                        <DollarSign size={16} /> {t("admin.requests.detail.suggestedPrice") || (isAr ? "السعر المقترح" : "Suggested Price")}
                      </h5>
                      <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1 capitalize">
                        {t("admin.requests.detail.matchedRule") || (isAr ? "قاعدة التسعير:" : "Pricing Rule:")}{" "}
                        {priceMatch?.pricingType === "manual"
                          ? (isAr ? "يدوي" : "Manual")
                          : priceMatch?.pricingType === "automated"
                          ? (isAr ? "تلقائي" : "Automated")
                          : priceMatch?.pricingType?.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="text-end">
                      {priceMatch && priceMatch.suggestedPrice !== null ? (
                        <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                          {priceMatch.suggestedPrice} {priceMatch.currency}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-amber-600">
                          {t("admin.requests.detail.manualPricing") || (isAr ? "يتطلب تسعيراً يدوياً" : "Requires Manual Pricing")}
                        </span>
                      )}
                    </div>
                  </div>}
                </div>
              )
            })}

            {/* Issued Official Quotation Card */}
            {quote && (
              <div className="mt-8 rounded-2xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-indigo-950/20 dark:via-secondary-900 dark:to-secondary-900 p-6 shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary-200/80 dark:border-secondary-800 pb-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-secondary-900 dark:text-white">
                          {isAr ? "عرض السعر الصادر للعميل" : "Official Quotation to Client"}
                        </h3>
                        <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                          {quote.quoteNumber}
                        </span>
                      </div>
                      <p className="text-xs text-secondary-500 mt-0.5">
                        {isAr ? "تم إرسال هذا العرض للعميل رسمياً وهو حالياً مسجل بالنظام" : "This quote was officially sent to the client"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-3 py-1 rounded-xl text-xs font-bold uppercase",
                      ["accepted","partially_accepted"].includes(quote.status) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                      quote.status === "rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" :
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    )}>
                      {["accepted","partially_accepted"].includes(quote.status) ? (isAr ? "تمت الموافقة" : "Accepted") :
                       quote.status === "rejected" ? (isAr ? "مرفوض" : "Rejected") :
                       (isAr ? "في انتظار موافقة العميل" : "Pending Acceptance")}
                    </span>

                    {request.quoteRequired !== false && <Link href={`/admin/requests/${id}/quote`}>
                      <Button size="sm" variant="outline" className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
                        <Edit3 className="h-3.5 w-3.5 mr-1 rtl:mr-0 rtl:ml-1" />
                        {isAr ? "تعديل / تحديث العرض" : "Edit / Update Quote"}
                      </Button>
                    </Link>}
                  </div>
                </div>

                {/* Quote metadata grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-secondary-50/80 dark:bg-secondary-800/40 p-4 rounded-xl mb-5 text-xs">
                  <div>
                    <span className="block text-secondary-500 mb-0.5">{isAr ? "تاريخ الإصدار" : "Issued Date"}</span>
                    <span className="font-semibold text-secondary-900 dark:text-white">
                      {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-secondary-500 mb-0.5">{isAr ? "صالح حتى" : "Valid Until"}</span>
                    <span className="font-semibold text-secondary-900 dark:text-white">
                      {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-secondary-500 mb-0.5">{isAr ? "العملة" : "Currency"}</span>
                    <span className="font-semibold text-secondary-900 dark:text-white">{quote.currency || "EGP"}</span>
                  </div>
                  <div>
                    <span className="block text-secondary-500 mb-0.5">{isAr ? "إجمالي العرض" : "Total Amount"}</span>
                    <span className="font-black text-sm text-primary-600 dark:text-primary-400">
                      {quote.totalAmount?.toLocaleString()} {quote.currency || "EGP"}
                    </span>
                  </div>
                </div>

                {/* Quoted line items & legs */}
                {quoteItems && quoteItems.length > 0 && (
                  <div className="space-y-3 mb-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-secondary-500">
                      {isAr ? "بنود وتفاصيل التسعير" : "Quoted Line Items & Breakdown"}
                    </h4>
                    {quoteItems.map((item: any, idx: number) => (
                      <div key={idx} className="rounded-xl border border-secondary-200/80 bg-white p-4 dark:border-secondary-800 dark:bg-secondary-900">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-sm text-secondary-900 dark:text-white capitalize">
                            {serviceLabels[item.serviceKey]?.[isAr ? "ar" : "en"] || item.serviceKey?.replace(/_/g, " ")}
                          </span>
                          <span className="font-black text-base text-secondary-900 dark:text-white">
                            {item.finalPrice?.toLocaleString()} {item.currency || quote.currency}
                          </span>
                        </div>

                        {item.breakdown && item.breakdown.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-secondary-100 dark:border-secondary-800">
                            {item.breakdown.map((b: any, bIdx: number) => (
                              <div key={bIdx} className="flex items-center justify-between text-xs text-secondary-600 dark:text-secondary-400">
                                <span>• {b.description || (isAr ? `المرحلة ${bIdx + 1}` : `Leg ${bIdx + 1}`)}</span>
                                <span className="font-medium">{Number(b.basePrice || 0) + Number(b.additionalCharges || 0)} {item.currency || quote.currency}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.note && (
                          <p className="text-xs text-secondary-500 mt-2 bg-secondary-50 dark:bg-secondary-800/60 p-2 rounded-lg">
                            {item.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {quote.notes && (
                  <div className="text-xs text-secondary-600 dark:text-secondary-400 bg-secondary-50 dark:bg-secondary-800/50 p-3 rounded-xl">
                    <span className="font-bold block mb-1">{isAr ? "ملاحظات إضافية:" : "Additional Notes:"}</span>
                    {quote.notes}
                  </div>
                )}
              </div>
            )}

            {/* Attached Documents */}
            <h3 className="text-lg font-bold text-secondary-900 dark:text-white mt-8 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-500" />
              <span>{isAr ? "المستندات المرفقة" : "Attached Documents"}</span>
            </h3>
            <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
              {documents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-start">
                    <thead>
                      <tr className="border-b border-secondary-200 dark:border-secondary-800">
                        <th className="pb-3 text-start font-semibold text-secondary-500 uppercase tracking-wider">
                          {isAr ? "عنوان المستند" : "Document Title"}
                        </th>
                        <th className="pb-3 text-start font-semibold text-secondary-500 uppercase tracking-wider">
                          {isAr ? "التصنيف" : "Category"}
                        </th>
                        <th className="pb-3 text-start font-semibold text-secondary-500 uppercase tracking-wider">
                          {isAr ? "الحالة" : "Status"}
                        </th>
                        <th className="pb-3 text-end font-semibold text-secondary-500 uppercase tracking-wider">
                          {isAr ? "الإجراء" : "Action"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                      {documents.map((doc: any) => (
                        <tr key={doc.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                          <td className="py-4 font-medium">{doc.title || doc.fileName}</td>
                          <td className="py-4">
                            {docCategoryLabels[doc.category]?.[isAr ? "ar" : "en"] || doc.category?.replace(/_/g, " ")}
                          </td>
                          <td className="py-4">
                            <span className={cn(
                              "px-2.5 py-1 text-xs font-semibold rounded-full",
                              doc.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" :
                              doc.status === "rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" :
                              "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            )}>
                              {docStatusLabels[doc.status]?.[isAr ? "ar" : "en"] || doc.status?.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="py-4 text-end">
                            <div className="flex items-center justify-end gap-2">
                              {doc.status === "pending_review" ? (
                                <Button size="sm" variant="outline" onClick={() => openReview(doc)} className="gap-1 border-primary-300 text-primary-700 hover:bg-primary-100 hover:text-primary-800 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/40 dark:hover:text-primary-100 cursor-pointer">
                                  <FileText className="h-3.5 w-3.5" />
                                  {isAr ? "مراجعة" : "Review"}
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => window.open(doc.fileUrl)} className="gap-1">
                                  <Eye className="h-3.5 w-3.5" />
                                  {isAr ? "عرض" : "View"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-secondary-500">
                  <p>{isAr ? "لا توجد مستندات مرفقة بهذا الطلب." : "No documents attached to this request."}</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Customs Compliance Input */}
            <UCRSection requestId={String(id)} admin onUpdated={fetchRequestAndPrices} />
            {quote?.status==="partially_accepted" && <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{isAr ? "الخدمات المقبولة: " : "Accepted services: "}{quote.acceptedServices?.join(" + ")} · {isAr ? "القيمة المقبولة: " : "Accepted value: "}{quote.acceptedAmount} {quote.currency}</p>}

            {/* Client Info */}
            <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
              <h3 className="text-xs font-bold text-secondary-500 uppercase tracking-wider mb-4">
                {t("admin.requests.detail.clientInfo") || (isAr ? "معلومات العميل" : "Client Information")}
              </h3>
              <div className="space-y-3">
                <div>
                  <span className="block text-[10px] text-secondary-400">{t("admin.requests.detail.companyName") || (isAr ? "اسم الشركة" : "Company Name")}</span>
                  <span className="font-semibold text-sm text-secondary-900 dark:text-white">
                    {request.customerId?.companyName || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-secondary-400">{t("admin.requests.detail.email") || (isAr ? "البريد الإلكتروني" : "Email")}</span>
                  <a
                    href={request.customerId?.contactEmail ? `mailto:${request.customerId?.contactEmail}` : "#"}
                    className="font-medium text-sm text-primary-600 hover:underline"
                  >
                    {request.customerId?.contactEmail || "N/A"}
                  </a>
                </div>
              </div>
            </div>

            {/* Action Block based on Status */}
            <RequestWorkflowSettings request={request} onUpdated={fetchRequestAndPrices} />
            {request.quoteRequired === false ? (
              <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <h3 className="font-bold">{isAr ? "تنفيذ مباشر دون عرض سعر" : "Direct processing without a quotation"}</h3>
                <p className="text-xs">{isAr ? "سجّل رقم UCR أو ACID المناسب للعملية عند الحاجة، ثم ابدأ تنفيذ الخدمات. الفاتورة تظل مسودة حتى نشرها." : "Record the applicable UCR or ACID when needed, then begin service processing. The invoice remains a draft until published."}</p>
                {!["processing", "completed", "cancelled"].includes(request.status) && <Button disabled={!request.canOperate || confirmingOrder || Boolean(request.services?.some((service:any)=>service.serviceKey==="customs_clearance"&&service.status!=="cancelled") && !request.complianceNumber)} onClick={handleConfirmOrder}>{isAr ? "بدء التنفيذ دون عرض سعر" : "Begin processing without quotation"}</Button>}
                {request.services?.some((service:any)=>service.serviceKey==="customs_clearance"&&service.status!=="cancelled") && !request.complianceNumber && <p className="text-xs">{isAr ? "أدخل المرجع الجمركي لخدمة التخليص أولًا." : "Provide the customs clearance reference first."}</p>}
              </section>
            ) : request.status === "quote_accepted" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-900/10 text-center">
                <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 mb-2">
                  {t("admin.requests.detail.orderReadyTitle") || (isAr ? "الطلب جاهز للتنفيذ" : "Order Ready to Process")}
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-4">
                  {t("admin.requests.detail.orderReadyDesc") || (isAr ? "لقد وافق العميل على عرض السعر. قم بتأكيد الطلب لبدء عمليات التشغيل واللوجستيات." : "Client accepted the quote. Confirm the order to begin operational processing.")}
                </p>
                <Button 
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleConfirmOrder}
                  disabled={confirmingOrder}
                >
                  {confirmingOrder
                    ? (t("admin.requests.detail.confirmingBtn") || (isAr ? "جاري التأكيد..." : "Confirming..."))
                    : (t("admin.requests.detail.confirmOrderBtn") || (isAr ? "تأكيد الطلب وبدء التنفيذ" : "Confirm Order & Begin Processing"))}
                </Button>
              </div>
            ) : request.status === "processing" ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm dark:border-blue-900/50 dark:bg-blue-900/10 text-center">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-2">
                  {t("admin.requests.detail.orderProcessingTitle") || (isAr ? "الطلب قيد التنفيذ" : "Order in Processing")}
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {t("admin.requests.detail.orderProcessingDesc") || (isAr ? "هذا الطلب نشط حالياً وقيد التنفيذ من قبل فريق العمليات." : "This request is actively being processed by operations.")}
                </p>
              </div>
            ) : request.status === "quote_provided" ? (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm dark:border-indigo-900/50 dark:bg-indigo-900/10 text-center">
                <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-2">
                  {t("admin.requests.detail.quoteProvidedTitle") || (isAr ? "عرض السعر مُقدَّم" : "Quote Provided")}
                </h3>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-3">
                  {t("admin.requests.detail.quoteProvidedDesc") || (isAr ? "تم إرسال عرض السعر للعميل وهو حالياً في انتظار الموافقة." : "Quote has been sent to client and is waiting for acceptance.")}
                </p>

                {quote && (
                  <div className="bg-white/90 dark:bg-secondary-900/90 border border-indigo-100 dark:border-indigo-800/60 rounded-xl p-3 mb-4 text-start shadow-xs">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="text-secondary-500">{isAr ? "رقم العرض:" : "Quote No:"}</span>
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">{quote.quoteNumber}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="text-secondary-500">{isAr ? "إجمالي العرض:" : "Total Amount:"}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">{quote.totalAmount?.toLocaleString()} {quote.currency}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-secondary-500">{isAr ? "الحالة:" : "Status:"}</span>
                      <span className="font-semibold text-secondary-800 dark:text-secondary-200">
                        {["accepted","partially_accepted"].includes(quote.status) ? (isAr ? "تمت الموافقة" : "Accepted") :
                         quote.status === "rejected" ? (isAr ? "مرفوض" : "Rejected") :
                         (isAr ? "في انتظار الموافقة" : "Pending Acceptance")}
                      </span>
                    </div>
                  </div>
                )}

                <Link href={`/admin/requests/${id}/quote`}>
                  <Button variant="outline" className="w-full text-indigo-700 border-indigo-300 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30">
                    {t("admin.requests.detail.viewUpdateQuote") || (isAr ? "عرض / تحديث عرض السعر" : "View / Update Quote")}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary-200 bg-primary-50 p-6 shadow-sm dark:border-primary-900/50 dark:bg-primary-900/10 text-center">
                <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100 mb-2">
                  {t("admin.requests.detail.readyToQuote") || (isAr ? "جاهز لإرسال عرض السعر؟" : "Ready to Quote?")}
                </h3>
                <p className="text-xs text-primary-700 dark:text-primary-300 mb-4">
                  {t("admin.requests.detail.readyToQuoteDesc") || (isAr ? "يمكنك مراجعة الأسعار المقترحة وإنشاء عرض سعر رسمي في الخطوة التالية." : "Review the suggested rates and proceed to generate the official quotation.")}
                </p>
                <Link href={`/admin/requests/${id}/quote`}><Button className="w-full">{isAr ? "إنشاء عرض سعر" : "Generate quote"}</Button></Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Inline Document Review Modal */}
      {reviewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeReview() }}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl border border-secondary-200 dark:border-secondary-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 dark:border-secondary-800">
              <div>
                <h3 className="font-bold text-secondary-900 dark:text-white">
                  {isAr ? "مراجعة المستند" : "Document Review"}
                </h3>
                <p className="text-xs text-secondary-500 mt-0.5">{reviewDoc.title || reviewDoc.fileName}</p>
              </div>
              <button onClick={closeReview} className="rounded-lg p-1.5 hover:bg-secondary-100 dark:hover:bg-secondary-800 text-secondary-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Doc Preview */}
            {reviewDoc.fileUrl && (() => {
              const inlineUrl = `${reviewDoc.fileUrl}?view=inline`
              const isImage = reviewDoc.mimeType?.startsWith("image/")
              return (
                <div className="mx-6 rounded-xl overflow-hidden border border-secondary-200 dark:border-secondary-700 bg-secondary-950/5 dark:bg-secondary-800">
                  {isImage ? (
                    <img
                      src={inlineUrl}
                      alt={reviewDoc.title || reviewDoc.fileName}
                      className="w-full max-h-64 object-contain"
                    />
                  ) : (
                    <iframe
                      src={inlineUrl}
                      title={reviewDoc.fileName}
                      className="w-full h-64"
                      style={{ border: "none" }}
                    />
                  )}
                  <div className="flex justify-end px-3 py-2 border-t border-secondary-200 dark:border-secondary-700">
                    <button
                      onClick={() => window.open(inlineUrl, "_blank")}
                      className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                    >
                      <Eye className="h-3 w-3" />
                      {isAr ? "فتح في نافذة جديدة" : "Open in new tab"}
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Doc Info — Editable */}
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary-400 mb-1">
                    {isAr ? "عنوان المستند" : "Document Title"}
                  </label>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800 px-3 py-2.5 text-sm font-medium text-secondary-900 dark:text-white focus:border-primary-500 focus:outline-none"
                    placeholder={isAr ? "عنوان المستند" : "Document title"}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary-400 mb-1">
                    {isAr ? "التصنيف" : "Category"}
                  </label>
                  <select
                    value={reviewCategory}
                    onChange={(e) => setReviewCategory(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800 px-3 py-2.5 text-sm font-medium text-secondary-900 dark:text-white focus:border-primary-500 focus:outline-none"
                  >
                    {Object.entries(docCategoryLabels).map(([key, labels]) => (
                      <option key={key} value={key}>{labels[isAr ? "ar" : "en"]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Selector */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setReviewAction("approve")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold transition-all",
                    reviewAction === "approve"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-secondary-200 dark:border-secondary-700 text-secondary-600 hover:border-emerald-400 hover:bg-emerald-50/50"
                  )}
                >
                  <CheckCircle className="h-4 w-4" />
                  {isAr ? "موافقة" : "Approve"}
                </button>
                <button
                  onClick={() => setReviewAction("reject")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold transition-all",
                    reviewAction === "reject"
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-secondary-200 dark:border-secondary-700 text-secondary-600 hover:border-rose-400 hover:bg-rose-50/50"
                  )}
                >
                  <XCircle className="h-4 w-4" />
                  {isAr ? "رفض" : "Reject"}
                </button>
              </div>

              {/* Conditional fields */}
              {reviewAction === "approve" && (
                <div>
                  <label className="block text-xs font-bold text-secondary-700 dark:text-secondary-300 mb-1 uppercase tracking-wider">
                    {isAr ? "تاريخ انتهاء الصلاحية *" : "Expiry Date *"}
                  </label>
                  <input
                    type="date"
                    value={reviewExpiryDate}
                    onChange={(e) => setReviewExpiryDate(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800 px-3 py-2.5 text-sm font-medium text-secondary-900 dark:text-white focus:border-primary-500 focus:outline-none"
                  />
                </div>
              )}
              {reviewAction === "reject" && (
                <div>
                  <label className="block text-xs font-bold text-secondary-700 dark:text-secondary-300 mb-1 uppercase tracking-wider">
                    {isAr ? "سبب الرفض *" : "Rejection Reason *"}
                  </label>
                  <textarea
                    rows={3}
                    value={reviewRejectionReason}
                    onChange={(e) => setReviewRejectionReason(e.target.value)}
                    placeholder={isAr ? "أدخل سبب الرفض..." : "Enter rejection reason..."}
                    className="w-full rounded-xl border border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800 px-3 py-2.5 text-sm font-medium text-secondary-900 dark:text-white focus:border-primary-500 focus:outline-none resize-none"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 pb-5">
              <Button variant="ghost" onClick={closeReview} className="flex-1" disabled={submittingReview}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={handleSubmitReview}
                disabled={!reviewAction || submittingReview}
                className={cn(
                  "flex-1 text-white",
                  reviewAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700" :
                  reviewAction === "reject" ? "bg-rose-600 hover:bg-rose-700" :
                  "bg-primary-600 hover:bg-primary-700"
                )}
              >
                {submittingReview
                  ? (isAr ? "جاري الإرسال..." : "Submitting...")
                  : reviewAction === "approve"
                  ? (isAr ? "تأكيد الموافقة" : "Confirm Approval")
                  : reviewAction === "reject"
                  ? (isAr ? "تأكيد الرفض" : "Confirm Rejection")
                  : (isAr ? "اختر إجراءً" : "Select an action")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {request && <div className="mx-auto max-w-7xl p-4 sm:px-7"><RequestInvoices requestId={request._id} customerId={request.customerId?._id || request.customerId} open={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} /></div>}
    </>
  )
}

"use client"
import {serviceStyle} from "@/lib/requests/service-colors"
import {FinalShipmentDocuments} from "@/components/portal/requests/FinalShipmentDocuments"
import {RequestTimeline} from "@/components/portal/requests/RequestTimeline"

import { serviceStatusLabels } from "@/lib/requests/progress"
import { visibleRequestServices } from "@/lib/requests/visible-services"
import { usePortalLiveRefresh } from "@/hooks/useLiveUpdates"
import React, { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { PortalHeader } from "@/components/portal/PortalHeader"
import { UploadCloud, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { MultiFileUploadZone } from "@/components/portal/documents/MultiFileUploadZone"
import { DocumentTable } from "@/components/portal/documents/DocumentTable"
import { usePortal } from "@/components/portal/PortalContext"
import { cn } from "@/lib/utils"
import { Link } from "@/navigation"
import { Button } from "@/components/ui/Button"
import { UCRSection } from "@/components/portal/requests/UCRSection"
import { QuoteServiceSelector } from "@/components/portal/quotes/QuoteServiceSelector"
import { RequestInvoices } from "@/components/admin/shipments/RequestInvoices"
import { PublishedInvoiceLink, ServiceProgress } from "@/components/portal/requests/ServiceProgress"

export default function RequestDetailsAndDocumentsPage() {
  const params = useParams()
  const t = useTranslations()
  const isAr=useLocale()==="ar"
  const [request, setRequest] = useState<any>(null)
  const [quote, setQuote] = useState<any>(null)
  const [selection,setSelection]=useState<{quoteId:string;keys:string[]}|null>(null)
  const [quoteItems, setQuoteItems] = useState<any[]>([])
  const selectedServices=selection && selection.quoteId===quote?._id?selection.keys:[...new Set(quoteItems.map(item=>String(item.serviceKey)))]
  const [loading, setLoading] = useState(true)
  const { refreshData } = usePortal()

  useEffect(() => {
    if (params.id) {
      fetchRequestDetails()
    }
  }, [params.id])
  useEffect(()=>{
    let active=true
    const refresh=async()=>{if(document.visibilityState!=="visible")return;try{const response=await fetch("/api/portal/requests",{cache:"no-store"});if(!response.ok)return;const data=await response.json();const current=data.requests?.find((row:any)=>row._id===params.id);if(active&&current)setRequest(current)}catch{}}
    window.addEventListener("focus",refresh)
    return()=>{active=false;window.removeEventListener("focus",refresh)}
  },[params.id])

  usePortalLiveRefresh(() => { void fetchRequestDetails(true) }, ["request_updated", "quote_updated", "document_updated"])

  const fetchRequestDetails = async (background = false) => {
    try {
      if (!background) setLoading(true)
      // Fetch request list and find ours
      const res = await fetch("/api/portal/requests")
      const data = await res.json()
      if (data.requests) {
        const req = data.requests.find((r: any) => r._id === params.id)
        setRequest(req)
      }

      // Fetch quote details
      const quoteRes = await fetch(`/api/portal/requests/${params.id}/quotes`)
      const quoteData = await quoteRes.json()
      if (quoteData.success && quoteData.quote) {
        setQuote(quoteData.quote)
        setQuoteItems(quoteData.items || [])
      }
    } catch (err) {
      toast.error("Failed to load request")
    } finally {
      if (!background) setLoading(false)
    }
  }

  const handleUploadDone = () => {
    refreshData()
    fetchRequestDetails()
    toast.success("Documents uploaded successfully")
  }

  const handleQuoteAction = async (action: "accept" | "reject") => {
    if (!quote) return
    try {
      setLoading(true)
      const res = await fetch(`/api/portal/quotes/${quote._id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, acceptedServices:quoteItems.length?selectedServices:undefined }),
      })
      if (!res.ok) throw new Error("Failed to update quote")
      toast.success(action === "accept" ? "Quote accepted" : "Quote rejected")
      fetchRequestDetails()
      refreshData()
    } catch (err) {
      toast.error("An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleRequestCompliance = async (type: "ACID" | "UCR") => {
    try {
      setLoading(true)
      const res = await fetch(`/api/portal/requests/${request._id}/request-compliance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complianceType: type }),
      })
      if (!res.ok) throw new Error("Failed to request compliance")
      toast.success(type + " requested successfully")
      fetchRequestDetails()
      refreshData()
    } catch (err) {
      toast.error("An error occurred while requesting " + type)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">{t("portal.requests.details.loading_details") || "Loading request details..."}</div>
  }

  if (!request) {
    return <div className="p-8 text-center text-red-500">{t("portal.requests.details.not_found") || "Request not found."}</div>
  }

  const visibleServices = visibleRequestServices<any>(request.services || [], request.acceptedServiceIds)

  return (
    <div className="flex flex-col pb-20">
      <PortalHeader
        title={t("portal.requests.details.request_tracking", { trackingNumber: request.trackingNumber }) || `Request: ${request.trackingNumber}`}
        subtitle={request.subject}
      />

      <div className="p-6 sm:p-8 max-w-6xl space-y-8">



        {request.details?.containerCount!==undefined&&<p className="rounded-xl border p-4 font-semibold">{isAr?"عدد الحاويات: ":"Container count: "}{request.details.containerCount}</p>}
        <UCRSection requestId={String(params.id)} />
        <ServiceProgress services={visibleServices} />
        <FinalShipmentDocuments requestId={String(params.id)} updatedAt={request.updatedAt} />
        <PublishedInvoiceLink invoice={request.publishedInvoice} />
        {/* Quotation & Offer */}
        {quote && !["accepted","partially_accepted"].includes(quote.status) && (
          <div className="bg-white dark:bg-secondary-900 rounded-xl border-2 border-primary-500 p-6 shadow-sm">
            {request.quoteRequired===false&&<p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">{isAr?"عرض سعر سابق محفوظ للمرجع. هذا الطلب يعمل حاليًا بمسار التنفيذ المباشر.":"Previous quotation retained for reference. This request currently uses direct processing."}</p>}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle2 className="text-primary-600 h-6 w-6" />
                {t("portal.requests.details.official_quotation") || "Official Quotation & Offer"}
              </h2>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                quote.status === "accepted" ? "bg-emerald-100 text-emerald-700" :
                quote.status === "rejected" ? "bg-rose-100 text-rose-700" :
                "bg-amber-100 text-amber-700"
              )}>
                {quote.status}
              </span>
            </div>

            <div className="space-y-4 mb-8">
              {quote.reusableAgreement&&<p className="mb-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{isAr?"قبول هذا الاتفاق يسمح باستخدام نفس الأسعار للطلبات المطابقة في الخدمات والمسار والكميات حتى انتهاء صلاحيته.":"Accepting this agreement authorizes reuse for matching services, route and quantities until expiry."}</p>}
              <QuoteServiceSelector items={quoteItems} currency={quote.currency || "EGP"} ar={isAr} selected={quote.acceptedServices || selectedServices} onChange={keys=>setSelection({quoteId:quote._id,keys})} editable={request.quoteRequired!==false&&request.status==="quote_provided"} />

            </div>

            {request.quoteRequired !== false && request.status === "quote_provided" && (
              <div className="flex gap-4">
                <Button disabled={loading || (quoteItems.length>0&&!selectedServices.length)} className="flex-1" size="lg" onClick={() => handleQuoteAction("accept")}>
                  {isAr ? "قبول الخدمات المحددة" : "Accept selected services"}
                </Button>
                <Button variant="outline" className="flex-1" size="lg" onClick={() => handleQuoteAction("reject")}>
                  {t("portal.requests.details.reject_quotation") || "Reject Quotation"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Services Summary */}
        <div className="bg-white dark:bg-secondary-900 rounded-xl border border-gray-200 dark:border-secondary-800 p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">{t("portal.requests.details.requested_services") || "Requested Services"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleServices.map((service: any) => (
              <div key={service._id} style={serviceStyle(service.serviceKey)} className="service-skin service-panel rounded-xl border p-4">
                <h3 className="font-bold text-lg capitalize mb-2">
                  {t(`portal.requests.new.${service.serviceKey}`) === `portal.requests.new.${service.serviceKey}` ? service.serviceKey.replace(/_/g, " ") : t(`portal.requests.new.${service.serviceKey}`)}
                </h3>
                <div className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                  <p><span className="font-semibold">{t("portal.requests.details.status")}</span> {serviceStatusLabels[service.status]?.[isAr ? 0 : 1] ?? (t.has(`portal.requests.status_${service.status}`) ? t(`portal.requests.status_${service.status}`) : (isAr ? "قيد المراجعة" : "Under review"))}</p>
                  {service.details?.containerType && <div><span className="font-semibold">{t("portal.requests.details.container_type")}:</span> {t.has(`portal.requests.details.container_types.${service.details.containerType}`) ? t(`portal.requests.details.container_types.${service.details.containerType}`) : service.details.containerType}</div>}
                  {service.details?.containerSize && <div><span className="font-semibold">{t("portal.requests.details.container_size")}:</span> {t.has(`portal.requests.details.container_sizes.${service.details.containerSize}`) ? t(`portal.requests.details.container_sizes.${service.details.containerSize}`) : service.details.containerSize}</div>}
                  {service.details?.origin && <p><span className="font-semibold">{t("portal.requests.details.origin")}:</span> {service.details.origin}</p>}
                  {service.details?.destination && <p><span className="font-semibold">{t("portal.requests.details.destination")}:</span> {service.details.destination}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <RequestTimeline events={request.timeline||[]} />

        <div className="flex flex-col items-center mt-8 space-y-4">
          <Link
            href="/portal/requests"
            className="rounded-xl bg-primary-600 px-8 py-3 font-bold text-white shadow hover:bg-primary-700 transition-colors"
          >
            {t("portal.requests.details.finish_return") || "Finish & Return to Requests"}
          </Link>
          
          {request.complianceNumber && (
            <div className="w-full p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-center mt-4">
              <p className="font-bold text-emerald-800 dark:text-emerald-300">
                {t("portal.requests.details.compliance_issued", { type: request.complianceType }) || `تم إصدار رقم الـ ${request.complianceType} بنجاح:`}
              </p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2 tracking-widest">{request.complianceNumber}</p>
            </div>
          )}
        </div>
        {request && <RequestInvoices requestId={request._id} portal />}
      </div>
    </div>
  )
}

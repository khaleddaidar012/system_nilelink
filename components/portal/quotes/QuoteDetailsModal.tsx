"use client"

import { useTranslations, useLocale } from "next-intl"
import { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { X, FileText, Download, Printer, CheckCircle, XCircle, Clock, Check, Plane, Ship, Truck, MapPin, AlertCircle, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { QuoteStatusBadge } from "./QuoteStatusBadge"
import { RequestTracking } from "@/components/portal/requests/RequestTracking"
import { QuoteServiceSelector } from "./QuoteServiceSelector"
import { cn } from "@/lib/utils"

interface QuoteDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  quote: any
  onQuoteUpdated: () => void
}

export function QuoteDetailsModal({ isOpen, onClose, quote, onQuoteUpdated }: QuoteDetailsModalProps) {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"

  const [loadingAction, setLoadingAction] = useState<"accept" | "reject" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [selection,setSelection]=useState<{quoteId:string;keys:string[]}|null>(null)
  if (!quote) return null
  const offeredKeys=[...new Set((quote.items||[]).map((item:any)=>String(item.serviceKey)))] as string[]
  const selectedServices=selection && selection.quoteId===quote._id?selection.keys:quote.acceptedServices||offeredKeys

  const canTakeAction = quote.status === "sent" || quote.status === "viewed" || quote.status === "pending"

  const handleAccept = async () => {
    try {
      setLoadingAction("accept")
      setActionError(null)
      const res = await fetch(`/api/portal/quotes/${quote._id}/accept`, {
        method: "POST",
        headers: {"content-type":"application/json"},body:JSON.stringify({acceptedServices:offeredKeys.length?selectedServices:undefined}),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || (isAr ? "فشل قبول عرض السعر" : "Failed to accept quote"))
        return
      }
      onQuoteUpdated()
      onClose()
    } catch {
      setActionError(isAr ? "حدث خطأ في الاتصال بالخادم" : "Network error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleReject = async () => {
    try {
      setLoadingAction("reject")
      setActionError(null)
      const res = await fetch(`/api/portal/quotes/${quote._id}/reject`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || (isAr ? "فشل رفض عرض السعر" : "Failed to reject quote"))
        return
      }
      onQuoteUpdated()
      onClose()
    } catch {
      setActionError(isAr ? "حدث خطأ في الاتصال بالخادم" : "Network error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  const items = Array.isArray(quote.items) && quote.items.length > 0 ? quote.items : []
  const origin = quote.requestId?.origin || quote.origin || (isAr ? "ميناء الإقلاع / الشحن" : "Departure Port")
  const destination = quote.requestId?.destination || quote.destination || (isAr ? "ميناء الوصول / التخزين" : "Arrival Port")

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-secondary-900/40 backdrop-blur-sm transition-opacity dark:bg-black/60" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 rtl:left-0 rtl:right-auto rtl:pr-10 sm:pl-16 rtl:sm:pr-16">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-400 sm:duration-500"
                enterFrom="translate-x-full rtl:-translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-400 sm:duration-500"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full rtl:-translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-3xl">
                  <div className="flex h-full flex-col overflow-y-scroll bg-slate-50 shadow-2xl dark:bg-secondary-950">
                    
                    {/* Header */}
                    <div className="bg-white px-4 py-6 shadow-sm sm:px-6 border-b border-secondary-200/80 dark:bg-secondary-900 dark:border-secondary-800">
                      <div className="flex items-start justify-between">
                        <Dialog.Title className="text-xl font-bold leading-6 text-secondary-900 dark:text-white flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <div>{isAr ? "تفاصيل عرض السعر" : (t("portal.quotes.details.title") || "Quote Details")}</div>
                            <div className="text-sm font-mono text-secondary-500 mt-1">{quote.quoteNumber}</div>
                          </div>
                        </Dialog.Title>
                        <div className="ml-3 flex h-7 items-center rtl:mr-3 rtl:ml-0">
                          <button
                            type="button"
                            className="rounded-full bg-white text-secondary-400 hover:text-secondary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:bg-secondary-900 dark:text-secondary-500 dark:hover:text-secondary-300"
                            onClick={onClose}
                          >
                            <span className="sr-only">Close panel</span>
                            <X className="h-6 w-6" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <QuoteStatusBadge status={quote.status} />
                        <span className="text-xs text-secondary-500">
                          {isAr ? "تاريخ الإصدار" : "Created"}: {quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : "-"}
                        </span>
                        <span className="text-xs text-secondary-500 border-l border-secondary-300 pl-3 rtl:border-r rtl:border-l-0 rtl:pl-0 rtl:pr-3">
                          {isAr ? "صالح حتى" : "Valid Until"}: <span className="font-bold text-secondary-700 dark:text-secondary-300">{quote.validUntil ? format(new Date(quote.validUntil), "MMM d, yyyy") : "-"}</span>
                        </span>
                        {quote.requestNumber && (
                          <span className="text-xs text-secondary-500 border-l border-secondary-300 pl-3 rtl:border-r rtl:border-l-0 rtl:pl-0 rtl:pr-3 font-mono">
                            {isAr ? "الطلب المرتبط" : "Request"}: <span className="font-bold text-primary-600 dark:text-primary-400">{quote.requestNumber}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="relative flex-1 px-4 py-6 sm:px-6 space-y-6">
                      {actionError && (
                        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{actionError}</span>
                        </div>
                      )}

                      {/* Status Notification Banner if already resolved */}
                      {["accepted","partially_accepted"].includes(quote.status) && (
                        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <p className="text-sm font-bold">
                              {isAr ? "تم قبول عرض السعر هذا بنجاح" : "Quotation Accepted"}
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400/90 mt-0.5">
                              {isAr
                                ? "تم تأكيد طلبك والخدمات الآن في مرحلة التشغيل والتنفيذ الفعلي."
                                : "Your booking is locked and logistics operations are actively processing."}
                            </p>
                          </div>
                        </div>
                      )}

                      {quote.status === "rejected" && (
                        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                          <XCircle className="h-6 w-6 shrink-0 text-rose-600 dark:text-rose-400" />
                          <div>
                            <p className="text-sm font-bold">
                              {isAr ? "تم رفض عرض السعر هذا" : "Quotation Declined"}
                            </p>
                            <p className="text-xs text-rose-700 dark:text-rose-400/90 mt-0.5">
                              {isAr
                                ? "تم إخطار فريق العمل بإمكانية تقديم عرض بديل أو تعديل الشروط."
                                : "Our team has been notified to revise or discuss alternative routing."}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Shipment Info Summary */}
                      {quote.complianceReference?.number && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><span>{quote.complianceReference.type}: </span><strong dir="ltr">{quote.complianceReference.number}</strong></div>}
                      <section className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
                        <h3 className="text-sm font-bold text-secondary-900 dark:text-white mb-4 uppercase tracking-wider">
                          {isAr ? "نظرة عامة على الشحنة والمسار" : (t("portal.quotes.details.shipmentInfo") || "Shipment Overview")}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-secondary-400 mt-0.5" />
                            <div>
                              <p className="text-xs text-secondary-500">{isAr ? "نقطة الانطلاق / الميناء" : (t("portal.quotes.details.origin") || "Origin")}</p>
                              <p className="font-semibold text-secondary-900 dark:text-white">{origin}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-secondary-400 mt-0.5" />
                            <div>
                              <p className="text-xs text-secondary-500">{isAr ? "الوجهة / ميناء الوصول" : (t("portal.quotes.details.destination") || "Destination")}</p>
                              <p className="font-semibold text-secondary-900 dark:text-white">{destination}</p>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Pricing Breakdown */}
                      <section className="rounded-2xl border border-secondary-200 bg-white shadow-sm overflow-hidden dark:border-secondary-800 dark:bg-secondary-900">
                        <div className="border-b border-secondary-200 bg-secondary-50/50 px-5 py-4 dark:border-secondary-800 dark:bg-secondary-950 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-secondary-900 dark:text-white uppercase tracking-wider">
                            {isAr ? "تفاصيل بنود التسعير" : (t("portal.quotes.details.pricing") || "Pricing Breakdown")}
                          </h3>
                          <span className="text-xs font-mono font-semibold text-secondary-500">
                            {quote.currency || "EGP"}
                          </span>
                        </div>
                        <div className="p-5">
                          {["accepted","partially_accepted"].includes(quote.status) ? <RequestTracking requestId={quote.requestId?._id || quote.requestId} /> : items.length > 0 ? (
                            <QuoteServiceSelector key={quote._id} items={items} currency={quote.currency || "EGP"} ar={isAr} editable={canTakeAction && !loadingAction} selected={selectedServices} onChange={keys=>setSelection({quoteId:quote._id,keys})} />
                          ) : (
                            <p className="text-sm text-slate-500">{isAr ? "راجع ملاحظات العرض أو تواصل مع فريقنا لتفاصيل الخدمات." : "Review the quotation notes or contact our team for service details."}</p>
                          )}

                          {quote.notes && (
                            <div className="mt-4 rounded-xl bg-secondary-50 p-3 text-xs text-secondary-600 dark:bg-secondary-800/40 dark:text-secondary-400 border border-secondary-200/60 dark:border-secondary-700/50">
                              <span className="font-bold text-secondary-900 dark:text-white">{isAr ? "شروط وملاحظات: " : "Notes & Terms: "}</span>
                              {quote.notes}
                            </div>
                          )}
                          

                        </div>
                      </section>

                    </div>

                    {/* Actions Footer */}
                    <div className="flex flex-shrink-0 justify-between items-center border-t border-secondary-200 bg-white px-4 py-4 dark:border-secondary-800 dark:bg-secondary-900 sm:px-6">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="inline-flex items-center rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-secondary-700 shadow-sm ring-1 ring-inset ring-secondary-300 hover:bg-secondary-50 dark:bg-secondary-800 dark:text-white dark:ring-secondary-700 dark:hover:bg-secondary-700"
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5 rtl:ml-1.5 rtl:mr-0 text-secondary-500" />
                          <span>{isAr ? "طباعة" : "Print"}</span>
                        </button>
                      </div>
                      
                      {canTakeAction ? (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            disabled={loadingAction !== null}
                            className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-xs font-bold text-rose-600 shadow-sm ring-1 ring-inset ring-secondary-300 hover:bg-rose-50 hover:ring-rose-200 dark:bg-secondary-800 dark:text-rose-400 dark:ring-secondary-700 dark:hover:bg-rose-900/30 dark:hover:ring-rose-800/50 disabled:opacity-50"
                            onClick={handleReject}
                          >
                            {loadingAction === "reject" ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin rtl:ml-1.5 rtl:mr-0" />
                            ) : (
                              <XCircle className="mr-1.5 h-3.5 w-3.5 rtl:ml-1.5 rtl:mr-0" />
                            )}
                            {isAr ? "رفض العرض" : (t("portal.quotes.actions.reject") || "Reject")}
                          </button>
                          <button
                            type="button"
                            disabled={loadingAction !== null || (offeredKeys.length > 0 && !selectedServices.length)}
                            className="inline-flex items-center rounded-xl bg-emerald-600 px-6 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50"
                            onClick={handleAccept}
                          >
                            {loadingAction === "accept" ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin rtl:ml-1.5 rtl:mr-0" />
                            ) : (
                              <CheckCircle className="mr-1.5 h-3.5 w-3.5 rtl:ml-1.5 rtl:mr-0" />
                            )}
                            {isAr ? "قبول الخدمات المحددة" : "Accept selected services"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={onClose}
                          className="rounded-xl border border-secondary-200 bg-white px-5 py-2 text-xs font-bold text-secondary-700 shadow-sm hover:bg-secondary-50 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-300"
                        >
                          {isAr ? "إغلاق" : "Close"}
                        </button>
                      )}
                    </div>
                    
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

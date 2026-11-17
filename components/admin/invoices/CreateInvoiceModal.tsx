"use client"

import { useState, useEffect, Fragment, useMemo } from "react"
import { useLocale } from "next-intl"
import { Dialog, Transition } from "@headlessui/react"
import { X, Building2, Ship, Calendar, DollarSign, Lock, AlertCircle, Loader2, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { InvoiceLineItemsEditor } from "./InvoiceLineItemsEditor"
import { InvoiceFinancialSummaryBox } from "./InvoiceFinancialSummaryBox"
import { calculateInvoiceTotals, RawInvoiceItemInput } from "@/lib/engine/invoice-calculator"

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  initialCustomerId?: string
  initialCustomerName?: string
  initialRequestId?: string
  initialTrackingNumber?: string
  onSuccess?: (invoice: any) => void
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  initialCustomerId,
  initialCustomerName,
  initialRequestId,
  initialTrackingNumber,
  onSuccess,
}: CreateInvoiceModalProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  // Number preview
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<string>("")
  const [loadingNumber, setLoadingNumber] = useState(false)

  // Customer selection
  const [customerMode, setCustomerMode] = useState<"registered" | "external">("registered")
  const [customerId, setCustomerId] = useState<string>(initialCustomerId || "")
  const [customerName, setCustomerName] = useState<string>(initialCustomerName || "")
  const [customerSearchQuery, setCustomerSearchQuery] = useState("")
  const [customerOptions, setCustomerOptions] = useState<any[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)

  // External client fields
  const [externalCompanyName, setExternalCompanyName] = useState("")
  const [externalContactEmail, setExternalContactEmail] = useState("")
  const [externalContactPhone, setExternalContactPhone] = useState("")
  const [externalAddress, setExternalAddress] = useState("")
  const [externalTaxId, setExternalTaxId] = useState("")

  // Shipment / Request selection
  const [requestId, setRequestId] = useState<string>(initialRequestId || "")
  const [shipments, setShipments] = useState<any[]>([])
  const [loadingShipments, setLoadingShipments] = useState(false)

  // Financial parameters
  const [documentType, setDocumentType] = useState<"statement" | "invoice" | "tax_invoice">("statement")
  const [canIssueTaxInvoice, setCanIssueTaxInvoice] = useState(false)
  const [currency, setCurrency] = useState<string>("EGP")
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().split("T")[0]
  })
  const [items, setItems] = useState<RawInvoiceItemInput[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ])
  const [additionalCharges, setAdditionalCharges] = useState<number>(0)
  const [discount, setDiscount] = useState<number>(0)
  const [taxRate, setTaxRate] = useState<number>(14)
  const [notes, setNotes] = useState<string>("")
  const [internalNotes, setInternalNotes] = useState<string>("")

  const [submitting, setSubmitting] = useState(false)

  // Fetch next invoice number and user permissions on open
  useEffect(() => {
    if (isOpen) {
      setLoadingNumber(true)
      fetch("/api/admin/invoices/next-number")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setNextInvoiceNumber(data.nextNumber)
          }
        })
        .catch(() => {})
        .finally(() => setLoadingNumber(false))

      fetch("/api/auth/me")
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            const isSuper = data.user.role === "super_admin"
            const hasPerm = Boolean(data.user.staffPermissions?.issueTaxInvoice)
            setCanIssueTaxInvoice(isSuper || hasPerm)
          }
        })
        .catch(() => {})
    }
  }, [isOpen])

  // Reset or initialize state
  useEffect(() => {
    if (isOpen) {
      if (initialCustomerId) {
        setCustomerId(initialCustomerId)
        setCustomerName(initialCustomerName || "")
      }
      if (initialRequestId) {
        setRequestId(initialRequestId)
      }
    }
  }, [isOpen, initialCustomerId, initialCustomerName, initialRequestId])

  // Customer search typeahead
  useEffect(() => {
    if (!initialCustomerId && customerSearchQuery.trim().length >= 1) {
      setSearchingCustomers(true)
      const t = setTimeout(() => {
        fetch(`/api/admin/customers/search?q=${encodeURIComponent(customerSearchQuery.trim())}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setCustomerOptions(data.customers || [])
            }
          })
          .catch(() => {})
          .finally(() => setSearchingCustomers(false))
      }, 250)
      return () => clearTimeout(t)
    } else if (!customerSearchQuery.trim()) {
      setCustomerOptions([])
    }
  }, [customerSearchQuery, initialCustomerId])

  // Fetch customer shipments if customer selected
  useEffect(() => {
    if (customerId) {
      setLoadingShipments(true)
      fetch(`/api/admin/requests?customerId=${customerId}&limit=50`)
        .then((res) => res.json())
        .then((data) => {
          if (data.requests) {
            setShipments(data.requests)
          }
        })
        .catch(() => {})
        .finally(() => setLoadingShipments(false))
    } else {
      setShipments([])
      setRequestId("")
    }
  }, [customerId])

  // Real-time calculations
  const calculation = useMemo(() => {
    return calculateInvoiceTotals({
      items,
      taxRate,
      discount,
      additionalCharges,
    })
  }, [items, taxRate, discount, additionalCharges])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (customerMode === "registered") {
      if (!customerId) {
        if (customerSearchQuery.trim()) {
          toast.error(
            isAr
              ? `يرجى النقر على العميل من القائمة المنسدلة لاختياره، أو التبديل لعميل خارجي باسم "${customerSearchQuery}"`
              : `Please click customer in the dropdown list to select, or switch to External Client for "${customerSearchQuery}"`
          )
        } else {
          toast.error(isAr ? "يرجى تحديد العميل المستهدف أولاً" : "Please select a customer first.")
        }
        return
      }
    } else {
      if (!externalCompanyName.trim()) {
        toast.error(isAr ? "يرجى إدخال اسم العميل أو الشركة" : "Please enter the client or company name.")
        return
      }
    }

    if (!calculation.isValid) {
      toast.error(calculation.errors[0] || (isAr ? "يرجى تصحيح بنود الفاتورة" : "Please correct line item errors."))
      return
    }

    setSubmitting(true)
    try {
      const payload: any = {
        currency,
        issueDate,
        dueDate,
        taxRate,
        discount,
        additionalCharges,
        documentType,
        notes,
        internalNotes,
        items: calculation.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      }

      if (customerMode === "registered") {
        payload.customerId = customerId
        payload.relatedRequestId = requestId || null
      } else {
        payload.externalCustomer = {
          companyName: externalCompanyName.trim(),
          contactEmail: externalContactEmail.trim() || undefined,
          contactPhone: externalContactPhone.trim() || undefined,
          address: externalAddress.trim() || undefined,
          taxCardNumber: externalTaxId.trim() || undefined,
        }
      }

      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || (isAr ? "فشل إنشاء الفاتورة" : "Failed to create invoice"))
      }

      toast.success(
        isAr
          ? `تم إنشاء مسودة الفاتورة بنجاح رقم ${data.invoice.invoiceNumber}`
          : `Draft invoice ${data.invoice.invoiceNumber} created successfully.`
      )

      if (onSuccess) {
        onSuccess(data.invoice)
      }
      onClose()
    } catch (err: any) {
      toast.error(err.message || "An error occurred while creating invoice")
    } finally {
      setSubmitting(false)
    }
  }

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
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all w-full max-w-4xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white my-8">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <Dialog.Title as="h3" className="text-lg font-bold text-slate-900 dark:text-white">
                        {isAr ? "إنشاء فاتورة تجارية جديدة" : "Create New Commercial Invoice"}
                      </Dialog.Title>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isAr ? "يتم حفظ الفاتورة كمسودة داخلية ولا تظهر للعميل إلا بعد الاعتماد" : "Invoice is saved as an internal draft and remains hidden from the customer until confirmed"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {nextInvoiceNumber && (
                      <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                        {nextInvoiceNumber}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                  {/* Financial Document Type Selection */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      {isAr ? "نوع المستند المالي:" : "Financial Document Type:"}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {/* 1. Account Statement (Default) */}
                      <button
                        type="button"
                        onClick={() => setDocumentType("statement")}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                          documentType === "statement"
                            ? "border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 shadow-xs"
                            : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <span className="block">{isAr ? "كشف حساب" : "Account Statement"}</span>
                        <span className="text-[10px] font-normal text-slate-400 block mt-0.5">
                          {isAr ? "الافتراضي / الأساسي" : "Default / Baseline"}
                        </span>
                      </button>

                      {/* 2. Commercial Invoice */}
                      <button
                        type="button"
                        onClick={() => setDocumentType("invoice")}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                          documentType === "invoice"
                            ? "border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 shadow-xs"
                            : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <span className="block">{isAr ? "فاتورة تجارية" : "Commercial Invoice"}</span>
                        <span className="text-[10px] font-normal text-slate-400 block mt-0.5">
                          {isAr ? "مطالبة شحن عادية" : "Standard Freight"}
                        </span>
                      </button>

                      {/* 3. Tax Invoice (Conditionally Rendered by Permission) */}
                      {canIssueTaxInvoice && (
                        <button
                          type="button"
                          onClick={() => setDocumentType("tax_invoice")}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                            documentType === "tax_invoice"
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <span className="block">{isAr ? "فاتورة ضريبية" : "Tax Invoice"}</span>
                          <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 block mt-0.5">
                            {isAr ? "معتمدة ضريبياً" : "Official Tax VAT"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customer Type Toggle (if not pre-locked) */}
                  {!initialCustomerId && (
                    <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setCustomerMode("registered")}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          customerMode === "registered"
                            ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-white shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        {isAr ? "عميل مسجل في المنظومة" : "Registered Client"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerMode("external")
                          setCustomerId("")
                          setCustomerName("")
                          setRequestId("")
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          customerMode === "external"
                            ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-white shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        {isAr ? "عميل خارجي / مباشر (بدون حساب)" : "External / One-Off Client (No Account)"}
                      </button>
                    </div>
                  )}

                  {customerMode === "registered" ? (
                    /* Parties & Dates */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Customer Selection */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {isAr ? "العميل المستهدف" : "Customer / Client"} *
                        </label>
                        {customerId ? (
                          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between">
                            <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              {customerName || "Selected Customer"}
                            </span>
                            {!initialCustomerId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomerId("")
                                  setCustomerName("")
                                  setCustomerSearchQuery("")
                                  setRequestId("")
                                }}
                                className="p-1 rounded-lg text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors cursor-pointer"
                                title={isAr ? "تغيير العميل" : "Change customer"}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              placeholder={isAr ? "ابحث باسم الشركة أو السجل..." : "Search customer by company name or CR..."}
                              value={customerSearchQuery}
                              onChange={(e) => {
                                setCustomerId("")
                                setCustomerName("")
                                setCustomerSearchQuery(e.target.value)
                              }}
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                            {searchingCustomers && (
                              <div className="absolute right-3 top-2.5 rtl:right-auto rtl:left-3">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                              </div>
                            )}

                            {customerOptions.length > 0 && !customerId && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto">
                                <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 text-[11px] font-bold text-slate-500">
                                  {isAr ? "انقر على العميل لتحديده:" : "Click to select client:"}
                                </div>
                                {customerOptions.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setCustomerId(c.id)
                                      setCustomerName(c.companyName)
                                      setCustomerSearchQuery("")
                                      setCustomerOptions([])
                                    }}
                                    className="w-full text-left rtl:text-right px-3 py-2 text-xs hover:bg-primary-50 dark:hover:bg-slate-700/80 flex flex-col border-b border-slate-100 dark:border-slate-700/40 last:border-0 cursor-pointer"
                                  >
                                    <span className="font-bold text-slate-900 dark:text-white">{c.companyName}</span>
                                    <span className="text-[11px] text-slate-400">
                                      {c.contactEmail} | CR: {c.commercialRegisterNumber || "N/A"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {customerSearchQuery.trim().length > 0 && !searchingCustomers && customerOptions.length === 0 && (
                              <div className="mt-1.5 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center justify-between gap-2 text-xs">
                                <span className="text-amber-800 dark:text-amber-300 text-[11px]">
                                  {isAr
                                    ? `لم يتم العثور على عميل مسجل باسم "${customerSearchQuery}"`
                                    : `No registered customer found for "${customerSearchQuery}"`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomerMode("external")
                                    setExternalCompanyName(customerSearchQuery.trim())
                                    setCustomerSearchQuery("")
                                    setCustomerId("")
                                  }}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors cursor-pointer"
                                >
                                  {isAr ? "تحويل إلى عميل خارجي" : "Use as External Client"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Linked Shipment Selection */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {isAr ? "الشحنة المرتبطة (اختياري)" : "Linked Shipment / Request (Optional)"}
                        </label>
                        {initialRequestId ? (
                          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                            <span className="text-sm font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Ship className="w-4 h-4 text-primary-500" />
                              {initialTrackingNumber || "Linked Shipment"}
                            </span>
                            <span className="text-[11px] font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">
                              {isAr ? "مثبّت" : "Locked"}
                            </span>
                          </div>
                        ) : (
                          <select
                            value={requestId}
                            onChange={(e) => setRequestId(e.target.value)}
                            disabled={!customerId || loadingShipments}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:bg-slate-100 dark:disabled:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            <option value="">
                              {!customerId
                                ? isAr
                                  ? "-- حدد العميل أولاً لعرض الشحنات --"
                                  : "-- Select a customer first --"
                                : loadingShipments
                                ? isAr
                                  ? "جاري تحميل الشحنات..."
                                  : "Loading shipments..."
                                : shipments.length === 0
                                ? isAr
                                  ? "لا توجد شحنات مسجلة لهذا العميل (فوترة مباشرة)"
                                  : "No shipments found (Direct billing)"
                                : isAr
                                ? "-- اختر الشحنة للربط --"
                                : "-- Select linked shipment --"}
                            </option>
                            {shipments.map((s) => (
                              <option key={s._id} value={s._id}>
                                {s.trackingNumber} — {s.serviceType || "Freight"} ({s.status})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* External Client Details Box */
                    <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-primary-500" />
                          <span>
                            {isAr
                              ? "بيانات العميل الخارجي (تطبع في الفاتورة الرسمية)"
                              : "External Client Info (Printed on Official Invoice)"}
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full font-bold">
                          {isAr ? "فاتورة مباشرة بدون حساب أو شحنة" : "Direct / No Account"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                            {isAr ? "اسم العميل أو الشركة" : "Company / Client Name"} *
                          </label>
                          <input
                            type="text"
                            required
                            value={externalCompanyName}
                            onChange={(e) => setExternalCompanyName(e.target.value)}
                            placeholder={isAr ? "مثال: شركة الأمل للاستيراد والتصدير" : "e.g. Acme Logistics"}
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                            {isAr ? "البريد الإلكتروني للعميل" : "Contact Email (Optional)"}
                          </label>
                          <input
                            type="email"
                            value={externalContactEmail}
                            onChange={(e) => setExternalContactEmail(e.target.value)}
                            placeholder="billing@company.com"
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                            {isAr ? "رقم الهاتف / الواتساب" : "Contact Phone (Optional)"}
                          </label>
                          <input
                            type="text"
                            value={externalContactPhone}
                            onChange={(e) => setExternalContactPhone(e.target.value)}
                            placeholder="+20 100 000 0000"
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                            {isAr ? "الرقم الضريبي أو السجل التجاري" : "Tax ID / CR (Optional)"}
                          </label>
                          <input
                            type="text"
                            value={externalTaxId}
                            onChange={(e) => setExternalTaxId(e.target.value)}
                            placeholder={isAr ? "الرقم الضريبي إن وجد" : "Tax ID / CR"}
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                            {isAr ? "العنوان أو المدينة" : "Address / Location (Optional)"}
                          </label>
                          <input
                            type="text"
                            value={externalAddress}
                            onChange={(e) => setExternalAddress(e.target.value)}
                            placeholder={isAr ? "الإسكندرية، مصر" : "Alexandria, Egypt"}
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dates & Currency */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {isAr ? "العملة" : "Currency"}
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                      >
                        <option value="EGP">EGP — Egyptian Pound (جنيه مصري)</option>
                        <option value="USD">USD — US Dollar (دولار أمريكي)</option>
                        <option value="EUR">EUR — Euro (يورو)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {isAr ? "تاريخ الإصدار" : "Issue Date"}
                      </label>
                      <input
                        type="date"
                        required
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {isAr ? "تاريخ الاستحقاق" : "Due Date"}
                      </label>
                      <input
                        type="date"
                        required
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Line Items Editor */}
                  <InvoiceLineItemsEditor
                    items={items}
                    currency={currency}
                    onChange={setItems}
                  />

                  {/* Financial Summary Calculation Widget */}
                  <InvoiceFinancialSummaryBox
                    calculation={calculation}
                    currency={currency}
                    taxRate={taxRate}
                    discount={discount}
                    additionalCharges={additionalCharges}
                    onTaxRateChange={setTaxRate}
                    onDiscountChange={setDiscount}
                    onAdditionalChargesChange={setAdditionalCharges}
                  />

                  {/* Notes & Internal Remarks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {isAr ? "ملاحظات الفاتورة للعميل (تظهر في PDF)" : "Public Client Notes (Visible on PDF)"}
                      </label>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={isAr ? "تعليمات الدفع أو الملاحظات التجارية..." : "Payment instructions, bank wire notes..."}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        {isAr ? "ملاحظات داخلية للموظفين (سرية)" : "Internal Staff Notes (Private)"}
                      </label>
                      <textarea
                        rows={2}
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        placeholder={isAr ? "ملاحظات التشغيل والمراجعة الداخلية..." : "Internal notes for billing and operations review..."}
                        className="w-full px-3 py-2 text-sm bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={submitting}
                      className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      {isAr ? "إلغاء" : "Cancel"}
                    </button>

                    <button
                      type="submit"
                      disabled={submitting || !calculation.isValid}
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{isAr ? "جاري الحفظ كمسودة..." : "Saving Draft..."}</span>
                        </>
                      ) : (
                        <span>{isAr ? "حفظ الفاتورة كمسودة داخلية" : "Save as Internal Draft"}</span>
                      )}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

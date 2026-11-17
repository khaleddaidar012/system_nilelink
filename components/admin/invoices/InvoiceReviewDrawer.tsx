"use client"

import { useState, useEffect, Fragment } from "react"
import { useLocale } from "next-intl"
import { Dialog, Transition } from "@headlessui/react"
import {
  X,
  ShieldCheck,
  Send,
  Download,
  Printer,
  Edit3,
  Trash2,
  XCircle,
  Building2,
  Ship,
  Calendar,
  AlertTriangle,
  Loader2,
  Clock,
  FileText,
} from "lucide-react"
import { toast } from "sonner"
import { AdminInvoiceStatusBadge } from "./AdminInvoiceStatusBadge"
import { getDocumentTypeMeta } from "@/lib/services/document-type-helper"
import { FinancialDocumentType } from "@/lib/models/Invoice"

interface InvoiceReviewDrawerProps {
  isOpen: boolean
  onClose: () => void
  invoice: any
  onStatusUpdated?: (updatedInvoice: any) => void
  onOpenEdit?: (invoiceId: string) => void
  onOpenSend?: (invoice: any) => void
}

export function InvoiceReviewDrawer({
  isOpen,
  onClose,
  invoice,
  onStatusUpdated,
  onOpenEdit,
  onOpenSend,
}: InvoiceReviewDrawerProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelPrompt, setShowCancelPrompt] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  const [docType, setDocType] = useState<FinancialDocumentType>(invoice?.documentType || "statement")
  const [canIssueTaxInvoice, setCanIssueTaxInvoice] = useState(false)

  useEffect(() => {
    if (invoice?.documentType) {
      setDocType(invoice.documentType)
    }
  }, [invoice?.documentType])

  useEffect(() => {
    if (isOpen) {
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

  if (!invoice) return null

  const isDraft = invoice.status === "draft"
  const isConfirmed = invoice.status === "confirmed"
  const isCancelled = invoice.status === "cancelled"

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const res = await fetch(`/api/admin/invoices/${invoice._id}/confirm`, {
        method: "POST",
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to confirm invoice")
      }

      toast.success(
        isAr
          ? `تم اعتماد الفاتورة رقم ${invoice.invoiceNumber} بنجاح وأصبحت متاحة للعميل`
          : `Invoice ${invoice.invoiceNumber} confirmed successfully. It is now published to customer portal.`
      )

      if (onStatusUpdated) onStatusUpdated(data.invoice)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm invoice")
    } finally {
      setConfirming(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/admin/invoices/${invoice._id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to cancel invoice")
      }

      toast.success(
        isAr ? `تم إلغاء الفاتورة ${invoice.invoiceNumber}` : `Invoice ${invoice.invoiceNumber} has been cancelled.`
      )

      setShowCancelPrompt(false)
      if (onStatusUpdated) onStatusUpdated(data.invoice)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel invoice")
    } finally {
      setCancelling(false)
    }
  }

  const handleDownloadPdf = () => {
    window.open(`/api/admin/invoices/${invoice._id}/pdf?type=${docType}&t=${Date.now()}`, "_blank")
  }

  const handlePrint = () => {
    window.open(`/api/admin/invoices/${invoice._id}/pdf?type=${docType}&t=${Date.now()}`, "_blank")
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
                {/* Header Ribbon */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center gap-3">
                    <AdminInvoiceStatusBadge status={invoice.status} />
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getDocumentTypeMeta(invoice.documentType).badgeBg} ${getDocumentTypeMeta(invoice.documentType).badgeText}`}>
                      {isAr ? getDocumentTypeMeta(invoice.documentType).shortLabelAr : getDocumentTypeMeta(invoice.documentType).shortLabelEn}
                    </span>
                    <div>
                      <h3 className="text-lg font-black font-mono text-slate-900 dark:text-white">
                        {invoice.invoiceNumber}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {invoice.customerSnapshot?.companyName || invoice.customerId?.companyName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Document Type Selector for export */}
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 text-xs shadow-xs">
                      <button
                        type="button"
                        onClick={() => setDocType("statement")}
                        className={`px-2 py-1 rounded-md transition-all font-semibold ${
                          docType === "statement"
                            ? "bg-primary-600 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                        }`}
                        title={isAr ? "تصدير ككشف حساب" : "Export as Statement"}
                      >
                        {isAr ? "كشف حساب" : "Statement"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocType("invoice")}
                        className={`px-2 py-1 rounded-md transition-all font-semibold ${
                          docType === "invoice"
                            ? "bg-primary-600 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                        }`}
                        title={isAr ? "تصدير كفاتورة" : "Export as Invoice"}
                      >
                        {isAr ? "فاتورة" : "Invoice"}
                      </button>
                      {(canIssueTaxInvoice || docType === "tax_invoice") && (
                        <button
                          type="button"
                          onClick={() => setDocType("tax_invoice")}
                          className={`px-2 py-1 rounded-md transition-all font-semibold ${
                            docType === "tax_invoice"
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                          }`}
                          title={isAr ? "تصدير كفاتورة ضريبية معتمدة" : "Export as Tax Invoice"}
                        >
                          {isAr ? "ضريبية" : "Tax"}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={isAr ? "طباعة" : "Print"}
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={isAr ? "تحميل PDF" : "Download PDF"}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                  {/* Draft Notice Banner */}
                  {isDraft && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          {isAr ? "فاتورة مسودة غير معتمدة (داخلية فقط)" : "Internal Draft Invoice (Pending Confirmation)"}
                        </h4>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          {isAr
                            ? "هذه الفاتورة مخفية تماماً عن العميل ولا يمكن إرسالها بالبريد حتى يتم مراجعتها والضغط على 'اعتماد الفاتورة'."
                            : "This invoice is strictly hidden from the customer portal and cannot be emailed until reviewed and confirmed."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Parties & Reference Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                    <div>
                      <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        {isAr ? "بيانات العميل المستهدف" : "Billed To Client"}
                      </span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{invoice.customerSnapshot?.companyName || invoice.customerId?.companyName}</span>
                        {!invoice.customerId && (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 rounded">
                            {isAr ? "عميل خارجي" : "External Client"}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {invoice.customerSnapshot?.address || invoice.customerId?.address || "Egypt"}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        Email: {invoice.customerSnapshot?.contactEmail || invoice.customerId?.contactEmail}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        CR: {invoice.customerSnapshot?.commercialRegisterNumber || invoice.customerId?.commercialRegisterNumber || "N/A"}
                      </p>
                    </div>

                    <div>
                      <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        {isAr ? "معلومات الفاتورة والشحنة" : "Invoice & Shipment Information"}
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{isAr ? "تاريخ الإصدار:" : "Issue Date:"} {invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : "-"}</span>
                      </p>
                      <p className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{isAr ? "تاريخ الاستحقاق:" : "Due Date:"} {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "-"}</span>
                      </p>
                      {(invoice.shipmentSnapshot || invoice.relatedRequestId) && (
                        <p className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5 font-mono">
                          <Ship className="w-3.5 h-3.5 text-primary-500" />
                          <span>{isAr ? "رقم الشحنة:" : "Tracking Ref:"} {invoice.shipmentSnapshot?.trackingNumber || invoice.relatedRequestId?.trackingNumber}</span>
                        </p>
                      )}
                      {invoice.shipmentSnapshot?.complianceNumber && (
                        <p className="text-slate-700 dark:text-slate-300 font-mono">
                          <span>ACID: {invoice.shipmentSnapshot.complianceNumber}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left rtl:text-right text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-bold">
                        <tr>
                          <th className="px-4 py-2.5">{isAr ? "الوصف" : "Description"}</th>
                          <th className="px-4 py-2.5 text-center">{isAr ? "الكمية" : "Qty"}</th>
                          <th className="px-4 py-2.5 text-right rtl:text-left">{isAr ? "سعر الوحدة" : "Unit Price"}</th>
                          <th className="px-4 py-2.5 text-right rtl:text-left">{isAr ? "الإجمالي" : "Total"}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {invoice.items?.map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{it.description}</td>
                            <td className="px-4 py-2.5 text-center font-mono">{it.quantity}</td>
                            <td className="px-4 py-2.5 text-right rtl:text-left font-mono">
                              {Number(it.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 text-right rtl:text-left font-bold font-mono">
                              {Number(it.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financials Summary */}
                  <div className="flex justify-end">
                    <div className="w-full max-w-xs space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex justify-between">
                        <span>{isAr ? "المجموع الفرعي:" : "Subtotal:"}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {invoice.subtotal?.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                        </span>
                      </div>
                      {invoice.additionalCharges > 0 && (
                        <div className="flex justify-between">
                          <span>{isAr ? "رسوم إضافية:" : "Additional Charges:"}</span>
                          <span className="font-mono font-semibold">
                            +{invoice.additionalCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                          </span>
                        </div>
                      )}
                      {invoice.discount > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>{isAr ? "خصم:" : "Discount:"}</span>
                          <span className="font-mono font-semibold">
                            -{invoice.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>{isAr ? `ضريبة القيمة المضافة (${invoice.taxRate || 14}%):` : `VAT (${invoice.taxRate || 14}%):`}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          +{invoice.tax?.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                        <span>{isAr ? "المبلغ المستحق:" : "Total Amount:"}</span>
                        <span className="font-mono text-primary-600 dark:text-primary-400">
                          {invoice.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Public & Internal Notes */}
                  {(invoice.notes || invoice.internalNotes) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                      {invoice.notes && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            {isAr ? "ملاحظات الفاتورة للعميل:" : "Public Client Notes:"}
                          </span>
                          <p className="text-slate-600 dark:text-slate-400">{invoice.notes}</p>
                        </div>
                      )}

                      {invoice.internalNotes && (
                        <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/60">
                          <span className="font-bold text-amber-800 dark:text-amber-400 block mb-1">
                            {isAr ? "ملاحظات داخلية للموظفين (سرية):" : "Internal Staff Notes (Confidential):"}
                          </span>
                          <p className="text-amber-900/80 dark:text-amber-300/80">{invoice.internalNotes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cancellation Prompt */}
                  {showCancelPrompt && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-3">
                      <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300">
                        {isAr ? "تأكيد إلغاء الفاتورة" : "Confirm Invoice Cancellation"}
                      </h4>
                      <input
                        type="text"
                        placeholder={isAr ? "أدخل سبب الإلغاء..." : "Enter reason for cancellation..."}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-lg text-slate-900 dark:text-white"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCancelPrompt(false)}
                          className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                        >
                          {isAr ? "تراجع" : "Back"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={cancelling}
                          className="px-4 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-md"
                        >
                          {cancelling ? (isAr ? "جاري الإلغاء..." : "Cancelling...") : (isAr ? "تأكيد الإلغاء" : "Confirm Cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2">
                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => setShowCancelPrompt(!showCancelPrompt)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{isAr ? "إلغاء الفاتورة" : "Cancel Invoice"}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isDraft ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenEdit) onOpenEdit(invoice._id)
                            onClose()
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-xl shadow-sm"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isAr ? "تعديل المسودة" : "Edit Draft"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleConfirm}
                          disabled={confirming}
                          className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all disabled:opacity-50"
                        >
                          {confirming ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>{isAr ? "جاري الاعتماد..." : "Confirming..."}</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-4 h-4" />
                              <span>{isAr ? "اعتماد الفاتورة (نشر للعميل)" : "Confirm Invoice"}</span>
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenSend) onOpenSend(invoice)
                            onClose()
                          }}
                          disabled={isCancelled}
                          className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-md disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isAr ? "إرسال للعميل بالبريد" : "Send to Customer"}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

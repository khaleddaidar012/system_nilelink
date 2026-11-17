"use client"

import { useState, useEffect, Fragment, useMemo } from "react"
import { useLocale } from "next-intl"
import { Dialog, Transition } from "@headlessui/react"
import { X, Building2, AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { InvoiceLineItemsEditor } from "./InvoiceLineItemsEditor"
import { InvoiceFinancialSummaryBox } from "./InvoiceFinancialSummaryBox"
import { calculateInvoiceTotals, RawInvoiceItemInput } from "@/lib/engine/invoice-calculator"

interface EditInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  invoiceId: string
  onSuccess?: (invoice: any) => void
}

export function EditInvoiceModal({
  isOpen,
  onClose,
  invoiceId,
  onSuccess,
}: EditInvoiceModalProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const [loading, setLoading] = useState(true)
  const [invoiceData, setInvoiceData] = useState<any>(null)
  const [isLocked, setIsLocked] = useState(false)

  // Form states
  const [documentType, setDocumentType] = useState<"statement" | "invoice" | "tax_invoice">("statement")
  const [canIssueTaxInvoice, setCanIssueTaxInvoice] = useState(false)
  const [currency, setCurrency] = useState("EGP")
  const [issueDate, setIssueDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [items, setItems] = useState<RawInvoiceItemInput[]>([])
  const [additionalCharges, setAdditionalCharges] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [taxRate, setTaxRate] = useState(14)
  const [notes, setNotes] = useState("")
  const [internalNotes, setInternalNotes] = useState("")

  const [submitting, setSubmitting] = useState(false)

  // Fetch user permissions
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

  // Load existing invoice
  useEffect(() => {
    if (isOpen && invoiceId) {
      setLoading(true)
      setIsLocked(false)
      fetch(`/api/admin/invoices/${invoiceId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.invoice) {
            const inv = data.invoice
            setInvoiceData(inv)
            if (inv.status !== "draft") {
              setIsLocked(true)
            }
            setDocumentType(inv.documentType || "statement")
            setCurrency(inv.currency || "EGP")
            setIssueDate(inv.issueDate ? new Date(inv.issueDate).toISOString().split("T")[0] : "")
            setDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "")
            setItems(
              inv.items?.length > 0
                ? inv.items.map((it: any) => ({
                    description: it.description,
                    quantity: it.quantity,
                    unitPrice: it.unitPrice,
                  }))
                : [{ description: "", quantity: 1, unitPrice: 0 }]
            )
            setAdditionalCharges(inv.additionalCharges || 0)
            setDiscount(inv.discount || 0)
            setTaxRate(inv.taxRate !== undefined ? inv.taxRate : 14)
            setNotes(inv.notes || "")
            setInternalNotes(inv.internalNotes || "")
          } else {
            toast.error(data.error || "Failed to load invoice details")
            onClose()
          }
        })
        .catch(() => {
          toast.error("Failed to load invoice details")
          onClose()
        })
        .finally(() => setLoading(false))
    }
  }, [isOpen, invoiceId, onClose])

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

    if (isLocked) {
      toast.error(isAr ? "لا يمكن تعديل الفاتورة بعد اعتمادها" : "Confirmed invoices cannot be modified.")
      return
    }

    if (!calculation.isValid) {
      toast.error(calculation.errors[0] || "Invalid line items")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        documentType,
        currency,
        issueDate,
        dueDate,
        taxRate,
        discount,
        additionalCharges,
        notes,
        internalNotes,
        items: calculation.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      }

      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update draft invoice")
      }

      toast.success(isAr ? "تم تحديث مسودة الفاتورة بنجاح" : "Draft invoice updated successfully.")
      if (onSuccess) onSuccess(data.invoice)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "An error occurred while updating draft")
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
                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <Dialog.Title as="h3" className="text-lg font-bold text-slate-900 dark:text-white">
                        {isAr ? `تعديل مسودة الفاتورة: ${invoiceData?.invoiceNumber || ""}` : `Edit Draft Invoice: ${invoiceData?.invoiceNumber || ""}`}
                      </Dialog.Title>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {invoiceData?.customerId?.companyName}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {loading ? (
                  <div className="py-24 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-3" />
                    <p className="text-sm text-slate-500">{isAr ? "جاري تحميل بيانات الفاتورة..." : "Loading invoice data..."}</p>
                  </div>
                ) : isLocked ? (
                  <div className="p-8 text-center space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      {isAr ? "لا يمكن تعديل هذه الفاتورة" : "Invoice is Locked"}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                      {isAr
                        ? `هذه الفاتورة في حالة "${invoiceData.status}" وتم تجميد بياناتها لأسباب المحاسبة والقانون. لا يمكن تعديل الفواتير المعتمدة.`
                        : `This invoice is already in '${invoiceData.status}' status and has been frozen for legal accounting compliance. Only draft invoices can be modified.`}
                    </p>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800"
                    >
                      {isAr ? "إغلاق" : "Close"}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                    {/* Document Type Selector */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {isAr ? "نوع المستند المحاسبي" : "Document Financial Type"}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                          <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 block mt-0.5">
                            {isAr ? "المستند الافتراضي" : "Standard internal"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDocumentType("invoice")}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                            documentType === "invoice"
                              ? "border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 shadow-xs"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <span className="block">{isAr ? "فاتورة" : "Invoice"}</span>
                          <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 block mt-0.5">
                            {isAr ? "مطالبة تجارية عامة" : "Commercial bill"}
                          </span>
                        </button>

                        {(canIssueTaxInvoice || documentType === "tax_invoice") && (
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
                          <option value="EGP">EGP — Egyptian Pound</option>
                          <option value="USD">USD — US Dollar</option>
                          <option value="EUR">EUR — Euro</option>
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

                    {/* Financial Summary */}
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

                    {/* Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {isAr ? "ملاحظات الفاتورة للعميل" : "Public Client Notes"}
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          {isAr ? "ملاحظات داخلية للموظفين (سرية)" : "Internal Staff Notes (Private)"}
                        </label>
                        <textarea
                          rows={2}
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                      >
                        {isAr ? "إلغاء" : "Cancel"}
                      </button>

                      <button
                        type="submit"
                        disabled={submitting || !calculation.isValid}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-md disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{isAr ? "جاري حفظ التعديلات..." : "Saving Changes..."}</span>
                          </>
                        ) : (
                          <span>{isAr ? "حفظ تعديلات المسودة" : "Save Draft Changes"}</span>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

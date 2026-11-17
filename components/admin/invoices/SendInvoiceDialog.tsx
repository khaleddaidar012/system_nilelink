"use client"

import { useState, useRef, Fragment } from "react"
import { useLocale } from "next-intl"
import { Dialog, Transition } from "@headlessui/react"
import { Mail, Send, X, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface SendInvoiceDialogProps {
  isOpen: boolean
  onClose: () => void
  invoice: any
  onSuccess?: () => void
}

export function SendInvoiceDialog({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: SendInvoiceDialogProps) {
  const locale = useLocale()
  const isAr = locale === "ar"
  const [sending, setSending] = useState(false)
  const deliveryKey = useRef<{ invoiceId: string; key: string } | null>(null)

  if (!invoice) return null

  const customer = invoice.customerSnapshot || invoice.customerId
  const recipientEmail = customer?.contactEmail || ""

  const handleSend = async () => {
    if (!recipientEmail) {
      toast.error(isAr ? "العميل لا يمتلك بريد إلكتروني مسجل" : "Customer does not have a registered email.")
      return
    }

    setSending(true)
    if (!deliveryKey.current || deliveryKey.current.invoiceId !== invoice._id) deliveryKey.current = { invoiceId: invoice._id, key: crypto.randomUUID() }
    try {
      const res = await fetch(`/api/admin/invoices/${invoice._id}/send`, {
        method: "POST",
        headers: { "Idempotency-Key": deliveryKey.current.key },
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send invoice")
      }

      if (data.queued) toast.info(isAr ? "تم وضع الفاتورة في انتظار الإرسال؛ لم يتم إرسال بريد بعد" : "Invoice queued; email has not been sent yet")
      else toast.success(
        isAr
          ? `تم إرسال الفاتورة ${invoice.invoiceNumber} مع ملف PDF بنجاح إلى ${recipientEmail}`
          : `Invoice ${invoice.invoiceNumber} with attached PDF sent successfully to ${recipientEmail}`
      )
      deliveryKey.current = null

      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to send invoice")
    } finally {
      setSending(false)
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
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all w-full max-w-md dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white my-8 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-primary-600">
                    <Mail className="w-5 h-5" />
                    <Dialog.Title as="h3" className="text-base font-bold text-slate-900 dark:text-white">
                      {isAr ? "إرسال الفاتورة للعميل" : "Send Invoice Directly"}
                    </Dialog.Title>
                  </div>
                  <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400">
                  <p>
                    {isAr
                      ? "سيقوم النظام بتوليد ملف PDF الرسمي وإرساله تلقائياً في مرفق بالبريد الإلكتروني إلى العميل:"
                      : "The system will generate the official commercial A4 PDF and attach it to an email sent directly to:"}
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                      <span>{customer?.companyName}</span>
                      <span className="font-mono text-primary-600">{invoice.invoiceNumber}</span>
                    </div>
                    <div className="font-mono text-slate-700 dark:text-slate-300">
                      {recipientEmail || (isAr ? "(لا يوجد بريد مسجل)" : "(No email registered)")}
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 text-[11px]">
                      <span>{isAr ? "المبلغ الإجمالي:" : "Total Amount:"}</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {invoice.totalAmount?.toLocaleString()} {invoice.currency}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/60 flex items-center gap-2 text-blue-700 dark:text-blue-300 text-[11px]">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>
                      {isAr
                        ? "يتم إرفاق مستند A4 PDF عالي الجودة مع رابط إلكتروني مباشر للمعاينة."
                        : "Includes high-res A4 PDF attachment and direct live preview link."}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={sending}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    {isAr ? "إلغاء" : "Cancel"}
                  </button>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !recipientEmail}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-md disabled:opacity-50"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{isAr ? "جاري التوليد والإرسال..." : "Generating & Sending..."}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{isAr ? "إرسال الفاتورة الآن" : "Send Invoice Now"}</span>
                      </>
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

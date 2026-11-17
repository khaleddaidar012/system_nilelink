"use client"

import { useState, useRef, Fragment } from "react"
import { useLocale } from "next-intl"
import { Dialog, Transition } from "@headlessui/react"
import { X, Send, Mail, Loader2, FileText } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { toast } from "sonner"

interface SendStatementDialogProps {
  isOpen: boolean
  onClose: () => void
  customerId: string
  customerName: string
  defaultEmail: string
  fromDate?: string
  toDate?: string
  closingBalance: number
  currency: string
}

export function SendStatementDialog({
  isOpen,
  onClose,
  customerId,
  customerName,
  defaultEmail,
  fromDate,
  toDate,
  closingBalance,
  currency,
}: SendStatementDialogProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const [recipientEmail, setRecipientEmail] = useState(defaultEmail || "")
  const [customMessage, setCustomMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const deliveryKey = useRef<{ scope: string; key: string } | null>(null)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipientEmail || !recipientEmail.includes("@")) {
      toast.error(isAr ? "يرجى إدخال بريد إلكتروني صالح" : "Please enter a valid email address")
      return
    }

    setLoading(true)
    const scope = JSON.stringify([customerId, fromDate, toDate, recipientEmail, customMessage.trim(), currency])
    if (deliveryKey.current?.scope !== scope) deliveryKey.current = { scope, key: crypto.randomUUID() }
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/statement/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": deliveryKey.current.key },
        body: JSON.stringify({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          recipientEmail,
          customMessage: customMessage.trim() || undefined,
          currency,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send email")
      }

      if (data.queued) toast.info(isAr ? "تم وضع كشف الحساب في انتظار الإرسال؛ لم يتم إرسال بريد بعد" : "Statement queued; email has not been sent yet")
      else toast.success(
        isAr
          ? `تم إرسال كشف الحساب بنجاح إلى ${recipientEmail}`
          : `Statement PDF emailed successfully to ${recipientEmail}`
      )
      deliveryKey.current = null
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to send statement email")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 text-left shadow-2xl transition-all border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <Dialog.Title as="h3" className="text-base font-bold text-slate-900 dark:text-white">
                        {isAr ? "إرسال كشف الحساب للعميل" : "Email Statement to Customer"}
                      </Dialog.Title>
                      <p className="text-xs text-slate-500">{customerName}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSend} className="mt-5 space-y-4 text-xs">
                  {/* Summary preview bar */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>{isAr ? "فترة الكشف:" : "Period:"}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {fromDate || isAr ? "البداية" : "Start"} → {toDate || isAr ? "الآن" : "Present"}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>{isAr ? "صافي الرصيد الختامي:" : "Closing Balance:"}</span>
                      <span className="font-mono font-bold text-primary-600 dark:text-primary-400">
                        {Number(closingBalance).toLocaleString()} {currency}
                      </span>
                    </div>
                  </div>

                  {/* Recipient Email */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? "البريد الإلكتروني للمستلم:" : "Recipient Email Address:"}
                    </label>
                    <input
                      type="email"
                      required
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="client@company.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Custom Message */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? "ملاحظة أو رسالة إضافية (اختياري):" : "Custom Message (Optional):"}
                    </label>
                    <textarea
                      rows={3}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder={
                        isAr
                          ? "يرجى مراجعة الرصيد المستحق وسداد الدفعة خلال 7 أيام عمل..."
                          : "Please review the attached statement and remit payment within 7 business days..."
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2 text-[11px] text-slate-500">
                    <FileText className="w-4 h-4 text-primary-500 shrink-0" />
                    <span>
                      {isAr
                        ? "سيتم إرفاق ملف كشف الحساب بصيغة PDF عالية الدقة تلقائياً مع الرسالة."
                        : "The official high-resolution statement PDF will be automatically attached."}
                    </span>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                      {isAr ? "إلغاء" : "Cancel"}
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-primary-600 font-bold text-white hover:bg-primary-700"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                          <span>{isAr ? "جاري الإرسال..." : "Sending..."}</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                          <span>{isAr ? "إرسال كشف الحساب" : "Send Statement"}</span>
                        </>
                      )}
                    </Button>
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

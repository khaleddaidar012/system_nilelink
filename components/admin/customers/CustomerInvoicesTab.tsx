"use client"

import { useState, useEffect, useCallback } from "react"
import { useLocale } from "next-intl"
import { AdminInvoiceStatusBadge } from "@/components/admin/invoices/AdminInvoiceStatusBadge"
import { CreateInvoiceModal } from "@/components/admin/invoices/CreateInvoiceModal"
import { EditInvoiceModal } from "@/components/admin/invoices/EditInvoiceModal"
import { InvoiceReviewDrawer } from "@/components/admin/invoices/InvoiceReviewDrawer"
import { SendInvoiceDialog } from "@/components/admin/invoices/SendInvoiceDialog"
import { Plus, Eye, Edit3, Send, Download, Trash2, Calendar, Ship, Building2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { getDocumentTypeMeta } from "@/lib/services/document-type-helper"

interface CustomerInvoicesTabProps {
  customerId: string
  customerName: string
}

export function CustomerInvoicesTab({ customerId, customerName }: CustomerInvoicesTabProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const [invoices, setInvoices] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>({
    totalInvoicedAmount: 0,
    totalPaidAmount: 0,
    totalRemainingAmount: 0,
    totalDraftCount: 0,
  })
  const [loading, setLoading] = useState(true)

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [sendingInvoice, setSendingInvoice] = useState<any | null>(null)

  const fetchCustomerInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/invoices?customerId=${customerId}&limit=100`)
      const data = await res.json()
      if (data.success) {
        setInvoices(data.invoices || [])
        if (data.metrics) setMetrics(data.metrics)
      }
    } catch {
      toast.error("Failed to load customer invoices")
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    fetchCustomerInvoices()
  }, [fetchCustomerInvoices])

  const handleDeleteDraft = async (invoice: any) => {
    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف مسودة الفاتورة ${invoice.invoiceNumber}؟`
      : `Delete draft invoice ${invoice.invoiceNumber}?`
    if (!window.confirm(confirmMsg)) return

    try {
      const res = await fetch(`/api/admin/invoices/${invoice._id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete draft")
      toast.success(isAr ? "تم حذف المسودة" : "Draft deleted")
      fetchCustomerInvoices()
    } catch (err: any) {
      toast.error(err.message || "Failed to delete draft")
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Action & Metrics Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isAr ? "إجمالي الفواتير" : "Total Invoiced"}
            </span>
            <span className="text-base font-black font-mono text-slate-900 dark:text-white">
              {(metrics.totalInvoicedAmount || 0).toLocaleString()} EGP
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isAr ? "المحصل" : "Total Paid"}
            </span>
            <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
              {(metrics.totalPaidAmount || 0).toLocaleString()} EGP
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isAr ? "المتبقي" : "Outstanding Due"}
            </span>
            <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400">
              {(metrics.totalRemainingAmount || 0).toLocaleString()} EGP
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isAr ? "مسودات للمراجعة" : "Drafts Pending"}
            </span>
            <span className="text-base font-black font-mono text-purple-600 dark:text-purple-400">
              {metrics.totalDraftCount || 0}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? "إنشاء فاتورة لهذا العميل" : "Create Invoice for Client"}</span>
        </button>
      </div>

      {/* Invoices List Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? "سجل فواتير العميل" : "Customer Commercial Invoices"}
          </h4>
          <button
            type="button"
            onClick={fetchCustomerInvoices}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary-500" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500">
              {isAr ? "لا توجد فواتير مسجلة لهذا العميل بعد." : "No invoices have been created for this customer yet."}
            </p>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="text-xs font-bold text-primary-600 hover:underline"
            >
              {isAr ? "+ إصدار أول فاتورة تجارية" : "+ Issue first commercial invoice"}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
                  <th className="px-4 py-3">{isAr ? "الشحنة المرتبطة" : "Linked Shipment"}</th>
                  <th className="px-4 py-3">{isAr ? "تاريخ الإصدار / المهلة" : "Issue / Due Date"}</th>
                  <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "المبلغ المستحق" : "Amount"}</th>
                  <th className="px-4 py-3 text-center">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv) => {
                  const isDraft = inv.status === "draft"
                  const tracking = inv.shipmentSnapshot?.trackingNumber || inv.relatedRequestId?.trackingNumber

                  return (
                    <tr
                      key={inv._id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                        <div>{inv.invoiceNumber}</div>
                        <div className="mt-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${getDocumentTypeMeta(inv.documentType).badgeBg} ${getDocumentTypeMeta(inv.documentType).badgeText}`}>
                            {isAr ? getDocumentTypeMeta(inv.documentType).shortLabelAr : getDocumentTypeMeta(inv.documentType).shortLabelEn}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        {tracking ? (
                          <span className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-semibold">
                            <Ship className="w-3 h-3" />
                            {tracking}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">{isAr ? "فوترة مباشرة" : "Direct"}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : "-"}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {isAr ? "الاستحقاق: " : "Due: "}
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right rtl:text-left font-mono font-bold text-slate-900 dark:text-white">
                        {inv.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })} {inv.currency}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <AdminInvoiceStatusBadge status={inv.status} />
                      </td>

                      <td
                        className="px-4 py-3 text-right rtl:text-left"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1.5 text-slate-500 hover:text-primary-600 rounded-lg"
                            title={isAr ? "معاينة" : "Review"}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => setEditingInvoiceId(inv._id)}
                              className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg"
                              title={isAr ? "تعديل" : "Edit"}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {!isDraft && inv.status !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => setSendingInvoice(inv)}
                              className="p-1.5 text-slate-500 hover:text-purple-600 rounded-lg"
                              title={isAr ? "إرسال" : "Send"}
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}

                          <a
                            href={`/api/admin/invoices/${inv._id}/pdf?t=${new Date(inv.updatedAt || inv.createdAt || Date.now()).getTime()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg"
                            title={isAr ? "تحميل PDF" : "Download PDF"}
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(inv)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                              title={isAr ? "حذف المسودة" : "Delete Draft"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialogs */}
      {isCreateOpen && (
        <CreateInvoiceModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          initialCustomerId={customerId}
          initialCustomerName={customerName}
          onSuccess={() => fetchCustomerInvoices()}
        />
      )}

      {editingInvoiceId && (
        <EditInvoiceModal
          isOpen={!!editingInvoiceId}
          onClose={() => setEditingInvoiceId(null)}
          invoiceId={editingInvoiceId}
          onSuccess={() => fetchCustomerInvoices()}
        />
      )}

      {selectedInvoice && (
        <InvoiceReviewDrawer
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          invoice={selectedInvoice}
          onStatusUpdated={() => fetchCustomerInvoices()}
          onOpenEdit={(id) => setEditingInvoiceId(id)}
          onOpenSend={(inv) => setSendingInvoice(inv)}
        />
      )}

      {sendingInvoice && (
        <SendInvoiceDialog
          isOpen={!!sendingInvoice}
          onClose={() => setSendingInvoice(null)}
          invoice={sendingInvoice}
          onSuccess={() => fetchCustomerInvoices()}
        />
      )}
    </div>
  )
}

"use client"

import { useLocale } from "next-intl"
import { useRouter } from "@/navigation"
import { AdminInvoiceStatusBadge } from "./AdminInvoiceStatusBadge"
import { Eye, Edit3, Send, Download, Trash2, ShieldCheck, Ship, Calendar, Building2 } from "lucide-react"
import { getDocumentTypeMeta } from "@/lib/services/document-type-helper"

interface AdminInvoicesTableProps {
  invoices: any[]
  loading: boolean
  onSelectInvoice: (invoice: any) => void
  onEditDraft: (invoiceId: string) => void
  onSendInvoice: (invoice: any) => void
  onDeleteDraft: (invoice: any) => void
}

export function AdminInvoicesTable({
  invoices,
  loading,
  onSelectInvoice,
  onEditDraft,
  onSendInvoice,
  onDeleteDraft,
}: AdminInvoicesTableProps) {
  const locale = useLocale()
  const isAr = locale === "ar"
  const router = useRouter()
  const selectInvoice = (invoice: any) => (invoice.shipmentRecordId || invoice.requestAccounting)
    ? router.push(`/admin/shipment-invoices/${invoice._id}`) : onSelectInvoice(invoice)

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (invoices.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
          <Building2 className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          {isAr ? "لا توجد فواتير مطابقة" : "No invoices found"}
        </h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          {isAr
            ? "لم يتم العثور على فواتير تطابق معايير البحث الحالية أو لم يتم إنشاء فواتير بعد."
            : "No invoices matched your current search filters, or no invoices have been generated yet."}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left rtl:text-right text-xs">
        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="px-4 py-3">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
            <th className="px-4 py-3">{isAr ? "العميل" : "Customer"}</th>
            <th className="px-4 py-3">{isAr ? "الشحنة / المرجع" : "Shipment / Ref"}</th>
            <th className="px-4 py-3">{isAr ? "تاريخ الإصدار والمهلة" : "Issue / Due Date"}</th>
            <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "المبلغ المستحق" : "Amount"}</th>
            <th className="px-4 py-3 text-center">{isAr ? "الحالة" : "Status"}</th>
            <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "الإجراءات" : "Actions"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {invoices.map((inv) => {
            const isDraft = inv.status === "draft"
            const customerName = inv.customerSnapshot?.companyName || inv.customerId?.companyName || "N/A"
            const tracking = inv.shipmentSnapshot?.trackingNumber || inv.relatedRequestId?.trackingNumber

            return (
              <tr
                key={inv._id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                onClick={() => selectInvoice(inv)}
              >
                {/* Invoice Number & Document Type */}
                <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                  <div>{inv.referenceNumber || inv.invoiceNumber}</div>{inv.referenceNumber && inv.referenceNumber !== inv.invoiceNumber && <div className="text-xs text-slate-500">{inv.invoiceNumber}</div>}
                  <div className="mt-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${getDocumentTypeMeta(inv.documentType).badgeBg} ${getDocumentTypeMeta(inv.documentType).badgeText}`}>
                      {isAr ? getDocumentTypeMeta(inv.documentType).shortLabelAr : getDocumentTypeMeta(inv.documentType).shortLabelEn}
                    </span>
                  </div>
                </td>

                {/* Customer */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white truncate max-w-[220px]">
                    <span className="truncate">{customerName}</span>
                    {!inv.customerId && (
                      <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 rounded">
                        {isAr ? "خارجي" : "External"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                    {inv.customerSnapshot?.contactEmail || inv.customerId?.contactEmail || inv.customerSnapshot?.contactPhone || ""}
                  </div>
                </td>

                {/* Shipment */}
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

                {/* Dates */}
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

                {/* Amount */}
                <td className="px-4 py-3 text-right rtl:text-left">
                  <div className="font-mono font-black text-slate-900 dark:text-white text-sm">
                    {inv.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">
                    {inv.currency || "EGP"}
                  </div>
                </td>

                {/* Status Badge */}
                <td className="px-4 py-3 text-center">
                  <AdminInvoiceStatusBadge status={inv.status} />
                </td>

                {/* Actions */}
                <td
                  className="px-4 py-3 text-right rtl:text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1">
                    {/* View Details */}
                    <button
                      type="button"
                      onClick={() => selectInvoice(inv)}
                      className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title={isAr ? "معاينة الفاتورة" : "Review Invoice"}
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Edit if Draft */}
                    {isDraft && !(inv.shipmentRecordId || inv.requestAccounting) && (
                      <button
                        type="button"
                        onClick={() => onEditDraft(inv._id)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors"
                        title={isAr ? "تعديل المسودة" : "Edit Draft"}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Send if confirmed or sent */}
                    {!isDraft && inv.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => onSendInvoice(inv)}
                        className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition-colors"
                        title={isAr ? "إرسال بالبريد" : "Send Email"}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}

                    {/* Download PDF */}
                    {(!(inv.shipmentRecordId || inv.requestAccounting) || !isDraft) && <a
                      href={`/api/admin/invoices/${inv._id}/pdf?t=${new Date(inv.updatedAt || inv.createdAt || Date.now()).getTime()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                      title={isAr ? "تحميل PDF" : "Download PDF"}
                    >
                      <Download className="w-4 h-4" />
                    </a>}

                    {/* Delete draft */}
                    {isDraft && !(inv.shipmentRecordId || inv.requestAccounting) && (
                      <button
                        type="button"
                        onClick={() => onDeleteDraft(inv)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
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
  )
}

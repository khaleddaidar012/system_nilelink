"use client"

import { useTranslations, useLocale } from "next-intl"
import { format } from "date-fns"
import { InvoiceStatusBadge } from "./InvoiceStatusBadge"
import { MapPin, Phone, Mail, Building2, Link as LinkIcon, Download, Printer, Clock, Ship, Check } from "lucide-react"
import { toast } from "sonner"
import { InvoiceBreakdown } from "@/components/shared/InvoiceBreakdown"

interface InvoiceLivePreviewProps {
  invoice: any
  payments: any[]
}

export function InvoiceLivePreview({ invoice, payments }: InvoiceLivePreviewProps) {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"

  if (!invoice) return null

  const percentage =
    invoice.totalAmount > 0
      ? Math.min(100, Math.round(((invoice.paidAmount || 0) / invoice.totalAmount) * 100))
      : 0

  const customer = invoice.customerSnapshot || invoice.customerId || {}
  const issuer = invoice.issuerSnapshot || {
    legalName: "Nile Link Logistics S.A.E",
    address: "Entrance to Al-Ananiyah Road, opposite the Ice Factory, Damietta, Egypt",
    taxId: "",
    phone: "01000018549",
    email: "info@nilelinklogistics.com",
    bankName: "Commercial International Bank (CIB)",
    bankAccountName: "Nile Link Logistics SAE",
    bankIban: "EG3800100000000001234567890",
    bankSwift: "CIBEEGCX",
  }
  const shipment = invoice.shipmentSnapshot || invoice.relatedRequestId || null

  const handleCopyLink = () => {
    if (typeof window !== "undefined" && invoice.token) {
      const publicUrl = `${window.location.origin}/invoice/${invoice.token}`
      navigator.clipboard.writeText(publicUrl)
      toast.success(isAr ? "تم نسخ الرابط المباشر للفاتورة بنجاح" : "Invoice direct link copied to clipboard.")
    }
  }

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print()
    }
  }

  const handleDownloadPdf = () => {
    const downloadUrl = `/api/portal/invoices/${invoice._id}/pdf`
    window.open(downloadUrl, "_blank")
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      {/* Top Actions & Summary (Hidden during Print) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-2xl border border-secondary-200 shadow-sm dark:bg-secondary-900 dark:border-secondary-800 print:hidden">
        <div className="flex items-center gap-4 mb-4 sm:mb-0">
          <InvoiceStatusBadge status={invoice.status} />
          <div className="text-sm font-bold text-secondary-900 dark:text-white">
            {percentage}% {t("portal.financials.metrics.paid") || "Paid"}
          </div>
          <div className="hidden sm:block w-32 h-2 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                percentage === 100 ? "bg-emerald-500" : percentage > 0 ? "bg-blue-500" : "bg-transparent"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-secondary-900 shadow-sm ring-1 ring-inset ring-secondary-300 hover:bg-secondary-50 dark:bg-secondary-800 dark:text-white dark:ring-secondary-700 cursor-pointer"
          >
            <LinkIcon className="h-4 w-4 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5 text-secondary-500" />
            <span className="hidden sm:inline">{t("portal.financials.actions.copyLink") || "Copy Link"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-secondary-900 shadow-sm ring-1 ring-inset ring-secondary-300 hover:bg-secondary-50 dark:bg-secondary-800 dark:text-white dark:ring-secondary-700 cursor-pointer"
          >
            <Printer className="h-4 w-4 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5 text-secondary-500" />
            <span className="hidden sm:inline">{t("portal.financials.actions.print") || "Print"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-500 cursor-pointer"
          >
            <Download className="h-4 w-4 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5" />
            <span className="hidden sm:inline">{t("portal.financials.actions.downloadPdf") || "Download PDF"}</span>
          </button>
        </div>
      </div>

      {/* The Actual Invoice Document (A4 Printable Layout) */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none border border-slate-200 print:border-0 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white">
        {/* Header Ribbon */}
        <div className="h-3 w-full bg-primary-600"></div>

        <div className="p-8 sm:p-12 space-y-8">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row justify-between gap-8 border-b border-secondary-200 pb-8 dark:border-slate-800">
            <div>
              <h1 className="text-3xl font-black text-secondary-900 dark:text-white uppercase tracking-tight mb-2">
                INVOICE
              </h1>
              <p className="font-mono text-secondary-500 font-bold">{invoice.invoiceNumber}</p>
              {invoice.referenceNumber && invoice.referenceNumber !== invoice.invoiceNumber && <p className="mt-1 text-xs text-secondary-500">{isAr ? "المرجع" : "Reference"}: <bdi className="font-mono">{invoice.referenceNumber}</bdi></p>}

              <div className="mt-8 space-y-1">
                <p className="text-xs font-bold text-secondary-500 uppercase tracking-wider">Billed To:</p>
                <p className="text-base text-secondary-900 dark:text-white font-bold">{customer.companyName || "N/A"}</p>
                {customer.address && <p className="text-xs text-secondary-500 max-w-[280px]">{customer.address}</p>}
                {(customer.taxCardNumber || customer.commercialRegisterNumber) && (
                  <p className="text-xs text-secondary-500 font-mono">
                    Tax / CR: {customer.taxCardNumber || customer.commercialRegisterNumber}
                  </p>
                )}
                {customer.contactEmail && (
                  <p className="text-xs text-secondary-500 mt-2 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> {customer.contactEmail}
                  </p>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right rtl:sm:text-left">
              <div className="flex items-center sm:justify-end rtl:sm:justify-start gap-2 mb-4 text-primary-600">
                <Building2 className="h-8 w-8" />
                <span className="text-xl font-black tracking-tighter uppercase">{issuer.legalName || "NileLink Logistics"}</span>
              </div>

              <div className="space-y-1 text-xs text-secondary-500">
                <p className="font-semibold text-secondary-700 dark:text-secondary-300">{issuer.address}</p>
                {issuer.taxId ? <p>Tax / VAT ID: {issuer.taxId}</p> : null}
                <p className="flex items-center sm:justify-end rtl:sm:justify-start gap-1.5 mt-2">
                  <Phone className="w-3.5 h-3.5" /> {issuer.phone}
                </p>
                <p className="flex items-center sm:justify-end rtl:sm:justify-start gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> {issuer.email}
                </p>
              </div>
            </div>
          </div>

          {/* Key Metadata Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-secondary-200 dark:border-slate-800 text-xs">
            <div>
              <p className="font-bold text-secondary-400 uppercase tracking-wider mb-1">Issue Date</p>
              <p className="text-sm font-bold text-secondary-900 dark:text-white">
                {invoice.issueDate ? format(new Date(invoice.issueDate), "MMM dd, yyyy") : "-"}
              </p>
            </div>
            <div>
              <p className="font-bold text-secondary-400 uppercase tracking-wider mb-1">Due Date</p>
              <p className="text-sm font-bold text-secondary-900 dark:text-white">
                {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM dd, yyyy") : "-"}
              </p>
            </div>
            <div>
              <p className="font-bold text-secondary-400 uppercase tracking-wider mb-1">Shipment Reference</p>
              <p className="text-sm font-bold text-primary-600 dark:text-primary-400 font-mono">
                {shipment?.trackingNumber || (invoice.relatedRequestId ? "Linked" : "Direct")}
              </p>
              {shipment?.complianceNumber && (
                <p className="text-[10px] text-slate-400">ACID: {shipment.complianceNumber}</p>
              )}
            </div>
            <div>
              <p className="font-bold text-secondary-400 uppercase tracking-wider mb-1">Payment Status</p>
              <div className="mt-0.5">
                <InvoiceStatusBadge status={invoice.status} />
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="py-4">
            {invoice.groups?.length ? <InvoiceBreakdown groups={invoice.groups} currency={invoice.currency} ar={isAr} /> : <table className="w-full text-left rtl:text-right text-xs sm:text-sm">
              <thead className="bg-secondary-50 text-secondary-500 dark:bg-slate-800/80 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4 rounded-l-lg rtl:rounded-l-none rtl:rounded-r-lg">Description</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right rtl:text-left">Unit Price</th>
                  <th className="py-3 px-4 text-right rtl:text-left rounded-r-lg rtl:rounded-r-none rtl:rounded-l-lg">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 dark:divide-slate-800">
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-medium text-secondary-900 dark:text-white">{item.description}</td>
                      <td className="py-3.5 px-4 text-center text-secondary-600 dark:text-slate-300 font-mono">{item.quantity}</td>
                      <td className="py-3.5 px-4 text-right rtl:text-left text-secondary-600 dark:text-slate-300 font-mono">
                        {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right rtl:text-left font-bold text-secondary-900 dark:text-white font-mono">
                        {Number(item.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-secondary-400 italic">No line items provided.</td>
                  </tr>
                )}
              </tbody>
            </table>}
          </div>

          {/* Totals & Payment Instructions */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 border-t border-secondary-200 dark:border-slate-800 pt-8">
            <div className="w-full sm:w-1/2 space-y-4">
              <div>
                <p className="text-xs font-bold text-secondary-500 uppercase tracking-wider mb-2">
                  Payment Remittance Instructions
                </p>
                <div className="bg-secondary-50 dark:bg-slate-800/60 p-4 rounded-xl text-xs text-secondary-700 dark:text-slate-300 space-y-1.5 border border-slate-200 dark:border-slate-700">
                  <p><strong>Bank:</strong> {issuer.bankName || "Commercial International Bank (CIB)"}</p>
                  <p><strong>Beneficiary:</strong> {issuer.bankAccountName || issuer.legalName}</p>
                  <p><strong>IBAN:</strong> <span className="font-mono">{issuer.bankIban || "EG3800100000000001234567890"}</span></p>
                  <p><strong>SWIFT:</strong> <span className="font-mono">{issuer.bankSwift || "CIBEEGCX"}</span></p>
                  <p className="pt-2 text-secondary-400 italic text-[11px] border-t border-slate-200 dark:border-slate-700">
                    Please reference invoice number <strong>{invoice.invoiceNumber}</strong> in your wire advice.
                  </p>
                </div>
              </div>

              {invoice.notes && (
                <div className="text-xs text-slate-500 space-y-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Remarks:</span>
                  <p>{invoice.notes}</p>
                </div>
              )}
            </div>

            <div className="w-full sm:w-1/2 space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between text-secondary-600 dark:text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono font-semibold text-secondary-900 dark:text-white">
                  {Number(invoice.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                </span>
              </div>

              {invoice.additionalCharges > 0 && (
                <div className="flex justify-between text-secondary-600 dark:text-slate-400">
                  <span>Additional Charges:</span>
                  <span className="font-mono font-semibold">
                    +{Number(invoice.additionalCharges).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                  </span>
                </div>
              )}

              {invoice.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span className="font-mono font-semibold">
                    -{Number(invoice.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-secondary-600 dark:text-slate-400">
                <span>VAT ({invoice.taxRate ?? 14}%):</span>
                <span className="font-mono font-semibold text-secondary-900 dark:text-white">
                  +{Number(invoice.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                </span>
              </div>

              <div className="flex justify-between items-end pt-3 border-t border-secondary-200 dark:border-slate-800">
                <span className="text-sm font-bold text-secondary-900 dark:text-white uppercase">Grand Total Due:</span>
                <div className="text-right rtl:text-left">
                  <span className="text-2xl sm:text-3xl font-black text-primary-600 dark:text-primary-400 font-mono">
                    {Number(invoice.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="ml-1 rtl:ml-0 rtl:mr-1 text-xs font-bold text-secondary-500 uppercase">{invoice.currency}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Paid Amount:</span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                  {Number(invoice.paidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/60">
                <span className="text-xs font-medium text-blue-800 dark:text-blue-300">Remaining Balance:</span>
                <span className="text-sm font-black text-blue-700 dark:text-blue-300 font-mono">
                  {Number(invoice.remainingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History Timeline (Web only) */}
      <div className="bg-white rounded-2xl border border-secondary-200 shadow-sm p-6 sm:p-8 dark:bg-secondary-900 dark:border-secondary-800 print:hidden">
        <h3 className="text-base font-bold text-secondary-900 dark:text-white mb-6 flex items-center gap-2">
          <Clock className="h-4 w-4 text-secondary-400" />
          {t("portal.financials.paymentHistory") || "Payment History"}
        </h3>

        {payments && payments.length > 0 ? (
          <div className="space-y-4">
            {payments.map((payment, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                    {Number(payment.amount).toLocaleString()} {payment.currency || invoice.currency}
                  </span>
                  <p className="text-slate-500 capitalize">
                    {payment.paymentMethod?.replace("_", " ")} {payment.referenceNumber ? `(Ref: ${payment.referenceNumber})` : ""}
                  </p>
                </div>
                <div className="text-slate-400 font-medium mt-1 sm:mt-0">
                  {format(new Date(payment.paymentDate), "MMM dd, yyyy")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-secondary-500 italic text-center py-4">
            {t("portal.financials.noPayments") || "No payments have been recorded for this invoice yet."}
          </p>
        )}
      </div>
    </div>
  )
}

"use client"

import { useTranslations, useLocale } from "next-intl"
import { InvoiceStatusBadge } from "./InvoiceStatusBadge"
import { Link as LinkIcon, Download, Printer } from "lucide-react"
import { toast } from "sonner"
import { ProfessionalOnePageInvoice, printOnePageInvoiceHtml, type OnePageInvoiceProps } from "@/components/shared/ProfessionalOnePageInvoice"

interface InvoiceLivePreviewProps {
  invoice: any
  payments: any[]
}

export function InvoiceLivePreview({ invoice }: InvoiceLivePreviewProps) {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"

  if (!invoice) return null

  const percentage =
    invoice.totalAmount > 0
      ? Math.min(100, Math.round(((invoice.paidAmount || 0) / invoice.totalAmount) * 100))
      : 0

  const customer = invoice.customerSnapshot || invoice.customerId || {}
  const shipment = invoice.shipmentSnapshot || invoice.relatedRequestId || {}

  const handleCopyLink = () => {
    if (typeof window !== "undefined" && invoice.token) {
      const publicUrl = `${window.location.origin}/invoice/${invoice.token}`
      navigator.clipboard.writeText(publicUrl)
      toast.success(isAr ? "تم نسخ الرابط المباشر للفاتورة بنجاح" : "Invoice direct link copied to clipboard.")
    }
  }

  const items = Array.isArray(invoice.items)
    ? invoice.items.map((item: any) => ({
        description: item.description || "—",
        amount: item.total ?? item.amount ?? 0,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }))
    : []

  const onePageProps: OnePageInvoiceProps = {
    ar: isAr,
    invoiceNumber: invoice.referenceNumber || invoice.invoiceNumber || "—",
    referenceNumber: invoice.referenceNumber,
    issueDate: invoice.issueDate || invoice.createdAt,
    status: invoice.status,
    currency: invoice.currency || "EGP",
    customerName: customer.companyName || "—",
    bookingNumber: shipment.trackingNumber || shipment.booking,
    containerCount: shipment.containerCount,
    containerSize: shipment.containerSize,
    certificateNumber: shipment.complianceNumber || shipment.ucr,
    number46: shipment.number46,
    shipmentDate: shipment.shipmentDate || invoice.issueDate,
    shippingLine: shipment.shippingLine,
    items,
    groups: invoice.groups || invoice.publishedGroups || invoice.shipmentAccounting?.publications?.at(-1)?.groups,
    total: invoice.totalAmount ?? 0,
    paidAmount: invoice.paidAmount ?? 0,
    remainingAmount: invoice.remainingAmount ?? 0,
    notes: invoice.notes,
    showPrintButton: false,
  }

  const handlePrint = () => {
    printOnePageInvoiceHtml(onePageProps)
  }

  const handleDownloadPdf = () => {
    const downloadUrl = `/api/portal/invoices/${invoice._id}/pdf`
    window.open(downloadUrl, "_blank")
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {/* Top Actions & Summary (Hidden during Print) */}
      <div className="nilelink-no-print flex flex-col items-start justify-between rounded-2xl border border-secondary-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center dark:border-secondary-800 dark:bg-secondary-900 print:hidden">
        <div className="mb-4 flex items-center gap-4 sm:mb-0">
          <InvoiceStatusBadge status={invoice.status} />
          <div className="text-sm font-bold text-secondary-900 dark:text-white tabular-nums">
            <bdi dir="ltr">{percentage}%</bdi> {t("portal.financials.metrics.paid") || "Paid"}
          </div>
          <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-secondary-100 sm:block dark:bg-secondary-800">
            <div
              className={`h-full rounded-full transition-all ${
                percentage === 100 ? "bg-emerald-500" : percentage > 0 ? "bg-blue-500" : "bg-transparent"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-secondary-900 shadow-sm ring-1 ring-inset ring-secondary-300 hover:bg-secondary-50 sm:flex-none dark:bg-secondary-800 dark:text-white dark:ring-secondary-700"
          >
            <LinkIcon className="h-4 w-4 text-secondary-500 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5" />
            <span className="hidden sm:inline">{t("portal.financials.actions.copyLink") || "Copy Link"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-secondary-900 shadow-sm ring-1 ring-inset ring-secondary-300 hover:bg-secondary-50 sm:flex-none dark:bg-secondary-800 dark:text-white dark:ring-secondary-700"
          >
            <Printer className="h-4 w-4 text-secondary-500 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5" />
            <span className="hidden sm:inline">{t("portal.financials.actions.print") || "Print"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-500 sm:flex-none"
          >
            <Download className="h-4 w-4 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5" />
            <span className="hidden sm:inline">{t("portal.financials.actions.downloadPdf") || "Download PDF"}</span>
          </button>
        </div>
      </div>

      {/* Professional One-Page A4 Invoice Template (Western English Digits + Official Logo + Auto Shipment Data) */}
      <ProfessionalOnePageInvoice {...onePageProps} />
    </div>
  )
}

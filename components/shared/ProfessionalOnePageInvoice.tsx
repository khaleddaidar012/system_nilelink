"use client"

import Image from "next/image"
import logoImg from "@/public/images/logo.png"
import { Printer } from "lucide-react"

export interface OnePageInvoiceItem {
  description: string
  amount: string | number
  quantity?: number
  unitPrice?: number
}

export interface OnePageInvoiceProps {
  ar: boolean
  invoiceNumber: string
  referenceNumber?: string
  issueDate?: string
  status?: string
  currency: string
  customerName: string
  bookingNumber?: string
  containerCount?: number | string
  containerSize?: string
  certificateNumber?: string
  number46?: string
  shipmentDate?: string
  shippingLine?: string
  items: OnePageInvoiceItem[]
  total: string | number
  paidAmount?: number
  remainingAmount?: number
  notes?: string
  showPrintButton?: boolean
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
const PERSIAN_INDIC = "۰۱۲۳۴۵۶۷۸۹"

export function toEnglishDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, d => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(PERSIAN_INDIC.indexOf(d)))
}

export function formatEnglishMoney(value: string | number): string {
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""))
  if (!Number.isFinite(num)) return toEnglishDigits(value)
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatEnglishDate(value?: string): string {
  if (!value) return "—"
  const iso = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return toEnglishDigits(iso)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return toEnglishDigits(value)
  return new Date(parsed).toISOString().slice(0, 10)
}

export function ProfessionalOnePageInvoice(props: OnePageInvoiceProps) {
  const { ar } = props
  const label = (a: string, e: string) => (ar ? a : e)

  const containerDisplay =
    props.containerCount && props.containerSize
      ? `${toEnglishDigits(props.containerCount)} × ${toEnglishDigits(props.containerSize)}`
      : props.containerCount
        ? toEnglishDigits(props.containerCount)
        : "—"

  const shipmentMetaRows = [
    { label: label("رقم الفاتورة", "Invoice No."), value: toEnglishDigits(props.invoiceNumber || "—") },
    { label: label("رقم الحجز", "Booking No."), value: toEnglishDigits(props.bookingNumber || "—") },
    { label: label("عدد الحاويات × الحجم", "Containers × Size"), value: containerDisplay },
    { label: label("رقم الشهادة / UCR", "Certificate / UCR"), value: toEnglishDigits(props.certificateNumber || "—") },
    { label: label("رقم 46", "Form 46 No."), value: toEnglishDigits(props.number46 || "—") },
    { label: label("اسم العميل", "Customer Name"), value: props.customerName || "—" },
    { label: label("تاريخ تسجيل الشحنة", "Shipment Date"), value: formatEnglishDate(props.shipmentDate || props.issueDate) },
    ...(props.shippingLine ? [{ label: label("الخط الملاحي", "Shipping Line"), value: props.shippingLine }] : []),
  ]

  return (
    <div className="space-y-3">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .nilelink-print-sheet, .nilelink-print-sheet * { visibility: visible !important; }
          .nilelink-print-sheet {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #0f172a !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .nilelink-no-print { display: none !important; }
        }
      `}</style>

      {props.showPrintButton !== false && (
        <div className="nilelink-no-print flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700"
          >
            <Printer className="h-4 w-4" />
            <span>{label("طباعة الفاتورة (ورقة واحدة A4)", "Print Invoice (1-Page A4)")}</span>
          </button>
        </div>
      )}

      <article
        dir={ar ? "rtl" : "ltr"}
        className="nilelink-print-sheet mx-auto w-full max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8"
      >
        {/* Top Accent + Header with Official Logo */}
        <div className="flex items-center justify-between gap-4 border-b-2 border-primary-600 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-20 shrink-0">
              <Image src={logoImg} alt="NileLink Logistics" fill sizes="80px" className="object-contain" priority />
            </div>
            <div dir="ltr" className="leading-tight">
              <p className="text-base font-black tracking-wider text-slate-900 uppercase">NILELINK LOGISTICS</p>
              <p className="text-[11px] font-semibold text-slate-500">Freight Forwarding & Customs Clearance</p>
            </div>
          </div>

          <div className="text-end">
            <h2 className="text-lg font-black text-primary-700">
              {label("فاتورة خدمات لوجستية", "LOGISTICS SERVICE INVOICE")}
            </h2>
            <p className="mt-0.5 text-xs font-bold text-slate-700 tabular-nums">
              <bdi dir="ltr">{toEnglishDigits(props.invoiceNumber)}</bdi>
            </p>
            {props.issueDate && (
              <p className="text-[11px] text-slate-500 tabular-nums">
                {label("تاريخ الإصدار:", "Issue Date:")} <bdi dir="ltr">{formatEnglishDate(props.issueDate)}</bdi>
              </p>
            )}
          </div>
        </div>

        {/* Shipment Data Block BEFORE Financial Calculations */}
        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <h3 className="mb-2.5 text-xs font-extrabold tracking-wide text-slate-700 uppercase">
            {label("بيانات الشحنة والعميل", "Shipment & Customer Details")}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            {shipmentMetaRows.map(row => (
              <div key={row.label} className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-500">{row.label}</p>
                <p className="mt-0.5 truncate font-bold text-slate-900 tabular-nums">
                  <bdi dir="ltr">{row.value}</bdi>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Financial Line Items Table */}
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-extrabold tracking-wide text-slate-700 uppercase">
            {label("الحسابات المالية والبنود", "Financial Breakdown")}
          </h3>
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-100 text-slate-700">
                <th className="w-10 px-2.5 py-2 text-start font-bold">#</th>
                <th className="px-2.5 py-2 text-start font-bold">{label("البيان / البند", "Description")}</th>
                <th className="w-36 px-2.5 py-2 text-end font-bold">{label("المبلغ", "Amount")}</th>
              </tr>
            </thead>
            <tbody>
              {props.items.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-200/80">
                  <td className="px-2.5 py-2 font-semibold text-slate-500 tabular-nums">
                    <bdi dir="ltr">{idx + 1}</bdi>
                  </td>
                  <td className="px-2.5 py-2 font-medium text-slate-900">{item.description}</td>
                  <td className="px-2.5 py-2 text-end font-bold text-slate-900 tabular-nums">
                    <bdi dir="ltr">
                      {formatEnglishMoney(item.amount)} {props.currency}
                    </bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Totals Summary */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between text-sm font-black text-slate-900">
              <span>{label("الإجمالي المستحق", "Total Amount")}</span>
              <bdi dir="ltr" className="tabular-nums text-primary-700">
                {formatEnglishMoney(props.total)} {props.currency}
              </bdi>
            </div>
            {typeof props.paidAmount === "number" && props.paidAmount > 0 && (
              <>
                <div className="flex items-center justify-between text-emerald-700">
                  <span>{label("المدفوع", "Paid")}</span>
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatEnglishMoney(props.paidAmount)} {props.currency}
                  </bdi>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                  <span>{label("المتبقي", "Balance Due")}</span>
                  <bdi dir="ltr" className="tabular-nums">
                    {formatEnglishMoney(props.remainingAmount ?? 0)} {props.currency}
                  </bdi>
                </div>
              </>
            )}
          </div>
        </div>

        {props.notes && (
          <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-2.5 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">{label("ملاحظات:", "Notes:")} </span>
            <span className="whitespace-pre-wrap">{props.notes}</span>
          </div>
        )}

        {/* Official Compact Footer */}
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <span>NileLink Logistics S.A.E · Damietta, Egypt</span>
          <span dir="ltr" className="tabular-nums">
            +20 100 001 8549 · info@nilelinklogistics.com · nilelinklogistics.com
          </span>
        </footer>
      </article>
    </div>
  )
}

"use client"

import Image from "next/image"
import logoImg from "@/public/images/logo.png"
import { Printer, X, CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react"
import { formatEnglishDate, toEnglishDigits } from "@/components/shared/ProfessionalOnePageInvoice"

export interface DealingStatementCustomer {
  id: string
  companyName: string
  customerCode?: string
  commercialRegisterNumber?: string
  taxCardNumber?: string
  accountStatus: string
  contactEmail?: string
  contactPhone?: string
}

export interface DealingStatementDocument {
  id: string
  title: string
  category: string
  status: string
  expiryDate?: string
  createdAt: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  ar: boolean
  customer: DealingStatementCustomer
  documents: DealingStatementDocument[]
}

function documentValidityInfo(doc: DealingStatementDocument, ar: boolean): {
  validityText: string
  tone: string
  daysText: string
} {
  if (!doc.expiryDate) {
    return {
      validityText: ar ? "ساري (بدون تاريخ انتهاء)" : "Valid (No expiry)",
      tone: "text-emerald-700 bg-emerald-50",
      daysText: "—",
    }
  }
  const expMs = Date.parse(doc.expiryDate)
  if (!Number.isFinite(expMs)) {
    return { validityText: "—", tone: "text-slate-600 bg-slate-100", daysText: "—" }
  }
  const diffDays = Math.ceil((expMs - Date.now()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0 || doc.status === "expired") {
    return {
      validityText: ar ? "منتهي الصلاحية" : "Expired",
      tone: "text-rose-700 bg-rose-50",
      daysText: ar ? `منتهي منذ ${toEnglishDigits(Math.abs(diffDays))} يوم` : `Expired ${toEnglishDigits(Math.abs(diffDays))}d ago`,
    }
  }
  if (diffDays <= 30 || doc.status === "expiring_soon") {
    return {
      validityText: ar ? "قارب على الانتهاء" : "Expiring Soon",
      tone: "text-amber-800 bg-amber-50",
      daysText: ar ? `متبقي ${toEnglishDigits(diffDays)} يوم` : `${toEnglishDigits(diffDays)}d left`,
    }
  }
  return {
    validityText: ar ? "ساري الصلاحية" : "Valid",
    tone: "text-emerald-700 bg-emerald-50",
    daysText: ar ? `متبقي ${toEnglishDigits(diffDays)} يوم` : `${toEnglishDigits(diffDays)}d left`,
  }
}

export function CustomerDealingStatementModal({ isOpen, onClose, ar, customer, documents }: Props) {
  if (!isOpen) return null
  const label = (a: string, e: string) => (ar ? a : e)
  const issueDate = new Date().toISOString().slice(0, 10)
  const refNo = `DS-${toEnglishDigits(customer.customerCode || customer.id.slice(-6).toUpperCase())}-${issueDate.replace(/-/g, "")}`

  const statusText = (s: string) => {
    if (s === "approved") return { text: label("معتمد", "Approved"), icon: CheckCircle2, cls: "text-emerald-700" }
    if (s === "rejected") return { text: label("مرفوض", "Rejected"), icon: XCircle, cls: "text-rose-700" }
    if (s === "expired") return { text: label("منتهي", "Expired"), icon: AlertTriangle, cls: "text-rose-700" }
    if (s === "expiring_soon") return { text: label("قارب على الانتهاء", "Expiring Soon"), icon: AlertTriangle, cls: "text-amber-700" }
    return { text: label("قيد المراجعة", "Pending Review"), icon: Clock, cls: "text-sky-700" }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .dealing-statement-sheet, .dealing-statement-sheet * { visibility: visible !important; }
          .dealing-statement-sheet {
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
          }
          .dealing-no-print { display: none !important; }
        }
      `}</style>

      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl dark:bg-slate-900">
        {/* Modal Top Toolbar (Hidden on Print) */}
        <div className="dealing-no-print flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950" dir={ar ? "rtl" : "ltr"}>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {label("معاينة بيان تعامل العميل", "Customer Dealing Statement Preview")}
            </h3>
            <p className="text-xs text-slate-500">{customer.companyName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
            >
              <Printer className="h-4 w-4" />
              {label("طباعة / حفظ PDF", "Print / Save PDF")}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={label("إغلاق", "Close")}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Sheet */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <article
            dir={ar ? "rtl" : "ltr"}
            className="dealing-statement-sheet mx-auto w-full max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8"
          >
            {/* Header with Official Logo */}
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
                  {label("بيان تعامل عميل", "CUSTOMER DEALING STATEMENT")}
                </h2>
                <p className="mt-0.5 text-xs font-bold text-slate-700 tabular-nums">
                  <bdi dir="ltr">{refNo}</bdi>
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {label("تاريخ الإصدار:", "Issue Date:")} <bdi dir="ltr">{issueDate}</bdi>
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500">{label("اسم العميل / الشركة", "Customer / Company Name")}</p>
                  <p className="mt-0.5 text-sm font-black text-slate-900">{customer.companyName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500">{label("السجل التجاري / البطاقة الضريبية", "CR / Tax Card")}</p>
                  <p className="mt-0.5 font-bold text-slate-800 tabular-nums">
                    <bdi dir="ltr">{toEnglishDigits(customer.commercialRegisterNumber || "—")} / {toEnglishDigits(customer.taxCardNumber || "—")}</bdi>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500">{label("إجمالي المستندات المرفوعة", "Uploaded Documents")}</p>
                  <p className="mt-0.5 font-bold text-slate-900 tabular-nums">
                    <bdi dir="ltr">{documents.length}</bdi> {label("مستند", "document(s)")}
                  </p>
                </div>
              </div>
            </section>

            {/* Documents Compliance Table */}
            <section className="mt-5">
              <h3 className="mb-2.5 text-xs font-extrabold tracking-wide text-slate-700 uppercase">
                {label("المستندات المرفوعة وحالتها وصلاحيتها", "Uploaded Documents, Status & Validity")}
              </h3>
              {documents.length === 0 ? (
                <p className="rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                  {label("لا توجد مستندات مرفوعة لهذا العميل حتى الآن.", "No documents uploaded for this customer yet.")}
                </p>
              ) : (
                <table className="w-full border-collapse text-start text-xs">
                  <thead>
                    <tr className="border-y border-slate-300 bg-slate-100 text-slate-700">
                      <th className="w-8 px-2.5 py-2 text-start font-bold">#</th>
                      <th className="px-2.5 py-2 text-start font-bold">{label("المستند", "Document")}</th>
                      <th className="px-2.5 py-2 text-start font-bold">{label("حالة المستند", "Status")}</th>
                      <th className="px-2.5 py-2 text-start font-bold">{label("صلاحية المستند", "Validity")}</th>
                      <th className="px-2.5 py-2 text-end font-bold">{label("موعد الانتهاء", "Expiry Date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, idx) => {
                      const st = statusText(doc.status)
                      const Icon = st.icon
                      const validity = documentValidityInfo(doc, ar)
                      return (
                        <tr key={doc.id} className="border-b border-slate-200/80">
                          <td className="px-2.5 py-2.5 font-semibold text-slate-500 tabular-nums">
                            <bdi dir="ltr">{idx + 1}</bdi>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <p className="font-bold text-slate-900">{doc.title}</p>
                            <p className="text-[10px] text-slate-500">{doc.category}</p>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <span className={`inline-flex items-center gap-1 font-bold ${st.cls}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {st.text}
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${validity.tone}`}>
                              {validity.validityText}
                            </span>
                            {validity.daysText !== "—" && (
                              <p className="mt-0.5 text-[10px] text-slate-500">{validity.daysText}</p>
                            )}
                          </td>
                          <td className="px-2.5 py-2.5 text-end font-bold text-slate-900 tabular-nums">
                            <bdi dir="ltr">{formatEnglishDate(doc.expiryDate)}</bdi>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* Official NileLink Contact Footer */}
            <footer className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[11px] text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold text-slate-900">NileLink Logistics S.A.E</p>
                  <p>{label("دمياط، مدخل طريق العنانيّة، أمام مصنع الثلج — مصر", "Entrance to Al-Ananiyah Road, opposite Ice Factory, Damietta, Egypt")}</p>
                </div>
                <div dir="ltr" className="text-end font-semibold tabular-nums">
                  <p>Tel: +20 100 001 8549</p>
                  <p>info@nilelinklogistics.com · https://nilelinklogistics.com</p>
                </div>
              </div>
            </footer>
          </article>
        </div>
      </div>
    </div>
  )
}

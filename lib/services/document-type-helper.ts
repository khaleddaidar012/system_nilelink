import type { FinancialDocumentType } from "@/lib/models/Invoice"

export interface DocumentTypeMeta {
  type: FinancialDocumentType
  titleAr: string
  titleEn: string
  shortLabelAr: string
  shortLabelEn: string
  descriptionAr: string
  descriptionEn: string
  badgeBg: string
  badgeText: string
  requiresTaxAuth: boolean
}

export const DOCUMENT_TYPE_REGISTRY: Record<FinancialDocumentType, DocumentTypeMeta> = {
  statement: {
    type: "statement",
    titleAr: "كشف حساب",
    titleEn: "ACCOUNT STATEMENT",
    shortLabelAr: "كشف حساب",
    shortLabelEn: "Statement",
    descriptionAr: "كشف حساب مالي يوضح تفاصيل المعاملات والمطالبات والأرصدة المستحقة",
    descriptionEn: "Financial account statement displaying transaction details and amounts due",
    badgeBg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    badgeText: "text-blue-700 dark:text-blue-300",
    requiresTaxAuth: false,
  },
  invoice: {
    type: "invoice",
    titleAr: "فاتورة",
    titleEn: "COMMERCIAL INVOICE",
    shortLabelAr: "فاتورة",
    shortLabelEn: "Invoice",
    descriptionAr: "فاتورة تجارية عادية لمعاملات الشحن والخدمات اللوجستية",
    descriptionEn: "Standard commercial invoice for freight and logistics operations",
    badgeBg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    badgeText: "text-slate-800 dark:text-slate-200",
    requiresTaxAuth: false,
  },
  tax_invoice: {
    type: "tax_invoice",
    titleAr: "فاتورة ضريبية",
    titleEn: "TAX INVOICE",
    shortLabelAr: "فاتورة ضريبية",
    shortLabelEn: "Tax Invoice",
    descriptionAr: "فاتورة ضريبية رسمية معتمدة تتضمن بيانات التسجيل الضريبي وضريبة القيمة المضافة",
    descriptionEn: "Official approved tax invoice with tax card numbers and VAT breakdown",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    requiresTaxAuth: true,
  },
}

export function getDocumentTypeMeta(type?: string | null): DocumentTypeMeta {
  if (type === "invoice" || type === "tax_invoice") {
    return DOCUMENT_TYPE_REGISTRY[type]
  }
  return DOCUMENT_TYPE_REGISTRY.statement
}

export function getDocumentTitle(type?: string | null, isAr = true): string {
  const meta = getDocumentTypeMeta(type)
  return isAr ? meta.titleAr : meta.titleEn
}

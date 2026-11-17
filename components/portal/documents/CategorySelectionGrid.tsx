"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import {
  Building2,
  Receipt,
  Ship,
  Plane,
  ShieldCheck,
  FileSignature,
  Award,
  FolderPlus,
  CheckCircle2,
  Check,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"

export interface DocumentCategoryOption {
  key: string
  nameEn: string
  nameAr: string
  description?: string
  defaultValidityDays?: number
  isMandatory?: boolean
}

const FALLBACK_CATEGORIES: DocumentCategoryOption[] = [
  {
    key: "commercial_register",
    nameEn: "Commercial Registration (CR)",
    nameAr: "السجل التجاري",
    description: "Official company registration with Ministry of Supply",
    isMandatory: true,
  },
  {
    key: "tax_card",
    nameEn: "Tax Registration Card",
    nameAr: "البطاقة الضريبية",
    description: "Corporate Tax Authority identity certificate & VAT",
    isMandatory: true,
  },
  {
    key: "import_card",
    nameEn: "Import Card",
    nameAr: "بطاقة استيرادية",
    description: "GOEIC Import Card for trade clearance",
    isMandatory: false,
  },
  {
    key: "export_card",
    nameEn: "Export Card",
    nameAr: "بطاقة تصديرية",
    description: "GOEIC Export Card for international shipping",
    isMandatory: false,
  },
  {
    key: "customs_certificate",
    nameEn: "Customs Clearance & ACID Bond",
    nameAr: "شهادة جمركية وترخيص الإفراج",
    description: "Nafeza ACID agreement and agent authorization",
    isMandatory: false,
  },
  {
    key: "contract",
    nameEn: "Freight & Logistics Agreement",
    nameAr: "عقد خدمات الشحن واللوجستيات",
    description: "Master service agreement signed with NileLink",
    isMandatory: false,
  },
  {
    key: "license",
    nameEn: "Operating & Trade License",
    nameAr: "رخصة مزاولة النشاط",
    description: "General trade or specialized business license",
    isMandatory: false,
  },
  {
    key: "other",
    nameEn: "General Business Document",
    nameAr: "وثيقة / شهادة عامة",
    description: "Power of attorney, Chamber membership, permits",
    isMandatory: false,
  },
]

export function getCategoryIcon(key: string) {
  switch (key) {
    case "commercial_register":
      return Building2
    case "tax_card":
      return Receipt
    case "import_card":
      return Ship
    case "export_card":
      return Plane
    case "customs_certificate":
      return ShieldCheck
    case "contract":
      return FileSignature
    case "license":
      return Award
    default:
      return FolderPlus
  }
}

interface CategorySelectionGridProps {
  selectedKeys: string[]
  onToggleCategory: (key: string) => void
  onSelectAll?: () => void
  onClearAll?: () => void
  onProceed: () => void
  availableSlots: number
  isLoading?: boolean
}

export function CategorySelectionGrid({
  selectedKeys,
  onToggleCategory,
  onSelectAll,
  onClearAll,
  onProceed,
  availableSlots,
  isLoading = false,
}: CategorySelectionGridProps) {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"
  const [categories, setCategories] = useState<DocumentCategoryOption[]>(FALLBACK_CATEGORIES)
  const [loadingCats, setLoadingCats] = useState(true)

  useEffect(() => {
    fetch("/api/settings/document-categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCats(false))
  }, [])

  const selectedCount = selectedKeys.length

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{isAr ? "اختر أنواع المستندات المطلوب رفعها" : "Select Document Categories to Upload"}</span>
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
              {isAr ? "نظام نافذة" : "Nafeza Style"}
            </span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? "اضغط على المستندات التي ترغب في إرفاقها لتحديدها ومتابعة مرحلة الرفع"
              : "Click the categories you wish to attach files for, then proceed to the upload stage"}
          </p>
        </div>

        {/* Quick Selection Buttons */}
        <div className="flex items-center gap-2">
          {selectedCount > 0 && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors underline"
            >
              {isAr ? "إلغاء التحديد" : "Clear All"}
            </button>
          )}
          {onSelectAll && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 transition-colors"
            >
              {isAr ? "تحديد الكل" : "Select All"}
            </button>
          )}
        </div>
      </div>

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {categories.map((cat) => {
          const isSelected = selectedKeys.includes(cat.key)
          const Icon = getCategoryIcon(cat.key)
          const primaryName = isAr ? cat.nameAr : cat.nameEn
          const secondaryName = isAr ? cat.nameEn : cat.nameAr

          return (
            <motion.div
              key={cat.key}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onToggleCategory(cat.key)}
              className={cn(
                "relative flex flex-col justify-between rounded-2xl border-2 p-4 cursor-pointer select-none transition-all duration-200",
                isSelected
                  ? "border-emerald-500 bg-emerald-50/40 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/20"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
              )}
            >
              {/* Top Row: Icon + Selection Badge */}
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                    isSelected
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                {/* Checkbox indicator */}
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all duration-200",
                    isSelected
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                      : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
                  )}
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  ) : null}
                </div>
              </div>

              {/* Title & Description */}
              <div className="mt-3.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h5 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    {primaryName}
                  </h5>
                  {cat.isMandatory && (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                      {isAr ? "مطلوب" : "Required"}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                  {secondaryName}
                </p>
                {cat.description && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1.5 leading-snug">
                    {cat.description}
                  </p>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Action Footer Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {isAr
                ? `تم تحديد ${selectedCount} مستند من أصل ${availableSlots} متاح`
                : `${selectedCount} categories selected (out of ${availableSlots} available slots)`}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr
                ? "يمكنك رفع ملفات PDF أو صور PNG/JPG بحد أقصى 10 ميجابايت لكل ملف"
                : "Accepts PDF, PNG, JPG, WEBP formats up to 10MB per file"}
            </p>
          </div>
        </div>

        <Button
          type="button"
          disabled={selectedCount === 0 || isLoading}
          onClick={onProceed}
          className={cn(
            "gap-2 px-6 font-semibold shadow-md transition-all",
            selectedCount > 0
              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
              : "opacity-60 cursor-not-allowed"
          )}
        >
          <span>{isAr ? "متابعة إرفاق الملفات" : "Continue to Attach Files"}</span>
          {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

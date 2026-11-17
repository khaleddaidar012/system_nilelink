"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import {
  CategorySelectionGrid,
  DocumentCategoryOption,
} from "./CategorySelectionGrid"
import {
  UploadProgressColumn,
  StagedCategoryUpload,
} from "./UploadProgressColumn"
import {
  UploadCloud,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Layers,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface DocumentUploadWizardProps {
  currentCount: number
  maxAllowed?: number
  onUploadComplete?: () => void
  entityId?: string
}

export function DocumentUploadWizard({
  currentCount,
  maxAllowed = 20,
  onUploadComplete,
  entityId,
}: DocumentUploadWizardProps) {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"

  const [step, setStep] = useState<"select_categories" | "attach_and_upload">("select_categories")
  const [categories, setCategories] = useState<DocumentCategoryOption[]>([])
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<string[]>([])
  const [stagedUploads, setStagedUploads] = useState<StagedCategoryUpload[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  const availableSlots = Math.max(0, maxAllowed - currentCount)

  // Fetch document categories
  useEffect(() => {
    fetch("/api/settings/document-categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories)
        }
      })
      .catch(() => {})
  }, [])

  // Toggle category in grid
  const handleToggleCategory = (key: string) => {
    setSelectedCategoryKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key)
      } else {
        if (prev.length >= availableSlots) {
          alert(
            isAr
              ? `لا يمكن اختيار أكثر من ${availableSlots} مستند بسبب الحد الأقصى للمستندات المتاحة.`
              : `You cannot select more than ${availableSlots} categories due to your document limit.`
          )
          return prev
        }
        return [...prev, key]
      }
    })
  }

  const handleSelectAll = () => {
    const keys = categories.map((c) => c.key).slice(0, availableSlots)
    setSelectedCategoryKeys(keys)
  }

  const handleClearAll = () => {
    setSelectedCategoryKeys([])
  }

  // Transition from Selection Grid to Upload Column
  const handleProceedToUpload = () => {
    if (selectedCategoryKeys.length === 0) return

    // Build the staged uploads array based on selected keys
    const newStaged: StagedCategoryUpload[] = selectedCategoryKeys.map((key) => {
      const cat = categories.find((c) => c.key === key)
      // If we already had a staged file for this key, keep it
      const existing = stagedUploads.find((s) => s.categoryKey === key)
      if (existing) return existing

      return {
        categoryKey: key,
        categoryNameEn: cat?.nameEn || key,
        categoryNameAr: cat?.nameAr || key,
        isMandatory: cat?.isMandatory || false,
        file: null,
        customTitle: cat?.nameEn || key,
        status: "idle",
        progress: 0,
      }
    })

    setStagedUploads(newStaged)
    setStep("attach_and_upload")
  }

  // File operations in Upload Column
  const handleFileAttached = (categoryKey: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert(
        isAr
          ? "حجم الملف يتجاوز 10 ميجابايت. يرجى اختيار ملف أصغر."
          : "File size exceeds 10MB. Please choose a smaller file."
      )
      return
    }

    setStagedUploads((prev) =>
      prev.map((item) =>
        item.categoryKey === categoryKey
          ? {
              ...item,
              file,
              status: "idle",
              errorMessage: undefined,
              customTitle: file.name.replace(/\.[^/.]+$/, ""),
            }
          : item
      )
    )
  }

  const handleFileRemoved = (categoryKey: string) => {
    setStagedUploads((prev) =>
      prev.map((item) =>
        item.categoryKey === categoryKey
          ? { ...item, file: null, status: "idle", errorMessage: undefined }
          : item
      )
    )
  }

  const handleTitleChanged = (categoryKey: string, title: string) => {
    setStagedUploads((prev) =>
      prev.map((item) =>
        item.categoryKey === categoryKey ? { ...item, customTitle: title } : item
      )
    )
  }

  // Sequential upload engine
  const executeUploadForSingleItem = async (
    item: StagedCategoryUpload
  ): Promise<boolean> => {
    if (!item.file) return false

    // Set uploading state
    setStagedUploads((prev) =>
      prev.map((i) =>
        i.categoryKey === item.categoryKey
          ? { ...i, status: "uploading", errorMessage: undefined }
          : i
      )
    )

    try {
      const formData = new FormData()
      formData.append("files", item.file)
      formData.append("categories", item.categoryKey)
      formData.append("titles", item.customTitle || item.file.name)
      if (entityId) {
        formData.append("entityId", entityId)
      }

      const res = await fetch("/api/portal/documents/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Upload failed")
      }

      // Mark success
      setStagedUploads((prev) =>
        prev.map((i) =>
          i.categoryKey === item.categoryKey
            ? { ...i, status: "success", progress: 100 }
            : i
        )
      )
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed"
      setStagedUploads((prev) =>
        prev.map((i) =>
          i.categoryKey === item.categoryKey
            ? { ...i, status: "error", errorMessage: msg }
            : i
        )
      )
      return false
    }
  }

  // Start sequential batch upload
  const handleStartUpload = async () => {
    const readyItems = stagedUploads.filter((i) => i.file !== null && i.status !== "success")
    if (readyItems.length === 0) return

    setIsUploading(true)
    setGeneralError(null)

    let allOk = true
    for (const item of readyItems) {
      const ok = await executeUploadForSingleItem(item)
      if (!ok) {
        allOk = false
      }
    }

    setIsUploading(false)
    if (allOk) {
      setIsCompleted(true)
      if (onUploadComplete) {
        onUploadComplete()
      }
    }
  }

  const handleRetrySingle = async (categoryKey: string) => {
    const item = stagedUploads.find((i) => i.categoryKey === categoryKey)
    if (!item || !item.file) return
    await executeUploadForSingleItem(item)
  }

  const handleFinish = () => {
    if (onUploadComplete) {
      onUploadComplete()
    }
    // Reset wizard
    setStep("select_categories")
    setSelectedCategoryKeys([])
    setStagedUploads([])
    setIsCompleted(false)
  }

  return (
    <div className="w-full">
      {/* Step Indicator Header */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-colors",
              step === "select_categories"
                ? "bg-primary-600 text-white shadow-sm shadow-primary-600/30"
                : "bg-emerald-600 text-white"
            )}
          >
            {step === "attach_and_upload" ? <CheckCircle2 className="h-4 w-4" /> : "1"}
          </div>
          <span
            className={cn(
              "text-xs sm:text-sm font-bold",
              step === "select_categories"
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-slate-500"
            )}
          >
            {isAr ? "1. تحديد أنواع المستندات" : "1. Select Categories"}
          </span>

          <span className="text-slate-300 dark:text-slate-700">───</span>

          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-colors",
              step === "attach_and_upload"
                ? isCompleted
                  ? "bg-emerald-600 text-white"
                  : "bg-primary-600 text-white shadow-sm shadow-primary-600/30"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
            )}
          >
            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : "2"}
          </div>
          <span
            className={cn(
              "text-xs sm:text-sm font-bold",
              step === "attach_and_upload"
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-slate-500"
            )}
          >
            {isAr ? "2. إرفاق الملفات والرفع" : "2. Attach & Upload"}
          </span>
        </div>

        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 hidden sm:inline">
          {isAr
            ? `المتاح: ${availableSlots} مستندات`
            : `Available: ${availableSlots} slots`}
        </span>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === "select_categories" ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.25 }}
          >
            <CategorySelectionGrid
              selectedKeys={selectedCategoryKeys}
              onToggleCategory={handleToggleCategory}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onProceed={handleProceedToUpload}
              availableSlots={availableSlots}
            />
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.25 }}
          >
            <UploadProgressColumn
              items={stagedUploads}
              onFileAttached={handleFileAttached}
              onFileRemoved={handleFileRemoved}
              onTitleChanged={handleTitleChanged}
              onStartUpload={handleStartUpload}
              onRetrySingle={handleRetrySingle}
              onBackToCategories={() => setStep("select_categories")}
              isUploading={isUploading}
              isCompleted={isCompleted}
              onFinish={handleFinish}
              entityId={entityId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

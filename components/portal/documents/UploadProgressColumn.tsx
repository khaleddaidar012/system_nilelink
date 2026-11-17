"use client"

import React, { useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Paperclip,
  Trash2,
  RefreshCw,
  Play,
  Check,
  ArrowRight,
  ArrowLeft,
  FileUp,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { getCategoryIcon, DocumentCategoryOption } from "./CategorySelectionGrid"

export interface StagedCategoryUpload {
  categoryKey: string
  categoryNameEn: string
  categoryNameAr: string
  isMandatory?: boolean
  file: File | null
  customTitle: string
  status: "idle" | "uploading" | "success" | "error"
  errorMessage?: string
  progress: number
}

interface UploadProgressColumnProps {
  items: StagedCategoryUpload[]
  onFileAttached: (categoryKey: string, file: File) => void
  onFileRemoved: (categoryKey: string) => void
  onTitleChanged: (categoryKey: string, title: string) => void
  onStartUpload: () => void
  onRetrySingle: (categoryKey: string) => void
  onBackToCategories: () => void
  isUploading: boolean
  isCompleted: boolean
  onFinish: () => void
  entityId?: string
}

export function UploadProgressColumn({
  items,
  onFileAttached,
  onFileRemoved,
  onTitleChanged,
  onStartUpload,
  onRetrySingle,
  onBackToCategories,
  isUploading,
  isCompleted,
  onFinish,
}: UploadProgressColumnProps) {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"

  const attachedCount = items.filter((i) => i.file !== null).length
  const successCount = items.filter((i) => i.status === "success").length
  const errorCount = items.filter((i) => i.status === "error").length
  const allAttached = items.every((i) => i.file !== null)

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div>
          <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{isAr ? "قائمة المستندات المحددة للرفع" : "Selected Documents for Upload"}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              {attachedCount} / {items.length} {isAr ? "ملفات مرفقة" : "files ready"}
            </span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? "قم بإرفاق ملف لكل نوع مستند تم اختياره، ثم اضغط على بدء الرفع ليتم رفعها تباعاً"
              : "Attach the corresponding file for each selected category, then click Start Upload to process sequentially"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackToCategories}
            disabled={isUploading}
            className="text-xs font-medium"
          >
            {isAr ? "← تعديل الأنواع" : "← Change Categories"}
          </Button>

          {!isCompleted ? (
            <Button
              type="button"
              size="sm"
              onClick={onStartUpload}
              disabled={isUploading || attachedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm shadow-emerald-600/30 gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isAr ? "جاري الرفع..." : "Uploading..."}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>{isAr ? "بدء الرفع المتتالي" : "Start Sequential Upload"}</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onFinish}
              className="bg-primary-600 hover:bg-primary-700 text-white font-semibold shadow-sm gap-1.5"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>{isAr ? "إتمام وإنهاء" : "Finish & View Registry"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Vertical List of Selected Categories / Upload Rows */}
      <div className="space-y-3">
        {items.map((item, index) => {
          const Icon = getCategoryIcon(item.categoryKey)
          const primaryName = isAr ? item.categoryNameAr : item.categoryNameEn
          const secondaryName = isAr ? item.categoryNameEn : item.categoryNameAr

          return (
            <UploadRowItem
              key={item.categoryKey}
              item={item}
              index={index}
              Icon={Icon}
              primaryName={primaryName}
              secondaryName={secondaryName}
              isAr={isAr}
              isUploadingOverall={isUploading}
              onFileAttached={onFileAttached}
              onFileRemoved={onFileRemoved}
              onTitleChanged={onTitleChanged}
              onRetrySingle={onRetrySingle}
            />
          )
        })}
      </div>

      {/* Completion Banner */}
      {isCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/20"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/30">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "تم رفع جميع المستندات بنجاح!" : "All Selected Documents Uploaded Successfully!"}
              </h5>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {isAr
                  ? `تم حفظ ${successCount} مستند في سجل الشركة وإشعار فريق العمل لمراجعتها واعتمادها.`
                  : `${successCount} documents were added to your company registry and staff was notified for review.`}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={onFinish}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 shadow-sm shadow-emerald-600/30"
          >
            {isAr ? "عرض سجل المستندات" : "View Registry"}
          </Button>
        </motion.div>
      )}
    </div>
  )
}

interface UploadRowItemProps {
  item: StagedCategoryUpload
  index: number
  Icon: React.ComponentType<{ className?: string }>
  primaryName: string
  secondaryName: string
  isAr: boolean
  isUploadingOverall: boolean
  onFileAttached: (categoryKey: string, file: File) => void
  onFileRemoved: (categoryKey: string) => void
  onTitleChanged: (categoryKey: string, title: string) => void
  onRetrySingle: (categoryKey: string) => void
}

function UploadRowItem({
  item,
  index,
  Icon,
  primaryName,
  secondaryName,
  isAr,
  isUploadingOverall,
  onFileAttached,
  onFileRemoved,
  onTitleChanged,
  onRetrySingle,
}: UploadRowItemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (item.status === "uploading" || item.status === "success") return
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileAttached(item.categoryKey, e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (item.status !== "uploading" && item.status !== "success") {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border p-4 transition-all duration-200",
        item.status === "success"
          ? "border-emerald-500/40 bg-emerald-50/20 dark:border-emerald-500/30 dark:bg-emerald-950/10"
          : item.status === "error"
          ? "border-rose-500/50 bg-rose-50/30 dark:border-rose-500/40 dark:bg-rose-950/20"
          : item.status === "uploading"
          ? "border-emerald-500 bg-emerald-50/10 dark:border-emerald-500 dark:bg-emerald-950/10 shadow-sm"
          : isDragOver
          ? "border-primary-500 bg-primary-50/20 dark:border-primary-500 dark:bg-primary-950/20"
          : item.file
          ? "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900/80"
          : "border-dashed border-slate-300 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/30"
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileAttached(item.categoryKey, e.target.files[0])
          }
        }}
      />

      {/* Left Area: Category Info + Attached File Name */}
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        {/* Category Icon */}
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors mt-0.5",
            item.status === "success"
              ? "bg-emerald-600 text-white"
              : item.status === "uploading"
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : item.status === "error"
              ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          )}
        >
          {item.status === "uploading" ? (
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
          ) : item.status === "success" ? (
            <Check className="h-5 w-5 stroke-[3]" />
          ) : item.status === "error" ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </div>

        {/* Text & File Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {primaryName}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              ({secondaryName})
            </span>
            {item.isMandatory && (
              <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                {isAr ? "مطلوب" : "Mandatory"}
              </span>
            )}
          </div>

          {/* Attached File Preview or Empty Attachment Prompt */}
          {item.file ? (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="truncate max-w-[200px] sm:max-w-[280px]">
                  {item.file.name}
                </span>
              </span>
              <span className="text-[11px] text-slate-400">
                • {formatFileSize(item.file.size)}
              </span>

              {item.status === "error" && item.errorMessage && (
                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  — {item.errorMessage}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isAr ? "لم يتم إرفاق ملف بعد (اسحب الملف هنا أو اضغط إرفاق)" : "No file attached yet (drop file here or click attach)"}
            </p>
          )}
        </div>
      </div>

      {/* Right Area: Status Indicator & Action Buttons */}
      <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
        {/* Status Indicator Badges */}
        {item.status === "success" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isAr ? "تم الرفع" : "Uploaded"}</span>
          </span>
        )}

        {item.status === "uploading" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 animate-pulse">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{isAr ? "جاري الرفع..." : "Uploading..."}</span>
          </span>
        )}

        {item.status === "error" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onRetrySingle(item.categoryKey)}
            className="text-xs text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/40 gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{isAr ? "إعادة المحاولة" : "Retry"}</span>
          </Button>
        )}

        {/* Attach / Change / Remove Buttons */}
        {item.status !== "success" && item.status !== "uploading" && (
          <>
            {item.file ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs h-8"
                >
                  {isAr ? "تغيير الملف" : "Change File"}
                </Button>
                <button
                  type="button"
                  onClick={() => onFileRemoved(item.categoryKey)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  title={isAr ? "حذف الملف" : "Remove file"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-primary-600 border-primary-200 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-400 dark:hover:bg-primary-950/40 gap-1.5"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>{isAr ? "إرفاق الملف" : "Attach File"}</span>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

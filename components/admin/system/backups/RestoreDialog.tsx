"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Database, FlaskConical, Loader2, ShieldAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { BackupSummary, formatBytes, formatCairoDate, formatCairoTime } from "./formatters"

interface Props {
  backup: BackupSummary | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (options: {
    targetMode: "test" | "production"
    confirmPhrase?: string
    acknowledgeDataLoss?: boolean
  }) => Promise<void>
  isSubmitting: boolean
  locale: string
}

export function RestoreDialog({ backup, isOpen, onClose, onConfirm, isSubmitting, locale }: Props) {
  const isAr = locale === "ar"
  const L = (en: string, ar: string) => (isAr ? ar : en)

  const [mode, setMode] = useState<"test" | "production">("test")
  const [confirmPhrase, setConfirmPhrase] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)

  if (!isOpen || !backup) return null

  const isProduction = mode === "production"
  const canProceed = !isSubmitting && (!isProduction || (confirmPhrase.trim() === "RESTORE" && acknowledged))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canProceed) return
    await onConfirm({
      targetMode: mode,
      confirmPhrase: isProduction ? confirmPhrase.trim() : undefined,
      acknowledgeDataLoss: isProduction ? acknowledged : undefined,
    })
  }

  return (
    <div
      id="restore-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="restore-modal-content"
        className="relative w-full max-w-lg rounded-2xl border border-secondary-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-secondary-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                isProduction ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400" : "bg-primary-100 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400"
              )}
            >
              {isProduction ? <ShieldAlert className="h-5 w-5" /> : <FlaskConical className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-secondary-900 dark:text-white">
                {isProduction ? L("Production Database Restore", "استعادة قاعدة بيانات الإنتاج") : L("Test Database Restore", "اختبار استعادة النسخة")}
              </h3>
              <p className="text-xs text-secondary-500 dark:text-slate-400">
                {L("Choose restoration mode and verify backup parameters", "اختر نمط الاستعادة وتحقق من مواصفات النسخة")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-secondary-400 hover:bg-secondary-100 hover:text-secondary-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Backup Meta Info */}
        <div className="my-4 rounded-xl border border-secondary-200 bg-secondary-50 p-3.5 text-xs text-secondary-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold text-secondary-500 dark:text-slate-500">{L("Backup ID:", "معرف النسخة:")}</span>
              <p className="font-mono text-[11px] text-secondary-900 dark:text-white" dir="ltr">
                {backup.id}
              </p>
            </div>
            <div>
              <span className="font-semibold text-secondary-500 dark:text-slate-500">{L("Size:", "الحجم:")}</span>
              <p className="font-bold text-secondary-900 dark:text-white" dir="ltr">
                {formatBytes(backup.sizeBytes)}
              </p>
            </div>
            <div>
              <span className="font-semibold text-secondary-500 dark:text-slate-500">{L("Date (Cairo):", "التاريخ (القاهرة):")}</span>
              <p className="font-medium text-secondary-900 dark:text-white">
                {formatCairoDate(backup.createdAt, locale)} {formatCairoTime(backup.createdAt, locale)}
              </p>
            </div>
            <div>
              <span className="font-semibold text-secondary-500 dark:text-slate-500">{L("Type:", "النوع:")}</span>
              <p className="font-medium capitalize text-secondary-900 dark:text-white">{backup.type}</p>
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-secondary-700 dark:text-slate-300">
            {L("Restoration Target Mode", "نمط الاستعادة")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("test")
                setConfirmPhrase("")
                setAcknowledged(false)
              }}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all",
                !isProduction
                  ? "border-primary-500 bg-primary-50/50 shadow-sm dark:border-primary-500 dark:bg-primary-950/20"
                  : "border-secondary-200 hover:border-secondary-300 dark:border-slate-800 dark:hover:border-slate-700"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-primary-700 dark:text-primary-300">
                <FlaskConical className="h-4 w-4" />
                {L("Test Restore", "اختبار في قاعدة مؤقتة")}
              </div>
              <span className="text-[11px] text-secondary-500 dark:text-slate-400">
                {L("Restores into isolated database without touching production", "استعادة في قاعدة معزولة دون أي تأثير على البيانات الحية")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode("production")}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all",
                isProduction
                  ? "border-amber-500 bg-amber-50/50 shadow-sm dark:border-amber-500 dark:bg-amber-950/20"
                  : "border-secondary-200 hover:border-secondary-300 dark:border-slate-800 dark:hover:border-slate-700"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-400">
                <Database className="h-4 w-4" />
                {L("Production Restore", "استعادة الإنتاج الحقيقي")}
              </div>
              <span className="text-[11px] text-secondary-500 dark:text-slate-400">
                {L("Replaces current live database with automatic safety backup", "استبدال البيانات الحالية مع إنشاء نسخة أمان فورية أولاً")}
              </span>
            </button>
          </div>
        </div>

        {/* Production Warning and Confirmation */}
        {isProduction ? (
          <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">{L("Destructive Operation Safeguards", "إجراءات حماية العملية التدميرية")}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
                  {L(
                    "A verified safety backup of the current live database will be created automatically before starting. Live data added after this backup date will be replaced.",
                    "سيتم تلقائياً إنشاء نسخة أمان موثوقة من قاعدة البيانات الحالية قبل البدء. أي تعديلات أو بيانات تمت إضافتها بعد تاريخ هذه النسخة سيتم استبدالها."
                  )}
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs text-secondary-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-[11px] font-medium leading-tight">
                {L(
                  "I understand that live database data will be overwritten.",
                  "أقر بأن بيانات قاعدة البيانات الحالية سيتم استبدالها بهذه النسخة."
                )}
              </span>
            </label>

            <div>
              <label className="block text-[11px] font-semibold text-secondary-700 dark:text-slate-300">
                {L('Type "RESTORE" to confirm production restoration:', 'اكتب كلمة "RESTORE" لتأكيد الاستعادة:')}
              </label>
              <input
                id="restore-confirm-phrase-input"
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="RESTORE"
                className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold tracking-wider text-secondary-900 shadow-sm focus:border-amber-500 focus:outline-none dark:border-amber-800 dark:bg-slate-900 dark:text-white"
                dir="ltr"
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px]">
              {L(
                "Safe mode: Live database remains completely untouched. Data is restored to 'nilelink_restore_test'.",
                "وضع آمن: قاعدة البيانات الحية لن تتأثر إطلاقاً. سيتم استخراج البيانات في 'nilelink_restore_test'."
              )}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-secondary-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-secondary-200 px-4 py-2 text-xs font-semibold text-secondary-700 hover:bg-secondary-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {L("Cancel", "إلغاء")}
          </button>
          <button
            id="restore-submit-button"
            type="button"
            onClick={handleSubmit}
            disabled={!canProceed}
            className={cn(
              "flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40",
              isProduction ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 shadow-md" : "bg-primary-600 hover:bg-primary-700 shadow-primary-500/20 shadow-md"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {L("Starting...", "جاري البدء...")}
              </>
            ) : isProduction ? (
              L("Proceed with Production Restore", "تأكيد استعادة الإنتاج")
            ) : (
              L("Start Test Restore", "بدء اختبار الاستعادة")
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

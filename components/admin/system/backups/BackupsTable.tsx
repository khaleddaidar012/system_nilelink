"use client"

import { Loader2, Lock, LockOpen, RotateCcw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BackupSummary, formatBytes, formatCairoDate, formatCairoTime } from "./formatters"

interface Props {
  items: BackupSummary[]
  loading: boolean
  locale: string
  busyId: string | null
  canMutate: boolean
  onProtect: (b: BackupSummary) => void
  onDelete: (b: BackupSummary) => void
  onRestore: (b: BackupSummary) => void
}

const STATUS_STYLE: Record<BackupSummary["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  running: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  quarantined: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
}

export function BackupsTable({ items, loading, locale, busyId, canMutate, onProtect, onDelete, onRestore }: Props) {
  const isAr = locale === "ar"
  const L = (en: string, ar: string) => (isAr ? ar : en)
  const typeLabel: Record<BackupSummary["type"], string> = {
    automatic: L("Automatic", "تلقائي"),
    manual: L("Manual", "يدوي"),
    safety: L("Safety", "أمان"),
    import: L("Imported", "مستورد"),
  }
  const statusLabel: Record<BackupSummary["status"], string> = {
    completed: L("Completed", "مكتمل"),
    failed: L("Failed", "فشل"),
    running: L("Running", "قيد التنفيذ"),
    quarantined: L("Quarantined", "معزول"),
  }

  if (loading && items.length === 0) {
    return <div className="h-40 animate-pulse rounded-2xl bg-secondary-100 dark:bg-slate-900" />
  }

  if (items.length === 0) {
    return (
      <div id="backups-empty" className="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500 dark:border-slate-700 dark:text-slate-400">
        {L("No backups yet. Create the first one with the button above.", "لا توجد نسخ احتياطية بعد. أنشئ أول نسخة بالزر أعلاه.")}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-secondary-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <table id="backups-table" className="w-full min-w-[720px] text-start text-sm">
        <thead className="bg-secondary-50 text-xs uppercase tracking-wide text-secondary-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            {[L("Status", "الحالة"), L("Date", "التاريخ"), L("Time (Cairo)", "الوقت (القاهرة)"), L("Size", "الحجم"), L("Type", "النوع"), L("Created by", "بواسطة"), L("Actions", "إجراءات")].map((h) => (
              <th key={h} className="px-4 py-3 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-100 dark:divide-slate-800">
          {items.map((b) => (
            <tr key={b.id} id={`backup-row-${b.id}`} className="hover:bg-secondary-50/60 dark:hover:bg-slate-900/60">
              <td className="px-4 py-3">
                <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", STATUS_STYLE[b.status])} title={b.problem ?? undefined}>
                  {statusLabel[b.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-secondary-700 dark:text-slate-300">{formatCairoDate(b.createdAt, locale)}</td>
              <td className="px-4 py-3 text-secondary-700 dark:text-slate-300" dir="ltr">
                {formatCairoTime(b.createdAt, locale)}
              </td>
              <td className="px-4 py-3 text-secondary-700 dark:text-slate-300" dir="ltr">
                {formatBytes(b.sizeBytes)}
              </td>
              <td className="px-4 py-3 text-secondary-700 dark:text-slate-300">
                {typeLabel[b.type]}
                {b.reason ? <span className="block max-w-[200px] truncate text-[11px] text-secondary-400">{b.reason}</span> : null}
              </td>
              <td className="px-4 py-3 text-secondary-700 dark:text-slate-300">
                {b.createdBy?.kind === "user" ? (b.createdBy.email ?? L("Admin", "مدير")) : L("System", "النظام")}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {busyId === b.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-secondary-400" />
                  ) : (
                    <>
                      <button
                        id={`restore-${b.id}`}
                        type="button"
                        disabled={!canMutate || b.status !== "completed"}
                        onClick={() => onRestore(b)}
                        title={L("Restore backup", "استعادة النسخة")}
                        className="rounded-lg p-2 text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        id={`protect-${b.id}`}
                        type="button"
                        disabled={!canMutate || b.status !== "completed"}
                        onClick={() => onProtect(b)}
                        title={b.protected ? L("Remove protection", "إزالة الحماية") : L("Protect", "حماية")}
                        className={cn(
                          "rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          b.protected ? "bg-primary-50 text-primary-600 dark:bg-primary-950/40" : "text-secondary-500 hover:bg-secondary-100 dark:hover:bg-slate-800"
                        )}
                      >
                        {b.protected ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                      </button>
                      <button
                        id={`delete-${b.id}`}
                        type="button"
                        disabled={!canMutate || b.protected}
                        onClick={() => onDelete(b)}
                        title={b.protected ? L("Protected backups cannot be deleted", "لا يمكن حذف النسخ المحمية") : L("Delete", "حذف")}
                        className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

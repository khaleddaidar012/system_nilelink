"use client"
import { Database, ArrowUpRight, AlertTriangle } from "lucide-react"
import { Link } from "@/navigation"
import type { AdminOverviewData } from "./types"

export function D1BackupStatusCard({ backups, locale }: { backups: AdminOverviewData["backups"]; locale: string }) {
  const ar = locale === "ar", available = backups.monitoring === "connected"
  const attention = backups.latestBackupStatus === "failed" || backups.isBackupOverdue || backups.missedScheduledBackup
  const time = (value?: string | null) => value ? new Date(value).toLocaleString(ar ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ar ? "لم يُسجل بعد" : "Not recorded yet"
  return <div className="flex flex-col justify-between gap-4 rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
    <div className="flex items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-bold"><Database className="h-5 w-5 text-indigo-600" />{ar ? "نسخ D1 وR2 الاحتياطية" : "D1 & R2 backups"}</h3><p className="mt-1 text-xs text-secondary-500">Cloudflare D1 · R2</p></div><span className={`rounded-full px-3 py-1 text-xs ${!available || attention ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{!available ? (ar ? "تعذر التحقق" : "Unavailable") : attention ? (ar ? "تحتاج مراجعة" : "Needs review") : (ar ? "السجلات متاحة" : "Records available")}</span></div>
    {!available ? <p role="alert" className="text-sm text-amber-700">{ar ? "تعذر قراءة سجلات النسخ. هذا لا يعني عدم وجود نسخ احتياطية." : "Backup records could not be read. This does not mean no backups exist."}</p> : <>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-secondary-50 p-3 text-xs dark:bg-slate-950"><div><p className="text-secondary-500">{ar ? "آخر نسخة مكتملة" : "Last completed"}</p><p className="mt-1 font-semibold">{time(backups.lastCompletedAt)}</p></div><div><p className="text-secondary-500">{ar ? "الموعد القادم — القاهرة" : "Next — Cairo time"}</p><p className="mt-1 font-semibold">{time(backups.nextScheduledRun)}</p></div></div>
      <div className="flex justify-between text-xs"><span>{ar ? "النسخ المكتملة:" : "Completed:"} <b>{backups.totalBackups}</b></span><span>{ar ? "تشغيلات فاشلة أو غير مؤكدة:" : "Failed / uncertain runs:"} <b>{backups.failedBackups}</b></span></div>
      <p className="text-xs text-secondary-500">{backups.firstScheduledRunObserved ? (ar ? `آخر نسخة تلقائية: ${time(backups.lastScheduledCompletedAt)}` : `Last scheduled: ${time(backups.lastScheduledCompletedAt)}`) : (ar ? "الجدولة مهيأة؛ لم يُرصد تشغيل تلقائي مكتمل بعد." : "Schedule configured; no completed scheduled run observed yet.")}</p>
      {backups.lastFailureAt && <p className="flex gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />{ar ? "آخر فشل أو نتيجة غير مؤكدة: " : "Last failed / uncertain: "}{time(backups.lastFailureAt)}</p>}
      {backups.missedScheduledBackup && <p className="text-xs text-red-600">{ar ? "تجاوز الموعد المجدول مهلة السماح دون تسجيل نسخة تلقائية مكتملة." : "The scheduled run is overdue beyond its grace period."}</p>}
    </>}
    <div className="border-t pt-3 text-xs"><p className="mb-2 text-secondary-500">{ar ? "تُفحص سجلات الاكتمال ووجود ملفات النسخ. اختبار فك التشفير والاسترجاع مستقل." : "Completion receipts and stored objects are checked. Decryption and restore testing are separate."}</p><Link href="/admin/system/backups" className="inline-flex items-center gap-1 font-semibold text-primary-600">{ar ? "عرض النسخ الاحتياطية" : "View backups"}<ArrowUpRight className="h-4 w-4" /></Link></div>
  </div>
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import { DatabaseBackup, Loader2, RefreshCw } from "lucide-react"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { BackupStatusCard } from "./BackupStatusCard"
import { BackupsTable } from "./BackupsTable"
import { RestoreDialog } from "./RestoreDialog"
import { AgentHealth, BackupJob, BackupSummary, formatBytes } from "./formatters"

const JOB_KEY = "nl-backup-job"

interface ApiError {
  error?: string
  code?: string
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & ApiError }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" })
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login?callbackUrl=/admin/system/backups"
  }
  const data = (await res.json().catch(() => ({}))) as T & ApiError
  return { ok: res.ok, status: res.status, data }
}

export function BackupsManager() {
  const locale = useLocale()
  const isAr = locale === "ar"
  const L = (en: string, ar: string) => (isAr ? ar : en)

  const [health, setHealth] = useState<AgentHealth | null>(null)
  const [items, setItems] = useState<BackupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<BackupJob | null>(null)
  const [failureBanner, setFailureBanner] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupSummary | null>(null)
  const [restoring, setRestoring] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollFailures = useRef(0)

  const online = health?.online === true
  const jobRunning = job !== null && (job.state === "queued" || job.state === "running")

  const refresh = useCallback(async () => {
    const [h, list] = await Promise.all([
      api<AgentHealth>("/api/admin/system/backups/health"),
      api<{ items: BackupSummary[] }>("/api/admin/system/backups?limit=30"),
    ])
    if (h.ok) setHealth(h.data as AgentHealth)
    if (list.ok) {
      setItems(list.data.items ?? [])
      setListError(null)
    } else if (
      list.data.code !== "AGENT_UNAVAILABLE" &&
      list.data.code !== "BACKUP_NOT_CONFIGURED" &&
      list.data.code !== "CF_ACCESS_DENIED" &&
      list.data.code !== "AGENT_AUTH_FAILED"
    ) {
      setListError(list.data.error ?? L("Could not load backups", "تعذر تحميل النسخ"))
    }
    setLoading(false)

  }, [isAr]) // eslint-disable-line react-hooks/exhaustive-deps

  // initial load + slow refresh (60 s)
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const finishJob = useCallback(
    (j: BackupJob) => {
      sessionStorage.removeItem(JOB_KEY)
      setJob(j)
      if (j.state === "succeeded") {
        if (j.kind === "restore") {
          toast.success(L("Restore completed successfully", "تم استعادة قاعدة البيانات بنجاح"))
        } else {
          toast.success(L("Backup completed", "تم إنشاء النسخة الاحتياطية"), { description: j.resultBackupId })
        }
        setFailureBanner(null)
      } else {
        const isRestore = j.kind === "restore"
        const opName = isRestore ? L("Restore", "الاستعادة") : L("Backup", "النسخ الاحتياطي")
        const msg =
          j.state === "interrupted"
            ? `${opName} ${L("was interrupted because the agent restarted.", "أُوقف لأن الخادم أُعيد تشغيله.")}`
            : j.error?.code === "BUSY"
              ? L("Another backup or restore operation is already running", "هناك عملية نسخ أو استعادة قيد التنفيذ بالفعل")
              : `${opName} ${L("failed", "فشل")}${j.error?.code ? ` (${j.error.code})` : ""}`
        toast.error(msg)
        setFailureBanner(msg)
      }
      void refresh()
    },
    [refresh, isAr] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const poll = useCallback(
    async (jobId: string) => {
      const r = await api<BackupJob>(`/api/admin/system/backups/jobs/${jobId}`)
      if (r.ok) {
        pollFailures.current = 0
        const j = r.data as BackupJob
        setJob(j)
        if (j.state === "succeeded" || j.state === "failed" || j.state === "interrupted") return finishJob(j)
      } else if (++pollFailures.current >= 8) {
        sessionStorage.removeItem(JOB_KEY)
        setJob(null)
        toast.warning(L("Status unknown - check the list below", "الحالة غير معروفة - راجع القائمة أدناه"))
        return void refresh()
      }
      pollRef.current = setTimeout(() => void poll(jobId), Math.min(2000 * (1 + pollFailures.current), 10_000))
    },
    [finishJob, refresh, isAr] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // resume polling after a page refresh
  useEffect(() => {
    const saved = sessionStorage.getItem(JOB_KEY)
    if (saved) void poll(saved)
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [poll])

  async function createBackup() {
    if (starting || jobRunning || !online) return
    setStarting(true)
    setFailureBanner(null)
    const r = await api<{ jobId: string }>("/api/admin/system/backups", {
      method: "POST",
      body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
    })
    setStarting(false)
    if (!r.ok) {
      const msg =
        r.data.code === "BUSY"
          ? L("A backup is already running", "هناك نسخة احتياطية قيد التنفيذ بالفعل")
          : r.data.error ?? L("Could not start the backup", "تعذر بدء النسخ")
      toast.error(msg)
      return
    }
    setReason("")
    sessionStorage.setItem(JOB_KEY, r.data.jobId)
    pollFailures.current = 0
    setJob({ jobId: r.data.jobId, kind: "backup", state: "queued", step: null })
    void poll(r.data.jobId)
  }

  async function handleRestore(options: {
    targetMode: "test" | "production"
    confirmPhrase?: string
    acknowledgeDataLoss?: boolean
  }) {
    if (!restoreTarget || !online || jobRunning) return
    setRestoring(true)
    const targetId = restoreTarget.id
    const r = await api<{ jobId: string }>(`/api/admin/system/backups/${targetId}/restore`, {
      method: "POST",
      body: JSON.stringify(options),
    })
    setRestoring(false)
    if (!r.ok) {
      toast.error(r.data.error ?? L("Could not start restore", "تعذر بدء عملية الاستعادة"))
      return
    }
    setRestoreTarget(null)
    sessionStorage.setItem(JOB_KEY, r.data.jobId)
    pollFailures.current = 0
    setJob({ jobId: r.data.jobId, kind: "restore", state: "queued", step: null, resultBackupId: targetId })
    toast.info(
      options.targetMode === "production"
        ? L("Production restore started (safety backup in progress)", "بدأت استعادة الإنتاج (جاري إنشاء نسخة الأمان)")
        : L("Test restore started into temporary database", "بدأ اختبار الاستعادة في قاعدة بيانات مؤقتة")
    )
    void poll(r.data.jobId)
  }

  async function toggleProtect(b: BackupSummary) {
    setBusyId(b.id)
    const r = await api(`/api/admin/system/backups/${b.id}/protect`, { method: "POST", body: JSON.stringify({ protected: !b.protected }) })
    setBusyId(null)
    if (r.ok) void refresh()
    else toast.error(r.data.error ?? L("Action failed", "فشل الإجراء"))
  }

  async function deleteBackup(b: BackupSummary) {
    if (!window.confirm(L(`Delete backup ${b.id}? This cannot be undone.`, `حذف النسخة ${b.id}؟ لا يمكن التراجع.`))) return
    setBusyId(b.id)
    const r = await api(`/api/admin/system/backups/${b.id}`, { method: "DELETE" })
    setBusyId(null)
    if (r.ok) {
      toast.success(L("Backup deleted", "تم حذف النسخة"))
      void refresh()
    } else toast.error(r.data.error ?? L("Delete failed", "فشل الحذف"))
  }

  const stepLabel = (() => {
    if (!job?.step) return L("Working...", "جارٍ التنفيذ...")
    if (job.kind === "restore") {
      if (job.step === "validating") return L("Validating...", "جاري التحقق...")
      if (job.step === "safety_backup") return L("Safety backup...", "نسخة أمان...")
      if (job.step === "restoring") return L("Restoring...", "جاري الاستعادة...")
      if (job.step === "verifying") return L("Verifying...", "جاري التحقق...")
    }
    if (job.step === "dumping") return L("Dumping database...", "جارٍ نسخ قاعدة البيانات...")
    return L("Working...", "جارٍ التنفيذ...")
  })()

  return (
    <div className="flex flex-col">
      <AdminHeader
        title={L("System Backups", "النسخ الاحتياطي للنظام")}
        subtitle={L("Automatic daily backups at 21:00 Cairo time, plus on-demand backups", "نسخ احتياطي تلقائي يوميًا الساعة 9 مساءً بتوقيت القاهرة، ونسخ عند الطلب")}
      />

      <div className="space-y-6 p-6 sm:p-8">
        <BackupStatusCard health={health} loading={loading} locale={locale} />

        {failureBanner && (
          <div id="backup-failure-banner" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            {failureBanner}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-secondary-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center">
          <input
            id="backup-reason"
            type="text"
            maxLength={200}
            value={reason}
            disabled={jobRunning || starting}
            onChange={(e) => setReason(e.target.value)}
            placeholder={L("Optional reason (e.g. before release)", "سبب اختياري (مثال: قبل التحديث)")}
            className="h-11 flex-1 rounded-xl border border-secondary-200 bg-white px-4 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            id="create-backup-button"
            type="button"
            onClick={createBackup}
            disabled={starting || jobRunning || !online}
            aria-busy={starting || jobRunning}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting || jobRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
            {starting || jobRunning ? stepLabel : L("Create Backup Now", "إنشاء نسخة احتياطية الآن")}
          </button>
          <button
            id="refresh-backups-button"
            type="button"
            onClick={() => void refresh()}
            title={L("Refresh", "تحديث")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {!online && !loading && (
          <p className="text-xs text-secondary-500 dark:text-slate-400">
            {L("Create is disabled while the agent is offline.", "إنشاء النسخ معطل أثناء عدم اتصال الخادم.")}
          </p>
        )}
        {listError && <p className="text-sm text-rose-600">{listError}</p>}
        {job?.state === "succeeded" && job.resultBackupId && (
          <p id="backup-success-note" className="text-xs text-emerald-700 dark:text-emerald-400">
            {L("Last result:", "آخر نتيجة:")} {job.resultBackupId}
            {items.find((i) => i.id === job.resultBackupId) ? ` (${formatBytes(items.find((i) => i.id === job.resultBackupId)!.sizeBytes)})` : ""}
          </p>
        )}

        <BackupsTable
          items={items}
          loading={loading}
          locale={locale}
          busyId={busyId}
          canMutate={online && !jobRunning}
          onProtect={toggleProtect}
          onDelete={deleteBackup}
          onRestore={(b) => setRestoreTarget(b)}
        />

        <RestoreDialog
          backup={restoreTarget}
          isOpen={Boolean(restoreTarget)}
          onClose={() => setRestoreTarget(null)}
          onConfirm={handleRestore}
          isSubmitting={restoring}
          locale={locale}
        />
      </div>
    </div>
  )
}

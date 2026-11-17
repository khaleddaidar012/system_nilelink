export const BACKUP_TIME_ZONE = "Africa/Cairo"

export interface BackupSummary {
  id: string
  type: "automatic" | "manual" | "safety" | "import"
  status: "completed" | "failed" | "running" | "quarantined"
  createdAt: string | null
  completedAt: string | null
  sizeBytes: number
  protected: boolean
  createdBy: { kind: "system" | "user"; userId?: string; email?: string } | null
  reason: string | null
  problem: string | null
}

export interface BackupJob {
  jobId: string
  kind: string
  state: "queued" | "running" | "succeeded" | "failed" | "interrupted"
  step: string | null
  resultBackupId?: string
  error?: { code: string; message: string }
}

export interface AgentHealth {
  online: boolean
  reason?: string
  status?: "ok" | "degraded"
  version?: string
  capabilities?: string[]
  agent?: { isLocked: boolean; currentJob: string | null; freeDiskBytes?: number; totalDiskBytes?: number; diskLow?: boolean }
  tools?: { mongodump?: string; mongorestore?: string }
  stats?: { totalBackups: number; quarantined: number; lastCompletedAt: string | null }
  scheduler?: {
    enabled: boolean
    timezone: string
    scheduleTime: string
    nextRunAt: string | null
    nextRunLocal: string | null
    last: { lastResult: string | null; lastRunAt: string | null; lastBackupId: string | null }
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function formatCairoDate(iso: string | null, locale: string): string {
  if (!iso) return "-"
  return new Intl.DateTimeFormat(locale, { timeZone: BACKUP_TIME_ZONE, year: "numeric", month: "short", day: "2-digit" }).format(new Date(iso))
}

export function formatCairoTime(iso: string | null, locale: string): string {
  if (!iso) return "-"
  return new Intl.DateTimeFormat(locale, { timeZone: BACKUP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso))
}

export function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

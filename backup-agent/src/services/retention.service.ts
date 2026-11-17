import { AgentConfig } from "../config"
import { Logger } from "../logger"
import { AgentError } from "../recovery/errors"
import { getDiskSpace } from "../storage/disk"
import { BackupStore } from "../storage/backup-store"
import { BackupSummary } from "../types/backup"

export interface RetentionPolicy {
  automaticCount: number
  safetyMinCount: number
  safetyMaxAgeDays: number
}

export interface RetentionPlan {
  keep: string[]
  delete: string[]
  reasons: Record<string, string>
  /** Set when the sweep refuses to delete anything (uncertain state). */
  aborted?: string
}

export interface PlanOptions {
  /** Safety backups referenced by a recent restore (< 30 days); always kept. */
  referencedSafetyIds?: ReadonlySet<string>
}

const DAY_MS = 86_400_000

export function policyFromConfig(config: AgentConfig): RetentionPolicy {
  return {
    automaticCount: config.retentionAutomaticCount,
    safetyMinCount: config.retentionSafetyMinCount,
    safetyMaxAgeDays: config.retentionSafetyMaxAgeDays,
  }
}

function byNewest(a: BackupSummary, b: BackupSummary): number {
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id)
}

/** Pure function: decides what to keep/delete. Fails safe (deletes nothing) when state is uncertain. */
export function planRetention(
  items: BackupSummary[],
  policy: RetentionPolicy,
  now: Date,
  options: PlanOptions = {}
): RetentionPlan {
  const plan: RetentionPlan = { keep: [], delete: [], reasons: {} }
  const keep = (item: BackupSummary, why: string) => {
    plan.keep.push(item.id)
    plan.reasons[item.id] = why
  }
  const abort = (why: string): RetentionPlan => ({
    keep: items.map((i) => i.id),
    delete: [],
    reasons: Object.fromEntries(items.map((i) => [i.id, "sweep aborted"])),
    aborted: why,
  })

  if (items.some((i) => i.status === "quarantined" || i.problem)) {
    return abort("metadata listing has unreadable or inconsistent entries")
  }
  const nowMs = now.getTime()
  if (items.some((i) => !i.createdAt || Number.isNaN(Date.parse(i.createdAt)) || Date.parse(i.createdAt) > nowMs + DAY_MS)) {
    return abort("a backup has a missing or future timestamp (clock skew)")
  }

  const completed = items.filter((i) => i.status === "completed").sort(byNewest)
  const lastValid = completed[0]

  // Candidate deletions per type
  const candidates = new Set<string>()
  const autos = completed.filter((i) => i.type === "automatic" && !i.protected)
  autos.slice(policy.automaticCount).forEach((i) => candidates.add(i.id))

  const safeties = items.filter((i) => i.type === "safety" && i.status === "completed").sort(byNewest)
  safeties.slice(policy.safetyMinCount).forEach((i) => {
    const ageDays = (nowMs - Date.parse(i.createdAt as string)) / DAY_MS
    if (ageDays > policy.safetyMaxAgeDays && !options.referencedSafetyIds?.has(i.id)) candidates.add(i.id)
  })

  for (const item of items) {
    if (candidates.has(item.id)) {
      if (lastValid && item.id === lastValid.id) {
        keep(item, "last valid backup")
      } else if (item.type === "automatic") {
        plan.delete.push(item.id)
        plan.reasons[item.id] = `automatic backup beyond newest ${policy.automaticCount}`
      } else {
        plan.delete.push(item.id)
        plan.reasons[item.id] = `safety backup older than ${policy.safetyMaxAgeDays} days`
      }
      continue
    }
    if (lastValid && item.id === lastValid.id) keep(item, "last valid backup")
    else if (item.type === "manual" || item.type === "import") keep(item, `${item.type} backups are never auto-deleted`)
    else if (item.protected && item.type !== "safety") keep(item, "protected")
    else if (item.status !== "completed") keep(item, `status ${item.status}`)
    else keep(item, "within retention window")
  }

  // Final guard: at least one valid backup must remain
  const remainingValid = completed.filter((i) => !plan.delete.includes(i.id))
  if (completed.length > 0 && remainingValid.length === 0) return abort("sweep would remove every valid backup")

  return plan
}

export interface RetentionSummary {
  deleted: string[]
  failed: { id: string; code: string }[]
  aborted?: string
}

export interface DiskPressure {
  low: boolean
  freeBytes?: number
  minFreeBytes: number
}

export class RetentionService {
  constructor(
    private readonly config: AgentConfig,
    private readonly store: BackupStore,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date()
  ) {}

  async preview(): Promise<RetentionPlan> {
    return planRetention(await this.store.list(), policyFromConfig(this.config), this.now())
  }

  /** Runs the sweep. Never throws; failures are logged and kept for the next sweep. */
  async sweep(): Promise<RetentionSummary> {
    const summary: RetentionSummary = { deleted: [], failed: [] }
    try {
      const items = await this.store.list()
      const plan = planRetention(items, policyFromConfig(this.config), this.now())
      if (plan.aborted) {
        this.logger.warn("retention sweep aborted, nothing deleted", { reason: plan.aborted })
        summary.aborted = plan.aborted
        return summary
      }
      const typeById = new Map(items.map((i) => [i.id, i.type]))
      for (const id of plan.delete) {
        try {
          // store.delete re-checks protected/in-use/last-valid guards at execution time
          await this.store.delete(id, { allowProtected: typeById.get(id) === "safety" })
          summary.deleted.push(id)
          this.logger.info("backup deleted by retention", { id, reason: plan.reasons[id] })
        } catch (err) {
          const code = err instanceof AgentError ? err.code : "INTERNAL"
          summary.failed.push({ id, code })
          this.logger.warn("retention could not delete backup", { id, code })
          if (!(err instanceof AgentError)) await this.store.markQuarantined(id)
        }
      }
    } catch (err) {
      this.logger.error("retention sweep failed", { error: err })
      summary.aborted = "sweep failed"
    }
    const pressure = await this.diskPressure()
    if (pressure.low) {
      this.logger.warn("free disk space is below the retention minimum; manual/protected backups are never deleted to make room", {
        freeBytes: pressure.freeBytes,
        minFreeBytes: pressure.minFreeBytes,
      })
    }
    return summary
  }

  async diskPressure(): Promise<DiskPressure> {
    const minFreeBytes = this.config.retentionMinFreeBytes
    try {
      const disk = await getDiskSpace(this.config.backupRoot)
      return { low: disk.freeBytes < minFreeBytes, freeBytes: disk.freeBytes, minFreeBytes }
    } catch {
      return { low: false, minFreeBytes }
    }
  }
}

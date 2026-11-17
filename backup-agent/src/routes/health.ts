import { AgentConfig } from "../config"
import { Scheduler } from "../scheduler/scheduler"
import { RetentionService } from "../services/retention.service"
import { JobLock } from "../services/job-lock"
import { ToolRunner } from "../services/mongo-tools"
import { BackupStore } from "../storage/backup-store"
import { getDiskSpace } from "../storage/disk"

export const AGENT_VERSION = "0.2.2"

/** Features this agent build supports; the dashboard uses this to detect outdated agents. */
export const AGENT_CAPABILITIES = ["backups", "restore", "scheduler", "retention", "mail-monitoring"] as const

/** Detailed health (authenticated only). Never exposes filesystem paths, hosts or connection strings. */
export async function buildDetailedHealth(deps: {
  config: AgentConfig
  store: BackupStore
  lock: JobLock
  tools: ToolRunner
  scheduler: Scheduler
  retention: RetentionService
}) {
  const { config, store, lock, tools, scheduler, retention } = deps
  const disk = await getDiskSpace(config.backupRoot).catch(() => undefined)
  const mongodump = await tools.version("mongodump").catch(() => "not_found")
  const mongorestore = await tools.version("mongorestore").catch(() => "not_found")
  const list = await store.list().catch(() => [])
  const lastCompleted = list.find((b) => b.status === "completed")
  const pressure = await retention.diskPressure()

  return {
    status: mongodump !== "not_found" && !pressure.low ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: AGENT_VERSION,
    capabilities: [...AGENT_CAPABILITIES],
    agent: {
      isLocked: lock.isLocked(),
      currentJob: lock.owner(),
      freeDiskBytes: disk?.freeBytes,
      totalDiskBytes: disk?.totalBytes,
      diskLow: pressure.low,
    },
    tools: { mongodump, mongorestore },
    stats: {
      totalBackups: list.length,
      quarantined: list.filter((b) => b.status === "quarantined").length,
      lastCompletedAt: lastCompleted?.completedAt ?? null,
    },
    scheduler: await scheduler.info(),
  }
}

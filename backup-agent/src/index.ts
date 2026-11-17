import path from "node:path"
import { loadConfig } from "./config"
import { createLogger } from "./logger"
import { ensureLayout, lockFilePath, logsDir } from "./storage/layout"
import { BackupStore } from "./storage/backup-store"
import { JobLock } from "./services/job-lock"
import { createSpawnRunner } from "./services/mongo-tools"
import { createAgentServer } from "./server"
import { BackupService } from "./services/backup.service"
import { JobManager } from "./services/job-manager"
import { RetentionService } from "./services/retention.service"
import { Scheduler } from "./scheduler/scheduler"
import { schedulerStatePath } from "./scheduler/state"
import { setupGracefulShutdown } from "./lib/shutdown"
import { AGENT_VERSION } from "./routes/health"

async function main() {
  // 1. Load validated configuration
  const config = loadConfig()

  // 2. Initialize directories
  await ensureLayout(config.backupRoot)

  // 3. Initialize logger
  const logger = createLogger({
    dir: logsDir(config.backupRoot),
    level: config.logLevel,
    console: true,
  })

  logger.info("initializing Nile Link Backup Agent...", {
    version: AGENT_VERSION,
    backupRoot: config.backupRoot,
    bind: config.bind,
    port: config.port,
    mongoDb: config.mongoDb,
  })

  // 4. Initialize storage & tools
  const store = new BackupStore(config.backupRoot)
  const lock = new JobLock(lockFilePath(config.backupRoot), logger)
  const tools = createSpawnRunner(config.mongoToolsDir, logger)

  // 5. Services, jobs, retention and scheduler
  const backups = new BackupService(config, store, lock, tools, logger)
  const jobs = new JobManager(path.join(logsDir(config.backupRoot), "jobs"), logger)
  const interrupted = await jobs.recover()
  if (interrupted > 0) logger.warn("marked jobs from a previous run as interrupted", { count: interrupted })
  const retention = new RetentionService(config, store, logger)
  const scheduler = new Scheduler(
    {
      enabled: config.schedulerEnabled,
      timeHHmm: config.scheduleTime,
      timezone: config.timezone,
      graceMinutes: config.missedRunGraceMinutes,
      statePath: schedulerStatePath(config.backupRoot),
    },
    {
      logger,
      runBackup: async () => {
        const r = await backups.createBackup({ type: "automatic", createdBy: { kind: "system" }, reason: "scheduled" })
        return { id: r.metadata.id }
      },
      afterSuccess: () => retention.sweep(),
    }
  )

  // 6. Start HTTP server
  const server = createAgentServer({ config, store, lock, tools, logger, backups, jobs, scheduler, retention })

  server.listen(config.port, config.bind, () => {
    logger.info(`Backup Agent listening on http://${config.bind}:${config.port}`)
    scheduler.start() // after the server is up
  })

  // 7. Graceful shutdown hooks
  setupGracefulShutdown(server, lock, logger, () => scheduler.stop())
}

main().catch((err) => {
  console.error("FATAL: Failed to start Backup Agent:", err)
  process.exit(1)
})

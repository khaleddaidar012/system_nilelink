/**
 * DEV ONLY. Runs the real agent (API, auth, scheduler, retention, store) with a FAKE mongodump so the
 * dashboard can be tested in a browser without MongoDB Database Tools or any database.
 * Backups are written to a temp folder, never to production storage.
 *
 *   AGENT_HMAC_KEYS='{"k1":"<64 hex>"}' npx tsx scripts/dev-mock-agent.ts
 */
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { loadConfig } from "../src/config"
import { createLogger } from "../src/logger"
import { createAgentServer } from "../src/server"
import { BackupService } from "../src/services/backup.service"
import { JobLock } from "../src/services/job-lock"
import { JobManager } from "../src/services/job-manager"
import { RetentionService } from "../src/services/retention.service"
import { MailMonitorService } from "../src/services/mail-monitor.service"
import { ToolRunner } from "../src/services/mongo-tools"
import { Scheduler } from "../src/scheduler/scheduler"
import { schedulerStatePath } from "../src/scheduler/state"
import { BackupStore } from "../src/storage/backup-store"
import { ensureLayout, lockFilePath, logsDir } from "../src/storage/layout"

const DELAY_MS = Number(process.env.MOCK_DUMP_DELAY_MS ?? 4000)

const fakeTools: ToolRunner = {
  async version() {
    return "100.0.0-mock"
  },
  async run(tool, args) {
    if (tool === "mongorestore") {
      await new Promise((r) => setTimeout(r, DELAY_MS))
      return { code: 0, stdout: "mock mongorestore done", stderr: "restoring 12 documents\n", timedOut: false }
    }
    if (tool !== "mongodump") return { code: 0, stdout: "", stderr: "", timedOut: false }
    const archive = args.find((a) => a.startsWith("--archive="))?.slice("--archive=".length)
    if (!archive) return { code: 1, stdout: "", stderr: "no archive", timedOut: false }
    await new Promise((r) => setTimeout(r, DELAY_MS))
    const payload = Buffer.from(JSON.stringify({ mock: true, at: new Date().toISOString(), filler: "x".repeat(20_000) }))
    await fs.writeFile(archive, zlib.gzipSync(payload))
    const db = process.env.MONGO_DB_NAME ?? "nilelink"
    return {
      code: 0,
      stdout: "",
      stderr: `done dumping ${db}.users (12 documents)\ndone dumping ${db}.customers (7 documents)\n`,
      timedOut: false,
    }
  },
}

async function main() {
  const root = process.env.BACKUP_ROOT ?? path.join(os.tmpdir(), "nilelink-dev-backups")
  const config = loadConfig({
    ...process.env,
    BACKUP_ROOT: root,
    MONGODB_URI: "mongodb://127.0.0.1:27017/mock", // never contacted: fake tools
    MONGO_DB_NAME: process.env.MONGO_DB_NAME ?? "nilelink",
    MONGO_SOURCE_LABEL: "dev-mock",
    AGENT_PORT: process.env.AGENT_PORT ?? "8787",
    MIN_ARCHIVE_BYTES: "10",
    MIN_FREE_GB: "0",
  })
  await ensureLayout(root)
  const logger = createLogger({ dir: logsDir(root), level: "info", console: true })
  const store = new BackupStore(root)
  const lock = new JobLock(lockFilePath(root), logger)
  const backups = new BackupService(config, store, lock, fakeTools, logger)
  const jobs = new JobManager(path.join(logsDir(root), "jobs"), logger)
  await jobs.recover()
  const retention = new RetentionService(config, store, logger)
  const scheduler = new Scheduler(
    {
      enabled: config.schedulerEnabled,
      timeHHmm: config.scheduleTime,
      timezone: config.timezone,
      graceMinutes: config.missedRunGraceMinutes,
      statePath: schedulerStatePath(root),
    },
    {
      logger,
      runBackup: async () => ({ id: (await backups.createBackup({ type: "automatic", reason: "scheduled" })).metadata.id }),
      afterSuccess: () => retention.sweep(),
    }
  )
  const mailMonitor = new MailMonitorService(
    {
      host: config.mailEnable.host,
      smtpPort: config.mailEnable.smtpPort,
      imapPort: config.mailEnable.imapPort,
      smtpService: config.mailEnable.smtpService,
      imapService: config.mailEnable.imapService,
      mailEnablePath: config.mailEnable.path,
      badMailPath: config.mailEnable.badMailPath,
      isMock: process.env.MOCK_MAILENABLE === "true",
    },
    logger
  )
  const server = createAgentServer({ config, store, lock, tools: fakeTools, logger, backups, jobs, scheduler, retention, mailMonitor })
  server.listen(config.port, config.bind, () => {
    logger.info("DEV MOCK AGENT listening (fake mongodump)", { port: config.port, root })
    scheduler.start()
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

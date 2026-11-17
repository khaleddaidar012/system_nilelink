import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentConfig } from "../../src/config"
import { generateBackupId } from "../../src/lib/ids"
import { AgentError } from "../../src/recovery/errors"
import { BackupService } from "../../src/services/backup.service"
import { JobLock } from "../../src/services/job-lock"
import { ToolRunner, ToolResult } from "../../src/services/mongo-tools"
import { RestoreService } from "../../src/services/restore.service"
import { BackupStore } from "../../src/storage/backup-store"
import { ensureLayout, typeDir } from "../../src/storage/layout"
import { ARCHIVE_FILE_NAME, METADATA_FILE_NAME } from "../../src/types/backup"
import { sha256File } from "../../src/storage/metadata"

describe("RestoreService", () => {
  let rootDir: string
  let store: BackupStore
  let lock: JobLock
  let mockTools: ToolRunner
  let mockLogger: any
  let backupService: BackupService
  let restoreService: RestoreService
  let config: AgentConfig

  const executedTools: Array<{ tool: string; args: string[] }> = []

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "restore-test-"))
    await ensureLayout(rootDir)

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      flush: async () => {},
    }

    config = {
      backupRoot: rootDir,
      port: 8787,
      bind: "127.0.0.1",
      mongoDb: "nilelink",
      sourceLabel: "test",
      logLevel: "info",
      dumpTimeoutMs: 10_000,
      minFreeBytes: 0,
      minArchiveBytes: 10,
      requiredCollections: ["users"],
      verifyWithDryRun: false,
      retentionAutomaticCount: 30,
      retentionSafetyMinCount: 3,
      retentionSafetyMaxAgeDays: 30,
      retentionMinFreeBytes: 0,
      scheduleTime: "21:00",
      timezone: "Africa/Cairo",
      schedulerEnabled: false,
      missedRunGraceMinutes: 180,
      getMongoUri: async () => "mongodb://127.0.0.1:27017/nilelink",
    } as unknown as AgentConfig

    store = new BackupStore(rootDir)
    lock = new JobLock(path.join(rootDir, "temp", "job.lock"), mockLogger)

    executedTools.length = 0
    mockTools = {
      version: async () => "100.9.0",
      run: async (tool, args): Promise<ToolResult> => {
        executedTools.push({ tool, args })
        if (tool === "mongodump") {
          // create a valid dummy gzipped archive for the safety backup
          const archiveArg = args.find((a) => a.startsWith("--archive="))?.slice("--archive=".length)
          if (archiveArg) {
            await writeFile(archiveArg, zlib.gzipSync(Buffer.from("mock mongo dump content")))
          }
          return {
            code: 0,
            stdout: "",
            stderr: "done dumping nilelink.users (5 documents)\n",
            timedOut: false,
          }
        }
        return { code: 0, stdout: "done", stderr: "", timedOut: false }
      },
    }

    backupService = new BackupService(config, store, lock, mockTools, mockLogger)
    restoreService = new RestoreService(config, store, lock, mockTools, backupService, mockLogger)
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  async function createValidBackupOnDisk(id: string): Promise<void> {
    const dir = path.join(typeDir(rootDir, "manual"), id)
    const archivePath = path.join(dir, ARCHIVE_FILE_NAME)
    const content = zlib.gzipSync(Buffer.from("test backup data"))
    await ensureLayout(rootDir)
    const fs = await import("node:fs/promises")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(archivePath, content)

    const checksum = await sha256File(archivePath)
    const metadata = {
      schemaVersion: 1 as const,
      id,
      type: "manual" as const,
      status: "completed" as const,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdBy: { kind: "system" as const },
      source: { host: "test", database: "nilelink" },
      archive: {
        file: ARCHIVE_FILE_NAME,
        sizeBytes: content.length,
        sha256: checksum,
        compression: "gzip" as const,
      },
      collections: [{ name: "users", documents: 10 }],
      verification: { verifiedAt: new Date().toISOString(), method: "gzipTest" as const, ok: true },
      protected: false,
    }
    await fs.writeFile(path.join(dir, METADATA_FILE_NAME), JSON.stringify(metadata))
  }

  it("fails if the backup does not exist", async () => {
    const steps: string[] = []
    const missingId = generateBackupId("manual")
    await expect(
      restoreService.executeRestore(missingId, {}, (s) => steps.push(s))
    ).rejects.toThrow()
  })

  it("fails if the backup is corrupt (checksum or size mismatch)", async () => {
    const id = generateBackupId("manual")
    await createValidBackupOnDisk(id)
    // Tamper with archive
    const archivePath = path.join(typeDir(rootDir, "manual"), id, ARCHIVE_FILE_NAME)
    await writeFile(archivePath, zlib.gzipSync(Buffer.from("tampered data")))

    await expect(
      restoreService.executeRestore(id, {}, () => {})
    ).rejects.toThrowError(/Archive size does not match metadata|integrity verification/)
  })

  it("executes test restore into an isolated database without creating a safety backup", async () => {
    const id = generateBackupId("manual")
    await createValidBackupOnDisk(id)

    const steps: string[] = []
    const result = await restoreService.executeRestore(
      id,
      { targetMode: "test", targetDbName: "nilelink_test_db" },
      (s) => steps.push(s)
    )

    expect(result.targetMode).toBe("test")
    expect(result.targetDb).toBe("nilelink_test_db")
    expect(result.restoredBackupId).toBe(id)
    expect(steps).toContain("validating")
    expect(steps).toContain("restoring")
    expect(steps).toContain("verifying")
    expect(steps).not.toContain("safety_backup")

    const restoreCall = executedTools.find((t) => t.tool === "mongorestore")
    expect(restoreCall).toBeDefined()
    expect(restoreCall?.args).toContain("--nsFrom=nilelink.*")
    expect(restoreCall?.args).toContain("--nsTo=nilelink_test_db.*")
    expect(restoreCall?.args).toContain("--drop")
  })

  it("rejects production restore if confirmPhrase is missing", async () => {
    const id = generateBackupId("manual")
    await createValidBackupOnDisk(id)

    await expect(
      restoreService.executeRestore(id, { targetMode: "production", acknowledgeDataLoss: true }, () => {})
    ).rejects.toThrowError(/confirmPhrase 'RESTORE'/)
  })

  it("rejects production restore if acknowledgeDataLoss is false", async () => {
    const id = generateBackupId("manual")
    await createValidBackupOnDisk(id)

    await expect(
      restoreService.executeRestore(id, { targetMode: "production", confirmPhrase: "RESTORE" }, () => {})
    ).rejects.toThrowError(/acknowledgeDataLoss=true/)
  })

  it("executes production restore with mandatory verified safety backup first", async () => {
    const id = generateBackupId("manual")
    await createValidBackupOnDisk(id)

    const steps: string[] = []
    const result = await restoreService.executeRestore(
      id,
      { targetMode: "production", confirmPhrase: "RESTORE", acknowledgeDataLoss: true },
      (s) => steps.push(s)
    )

    expect(result.targetMode).toBe("production")
    expect(result.targetDb).toBe("nilelink")
    expect(result.safetyBackupId).toBeDefined()
    expect(result.safetyBackupId).toMatch(/^bk_\d{8}T\d{6}Z_safety_[a-z0-9]{8}$/)
    expect(steps).toEqual(["validating", "safety_backup", "restoring", "verifying"])

    // mongodump must have run for the safety backup before mongorestore was called
    const dumpIndex = executedTools.findIndex((t) => t.tool === "mongodump")
    const restoreIndex = executedTools.findIndex((t) => t.tool === "mongorestore")
    expect(dumpIndex).toBeGreaterThanOrEqual(0)
    expect(restoreIndex).toBeGreaterThan(dumpIndex)

    const restoreCall = executedTools[restoreIndex]
    expect(restoreCall.args).toContain("--drop")
    expect(restoreCall.args).toContain("--nsInclude=nilelink.*")
  })

  it("aborts production restore without calling mongorestore if safety backup fails", async () => {
    const id = generateBackupId("manual")
    await createValidBackupOnDisk(id)

    // Force mongodump to fail
    mockTools.run = async (tool): Promise<ToolResult> => {
      if (tool === "mongodump") {
        return { code: 1, stdout: "", stderr: "disk full", timedOut: false }
      }
      return { code: 0, stdout: "", stderr: "", timedOut: false }
    }

    await expect(
      restoreService.executeRestore(
        id,
        { targetMode: "production", confirmPhrase: "RESTORE", acknowledgeDataLoss: true },
        () => {}
      )
    ).rejects.toThrow()

    // Ensure mongorestore was NEVER called
    const restoreCall = executedTools.find((t) => t.tool === "mongorestore")
    expect(restoreCall).toBeUndefined()
  })
})

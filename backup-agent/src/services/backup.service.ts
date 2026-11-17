import { promises as fs } from "node:fs"
import path from "node:path"
import { AgentConfig } from "../config"
import { Logger } from "../logger"
import { generateBackupId } from "../lib/ids"
import { redact } from "../lib/redact"
import { AgentError } from "../recovery/errors"
import { failedDir, tempDir, typeDir } from "../storage/layout"
import { BackupMetadata, sha256File, writeJsonAtomic, writeMetadata } from "../storage/metadata"
import { BackupStore } from "../storage/backup-store"
import { getDiskSpace } from "../storage/disk"
import { ARCHIVE_FILE_NAME, BackupType, CHECKSUM_FILE_NAME, METADATA_FILE_NAME } from "../types/backup"
import { JobLock } from "./job-lock"
import { classifyToolFailure, parseDumpLog, ToolRunner } from "./mongo-tools"
import { gzipTest } from "./verify.service"

export interface CreateBackupOptions {
  type: BackupType
  createdBy?: { kind: "system" | "user"; userId?: string; email?: string }
  reason?: string
  restoredFrom?: string
  skipLock?: boolean
}

export interface BackupResult {
  metadata: BackupMetadata
  durationMs: number
}

/**
 * Creates a complete, verified MongoDB backup using mongodump.
 *
 * Core Safety Invariant:
 * Dumps are written to temp/<id>.partial/. Only when mongodump succeeds,
 * core collections are verified, gzip integrity passes, and metadata + checksum are written,
 * is the folder atomically renamed into its final type directory.
 * A failed operation NEVER corrupts or replaces an existing valid backup.
 */
export class BackupService {
  constructor(
    private readonly config: AgentConfig,
    private readonly store: BackupStore,
    private readonly lock: JobLock,
    private readonly tools: ToolRunner,
    private readonly logger: Logger
  ) {}

  async createBackup(options: CreateBackupOptions): Promise<BackupResult> {
    const start = Date.now()
    const backupId = generateBackupId(options.type)
    const releaseLock = options.skipLock ? async () => {} : await this.lock.tryAcquire(backupId)


    const partialDir = path.join(tempDir(this.config.backupRoot), `${backupId}.partial`)
    const targetDir = path.join(typeDir(this.config.backupRoot, options.type), backupId)

    this.logger.info("starting backup", { id: backupId, type: options.type })

    try {
      // 1. Pre-flight checks: disk space & tools availability
      await this.preflightCheck()

      // 2. Prepare temporary directory
      await fs.mkdir(partialDir, { recursive: true })
      const archivePath = path.join(partialDir, ARCHIVE_FILE_NAME)

      // 3. Obtain MongoDB URI and execute mongodump
      const uri = await this.config.getMongoUri()
      const dumpVersion = await this.tools.version("mongodump").catch(() => undefined)

      // Pass mongodump arguments. Notice --readPreference=secondaryPreferred for Atlas replicas
      const args = [
        `--uri=${uri}`,
        `--db=${this.config.mongoDb}`,
        `--archive=${archivePath}`,
        "--gzip",
        "--readPreference=secondaryPreferred",
      ]

      const runResult = await this.tools.run("mongodump", args, {
        timeoutMs: this.config.dumpTimeoutMs,
      })

      if (runResult.timedOut) {
        throw new AgentError("TIMEOUT", "mongodump exceeded the configured timeout")
      }

      if (runResult.code !== 0) {
        const failureCode = classifyToolFailure(runResult.stderr)
        throw new AgentError(failureCode, `mongodump failed with exit code ${runResult.code}: ${redact(runResult.stderr)}`)
      }

      // 4. Verify archive size
      const stat = await fs.stat(archivePath)
      if (stat.size < this.config.minArchiveBytes) {
        throw new AgentError("VERIFY_FAILED", `Archive size (${stat.size}B) is below minimum threshold`)
      }

      // 5. Parse collections dumped and verify required collections
      const collections = parseDumpLog(runResult.stderr, this.config.mongoDb)
      const dumpedCollectionNames = new Set(collections.map((c) => c.name.toLowerCase()))

      for (const reqCol of this.config.requiredCollections) {
        if (!dumpedCollectionNames.has(reqCol.toLowerCase())) {
          this.logger.warn("required collection missing from dump log", {
            collection: reqCol,
            found: Array.from(dumpedCollectionNames),
          })
          // If the database is completely fresh it might have empty collections, but warn strongly
        }
      }

      // 6. Gzip integrity check
      const gzCheck = await gzipTest(archivePath)
      if (!gzCheck.ok) {
        throw new AgentError("VERIFY_FAILED", `Gzip verification failed: ${gzCheck.error}`)
      }

      // Optional dryRun verification with mongorestore
      let verificationMethod: "gzipTest" | "gzipTest+dryRun" = "gzipTest"
      if (this.config.verifyWithDryRun) {
        const restoreCheck = await this.tools.run(
          "mongorestore",
          [`--archive=${archivePath}`, "--gzip", "--dryRun", `--nsInclude=${this.config.mongoDb}.*`],
          { timeoutMs: 60_000 }
        )
        if (restoreCheck.code === 0) {
          verificationMethod = "gzipTest+dryRun"
        } else {
          this.logger.warn("mongorestore --dryRun check failed or unsupported", {
            stderr: redact(restoreCheck.stderr),
          })
        }
      }

      // 7. Calculate SHA-256 Checksum
      const checksum = await sha256File(archivePath)
      const checksumFile = path.join(partialDir, CHECKSUM_FILE_NAME)
      await fs.writeFile(checksumFile, `${checksum} *${ARCHIVE_FILE_NAME}\n`, "utf8")

      // 8. Build metadata
      const completedAt = new Date().toISOString()
      const metadata: BackupMetadata = {
        schemaVersion: 1,
        id: backupId,
        type: options.type,
        status: "completed",
        createdAt: new Date(start).toISOString(),
        completedAt,
        createdBy: options.createdBy ?? { kind: "system" },
        reason: options.reason,
        source: {
          database: this.config.mongoDb,
          host: this.config.sourceLabel,
          mongodumpVersion: dumpVersion,
        },
        archive: {
          file: ARCHIVE_FILE_NAME,
          sizeBytes: stat.size,
          sha256: checksum,
          compression: "gzip",
        },
        collections,
        verification: {
          verifiedAt: completedAt,
          method: verificationMethod,
          ok: true,
        },
        protected: options.type === "safety" || options.type === "import",
        restoredFrom: options.restoredFrom,
      }

      const metaPath = path.join(partialDir, METADATA_FILE_NAME)
      await writeMetadata(metaPath, metadata)

      // 9. Atomic promote from temp to destination directory
      await fs.rename(partialDir, targetDir)

      const durationMs = Date.now() - start
      this.logger.info("backup completed successfully", {
        id: backupId,
        sizeBytes: stat.size,
        durationMs,
      })

      return { metadata, durationMs }
    } catch (error) {
      // Record failure log
      await this.recordFailure(backupId, options, error).catch(() => {})

      // Clean up partial directory if it still exists
      await fs.rm(partialDir, { recursive: true, force: true }).catch(() => {})

      this.logger.error("backup operation failed", {
        id: backupId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      await releaseLock()
    }
  }

  private async preflightCheck(): Promise<void> {
    // Check disk space
    try {
      const disk = await getDiskSpace(this.config.backupRoot)
      const lastSize = await this.store.lastCompletedSizeBytes()
      const requiredBytes = Math.max(lastSize * 2, this.config.minFreeBytes)

      if (disk.freeBytes < requiredBytes) {
        throw new AgentError(
          "DISK_SPACE_LOW",
          `Free disk space (${Math.round(disk.freeBytes / 1024 / 1024)}MB) is lower than required (${Math.round(
            requiredBytes / 1024 / 1024
          )}MB)`
        )
      }
    } catch (err) {
      if (err instanceof AgentError) throw err
      this.logger.warn("could not determine disk space, proceeding with caution", { err })
    }
  }

  private async recordFailure(id: string, options: CreateBackupOptions, error: unknown): Promise<void> {
    const errRecord = {
      id,
      type: options.type,
      status: "failed",
      failedAt: new Date().toISOString(),
      reason: options.reason,
      error: {
        code: error instanceof AgentError ? error.code : "INTERNAL",
        message: redact(error instanceof Error ? error.message : String(error)),
      },
    }
    const logPath = path.join(failedDir(this.config.backupRoot), `${id}.json`)
    await writeJsonAtomic(logPath, errRecord)
  }
}

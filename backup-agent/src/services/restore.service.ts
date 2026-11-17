import path from "node:path"
import { AgentConfig } from "../config"
import { Logger } from "../logger"
import { redact } from "../lib/redact"
import { AgentError } from "../recovery/errors"
import { ARCHIVE_FILE_NAME } from "../types/backup"
import { BackupStore } from "../storage/backup-store"
import { resolveBackupDir } from "../storage/safe-path"
import { BackupService } from "./backup.service"
import { JobLock } from "./job-lock"
import { classifyToolFailure, ToolRunner } from "./mongo-tools"
import { verifyStoredBackup } from "./verify.service"

export interface RestoreOptions {
  targetMode?: "test" | "production"
  targetDbName?: string
  confirmPhrase?: string
  acknowledgeDataLoss?: boolean
}

export interface RestoreResult {
  targetMode: "test" | "production"
  targetDb: string
  restoredBackupId: string
  safetyBackupId?: string
}

export class RestoreService {
  constructor(
    private readonly config: AgentConfig,
    private readonly store: BackupStore,
    private readonly lock: JobLock,
    private readonly tools: ToolRunner,
    private readonly backups: BackupService,
    private readonly logger: Logger
  ) {}

  async executeRestore(
    id: string,
    options: RestoreOptions,
    setStep: (step: string) => void
  ): Promise<RestoreResult> {
    const targetMode = options.targetMode ?? "test"
    const releaseLock = await this.lock.tryAcquire(`restore_${id}`)

    try {
      // 1. Validation & Preflight Checks
      setStep("validating")
      this.logger.info("validating backup for restore", { id, targetMode })

      const md = await this.store.get(id)
      if (md.status !== "completed") {
        throw new AgentError("INVALID_REQUEST", "Only completed backups can be restored")
      }

      const verification = await verifyStoredBackup(this.config.backupRoot, this.store, id)
      if (!verification.ok) {
        throw new AgentError(
          "CORRUPT_BACKUP",
          `Backup failed integrity verification: ${verification.problems.join(", ")}`
        )
      }

      const { dir } = resolveBackupDir(this.config.backupRoot, id)
      const archivePath = path.join(dir, ARCHIVE_FILE_NAME)
      const uri = await this.config.getMongoUri()

      let safetyBackupId: string | undefined

      if (targetMode === "production") {
        // Enforce strict confirmation for production
        if (options.confirmPhrase !== "RESTORE") {
          throw new AgentError("INVALID_REQUEST", "Production restore requires confirmPhrase 'RESTORE'")
        }
        if (!options.acknowledgeDataLoss) {
          throw new AgentError("INVALID_REQUEST", "Production restore requires acknowledgeDataLoss=true")
        }

        // 2. Mandatory Pre-Restore Safety Backup of Current Live Database
        setStep("safety_backup")
        this.logger.info("creating pre-restore safety backup of live database", {
          targetBackupId: id,
        })

        const safetyResult = await this.backups.createBackup({
          type: "safety",
          reason: `Automatic safety backup before restoring ${id}`,
          restoredFrom: id,
          skipLock: true,
        })
        safetyBackupId = safetyResult.metadata.id

        // Verify the newly created safety backup
        const safetyVerification = await verifyStoredBackup(
          this.config.backupRoot,
          this.store,
          safetyBackupId
        )
        if (!safetyVerification.ok) {
          throw new AgentError(
            "SAFETY_BACKUP_FAILED",
            "Newly created safety backup failed verification; aborting restore without changes"
          )
        }

        this.logger.info("safety backup verified successfully, proceeding with restore", {
          safetyBackupId,
        })

        // 3. Destructive Live Database Restore
        setStep("restoring")
        const args = [
          `--uri=${uri}`,
          `--archive=${archivePath}`,
          "--gzip",
          "--drop",
          `--nsInclude=${this.config.mongoDb}.*`,
        ]

        const runResult = await this.tools.run("mongorestore", args, {
          timeoutMs: this.config.dumpTimeoutMs,
        })

        if (runResult.timedOut) {
          throw new AgentError("TIMEOUT", "mongorestore exceeded timeout during production restore")
        }

        if (runResult.code !== 0) {
          const failureCode = classifyToolFailure(runResult.stderr)
          this.logger.error("mongorestore failed during production restore", {
            code: runResult.code,
            stderr: redact(runResult.stderr),
            safetyBackupId,
          })
          throw new AgentError(
            failureCode,
            `mongorestore failed (code ${runResult.code}): ${redact(runResult.stderr)}`
          )
        }

        setStep("verifying")
        this.logger.info("production restore completed successfully", {
          restoredBackupId: id,
          safetyBackupId,
        })

        return {
          targetMode: "production",
          targetDb: this.config.mongoDb,
          restoredBackupId: id,
          safetyBackupId,
        }
      } else {
        // Test Restore Mode: restores into an isolated database
        const targetDb = options.targetDbName || `${this.config.mongoDb}_restore_test`
        if (targetDb === this.config.mongoDb) {
          throw new AgentError(
            "INVALID_REQUEST",
            "Test restore target database cannot match the production database"
          )
        }

        setStep("restoring")
        this.logger.info("starting test restore into isolated database", {
          id,
          targetDb,
        })

        const args = [
          `--uri=${uri}`,
          `--archive=${archivePath}`,
          "--gzip",
          "--drop",
          `--nsFrom=${this.config.mongoDb}.*`,
          `--nsTo=${targetDb}.*`,
        ]

        const runResult = await this.tools.run("mongorestore", args, {
          timeoutMs: this.config.dumpTimeoutMs,
        })

        if (runResult.timedOut) {
          throw new AgentError("TIMEOUT", "mongorestore exceeded timeout during test restore")
        }

        if (runResult.code !== 0) {
          const failureCode = classifyToolFailure(runResult.stderr)
          throw new AgentError(
            failureCode,
            `mongorestore failed (code ${runResult.code}): ${redact(runResult.stderr)}`
          )
        }

        setStep("verifying")
        this.logger.info("test restore completed successfully", {
          restoredBackupId: id,
          targetDb,
        })

        return {
          targetMode: "test",
          targetDb,
          restoredBackupId: id,
        }
      }
    } finally {
      await releaseLock()
    }
  }
}

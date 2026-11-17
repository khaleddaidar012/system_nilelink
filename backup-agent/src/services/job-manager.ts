import crypto from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { AgentError, AgentErrorCode } from "../recovery/errors"
import { redact } from "../lib/redact"
import { Logger } from "../logger"
import { writeJsonAtomic } from "../storage/metadata"

export const JOB_ID_REGEX = /^job_[a-f0-9]{16}$/
export type JobState = "queued" | "running" | "succeeded" | "failed" | "interrupted"
export type JobKind = "backup" | "verify" | "restore" | "import"

export interface JobRecord {
  jobId: string
  kind: JobKind
  state: JobState
  step: string | null
  createdAt: string
  updatedAt: string
  resultBackupId?: string
  error?: { code: string; message: string }
}

export type JobRunner = (setStep: (step: string) => void) => Promise<{ resultBackupId?: string } | void>

/** Async job registry persisted to <logs>/jobs/<jobId>.json. Every job ends in a terminal state. */
export class JobManager {
  private readonly jobs = new Map<string, JobRecord>()

  constructor(
    private readonly dir: string,
    private readonly logger: Logger
  ) {}

  /** Call at startup: anything left queued/running by a previous process is marked interrupted. */
  async recover(): Promise<number> {
    await fs.mkdir(this.dir, { recursive: true })
    let count = 0
    for (const name of await fs.readdir(this.dir)) {
      const id = name.replace(/\.json$/, "")
      if (!JOB_ID_REGEX.test(id)) continue
      try {
        const rec = JSON.parse(await fs.readFile(path.join(this.dir, name), "utf8")) as JobRecord
        if (rec.state === "queued" || rec.state === "running") {
          rec.state = "interrupted"
          rec.updatedAt = new Date().toISOString()
          rec.error = { code: "INTERRUPTED", message: "The agent restarted while this job was running" }
          await writeJsonAtomic(path.join(this.dir, name), rec)
          count++
        }
      } catch {
        /* unreadable job file: ignored */
      }
    }
    return count
  }

  start(kind: JobKind, runner: JobRunner): JobRecord {
    const now = new Date().toISOString()
    const rec: JobRecord = {
      jobId: `job_${crypto.randomBytes(8).toString("hex")}`,
      kind,
      state: "queued",
      step: null,
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(rec.jobId, rec)
    void this.run(rec, runner)
    return { ...rec }
  }

  async get(jobId: string): Promise<JobRecord> {
    if (!JOB_ID_REGEX.test(jobId)) throw new AgentError("INVALID_REQUEST", "Invalid job id")
    const live = this.jobs.get(jobId)
    if (live) return { ...live }
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, `${jobId}.json`), "utf8")) as JobRecord
    } catch {
      throw new AgentError("NOT_FOUND", "Job not found")
    }
  }

  private async persist(rec: JobRecord): Promise<void> {
    rec.updatedAt = new Date().toISOString()
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await writeJsonAtomic(path.join(this.dir, `${rec.jobId}.json`), rec)
    } catch (err) {
      this.logger.warn("could not persist job record", { jobId: rec.jobId, error: err })
    }
  }

  private async run(rec: JobRecord, runner: JobRunner): Promise<void> {
    try {
      rec.state = "running"
      await this.persist(rec)
      const result = await runner((step) => {
        rec.step = step
      })
      rec.state = "succeeded"
      if (result && result.resultBackupId) rec.resultBackupId = result.resultBackupId
    } catch (err) {
      rec.state = "failed"
      const code: AgentErrorCode = err instanceof AgentError ? err.code : "INTERNAL"
      rec.error = { code, message: err instanceof AgentError ? redact(err.message) : "Internal error" }
      this.logger.error("job failed", { jobId: rec.jobId, kind: rec.kind, code })
    }
    await this.persist(rec)
  }
}

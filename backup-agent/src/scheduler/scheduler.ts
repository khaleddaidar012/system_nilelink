import { Logger } from "../logger"
import { AgentError } from "../recovery/errors"
import {
  formatLocal,
  isValidTimeZone,
  nextRun,
  parseHHmm,
  scheduleDateKey,
  scheduledInstantForDate,
} from "./time"
import { readSchedulerState, SchedulerState, writeSchedulerState } from "./state"

export interface SchedulerOptions {
  enabled: boolean
  timeHHmm: string
  timezone: string
  graceMinutes: number
  statePath: string
}

export interface SchedulerDeps {
  /** Creates an automatic backup. Throws AgentError("BUSY") when another job runs. */
  runBackup: () => Promise<{ id: string }>
  /** Called after each successful automatic backup (retention sweep). Must not throw. */
  afterSuccess?: () => Promise<unknown>
  logger: Logger
  now?: () => Date
}

const BUSY_RETRY_MS = 10 * 60_000
const FAILURE_RETRY_MS = 30 * 60_000
const MAX_TICK_MS = 60_000

export type TickOutcome =
  | "disabled"
  | "not_due"
  | "already_ran"
  | "waiting"
  | "scheduled"
  | "caught_up"
  | "skipped_busy"
  | "missed"
  | "failed_will_retry"
  | "failed"
  | "running"

/**
 * Daily scheduler. All decisions are in `tick()`, which takes its time from an injectable clock so it is
 * fully testable. The timer only calls tick() at least once a minute (survives clock changes).
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private stopped = false
  private notBefore = 0
  private attemptKey: string | null = null
  private failedAttempts = 0
  private state: SchedulerState | null = null
  private readonly now: () => Date

  constructor(
    private readonly options: SchedulerOptions,
    private readonly deps: SchedulerDeps
  ) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Validates configuration. Returns an error message, or null if valid. */
  validate(): string | null {
    try {
      parseHHmm(this.options.timeHHmm)
    } catch (err) {
      return (err as Error).message
    }
    if (!isValidTimeZone(this.options.timezone)) return "unknown IANA timezone"
    return null
  }

  start(): boolean {
    const problem = this.validate()
    if (problem) {
      this.deps.logger.error("scheduler not started: invalid configuration", { problem })
      return false
    }
    if (!this.options.enabled) {
      this.deps.logger.info("scheduler disabled by configuration")
      return false
    }
    this.stopped = false
    this.deps.logger.info("scheduler started", {
      time: this.options.timeHHmm,
      timezone: this.options.timezone,
      nextRun: nextRun(this.options.timeHHmm, this.options.timezone, this.now()).toISOString(),
    })
    this.arm(0) // immediate tick performs startup catch-up
    return true
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private arm(delayMs: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      void this.tick()
        .catch((err) => this.deps.logger.error("scheduler tick failed", { error: err }))
        .finally(() => {
          const next = nextRun(this.options.timeHHmm, this.options.timezone, this.now()).getTime() - this.now().getTime()
          this.arm(Math.max(1000, Math.min(next, MAX_TICK_MS)))
        })
    }, delayMs)
    this.timer.unref?.()
  }

  async getState(): Promise<SchedulerState> {
    if (!this.state) this.state = await readSchedulerState(this.options.statePath)
    return this.state
  }

  private async save(patch: Partial<SchedulerState>): Promise<void> {
    const next = { ...(await this.getState()), ...patch }
    this.state = next
    await writeSchedulerState(this.options.statePath, next)
  }

  async tick(): Promise<TickOutcome> {
    const log = this.deps.logger
    if (!this.options.enabled) return "disabled"
    if (this.running) return "running"

    const now = this.now()
    const { timezone, timeHHmm } = this.options
    const key = scheduleDateKey(timezone, now)
    const state = await this.getState()

    if (state.lastScheduledKey === key) return "already_ran"

    const due = scheduledInstantForDate(timeHHmm, timezone, now)
    if (now.getTime() < due.getTime()) return "not_due"

    if (this.attemptKey !== key) {
      this.attemptKey = key
      this.failedAttempts = 0
      this.notBefore = 0
    }

    const lateMs = now.getTime() - due.getTime()
    if (lateMs > this.options.graceMinutes * 60_000) {
      log.warn("scheduled backup missed", { key, lateMinutes: Math.round(lateMs / 60_000) })
      await this.save({ lastScheduledKey: key, lastResult: "missed", lastRunAt: now.toISOString() })
      return "missed"
    }
    if (now.getTime() < this.notBefore) return "waiting"

    this.running = true
    try {
      const catchUp = lateMs > 2 * MAX_TICK_MS
      log.info(catchUp ? "caught_up: running scheduled backup late" : "scheduled: running automatic backup", { key })
      const result = await this.deps.runBackup()
      await this.save({
        lastScheduledKey: key,
        lastRunAt: this.now().toISOString(),
        lastResult: "succeeded",
        lastBackupId: result.id,
      })
      await this.deps.afterSuccess?.().catch((err) => log.error("post-backup step failed", { error: err }))
      return catchUp ? "caught_up" : "scheduled"
    } catch (err) {
      if (err instanceof AgentError && err.code === "BUSY") {
        this.notBefore = this.now().getTime() + BUSY_RETRY_MS
        log.info("skipped: busy, retrying in 10 minutes", { key })
        return "skipped_busy"
      }
      this.failedAttempts++
      log.error("automatic backup failed", { key, attempt: this.failedAttempts, error: err })
      if (this.failedAttempts < 2) {
        this.notBefore = this.now().getTime() + FAILURE_RETRY_MS
        return "failed_will_retry"
      }
      await this.save({ lastScheduledKey: key, lastRunAt: this.now().toISOString(), lastResult: "failed" })
      return "failed"
    } finally {
      this.running = false
    }
  }

  async info() {
    const state = await this.getState()
    const valid = this.validate() === null
    const next = valid ? nextRun(this.options.timeHHmm, this.options.timezone, this.now()) : null
    return {
      enabled: this.options.enabled && valid,
      timezone: this.options.timezone,
      scheduleTime: this.options.timeHHmm,
      nextRunAt: next ? next.toISOString() : null,
      nextRunLocal: next ? formatLocal(this.options.timezone, next) : null,
      last: state,
    }
  }
}

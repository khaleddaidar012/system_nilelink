import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentError } from "../../src/recovery/errors"
import { Scheduler } from "../../src/scheduler/scheduler"
import { nextRun, scheduleDateKey, scheduledInstantForDate } from "../../src/scheduler/time"

const TZ = "Africa/Cairo"
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => {} }

describe("time helpers (Africa/Cairo)", () => {
  it("21:00 is UTC+3 in summer and UTC+2 in winter", () => {
    expect(nextRun("21:00", TZ, new Date("2026-07-10T00:00:00Z")).toISOString()).toBe("2026-07-10T18:00:00.000Z")
    expect(nextRun("21:00", TZ, new Date("2026-01-10T00:00:00Z")).toISOString()).toBe("2026-01-10T19:00:00.000Z")
  })

  it("stays at 21:00 local across DST transition weeks", () => {
    for (const start of ["2026-04-20T00:00:00Z", "2026-10-26T00:00:00Z", "2026-10-29T00:00:00Z"]) {
      let from = new Date(start)
      for (let i = 0; i < 10; i++) {
        const n = nextRun("21:00", TZ, from)
        const local = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(n)
        expect(local).toBe("21:00")
        expect(n.getTime()).toBeGreaterThan(from.getTime())
        from = n
      }
    }
  })

  it("date key uses the Cairo date, not UTC", () => {
    expect(scheduleDateKey(TZ, new Date("2026-07-10T22:30:00Z"))).toBe("2026-07-11") // 01:30 Cairo
  })
})

describe("Scheduler.tick", () => {
  let dir: string
  let clock: Date
  let runBackup: ReturnType<typeof vi.fn>
  let afterSuccess: ReturnType<typeof vi.fn>

  const make = (grace = 180) =>
    new Scheduler(
      { enabled: true, timeHHmm: "21:00", timezone: TZ, graceMinutes: grace, statePath: path.join(dir, "state.json") },
      { logger, runBackup: runBackup as never, afterSuccess: afterSuccess as never, now: () => clock }
    )

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sched-"))
    runBackup = vi.fn().mockResolvedValue({ id: "bk_x" })
    afterSuccess = vi.fn().mockResolvedValue(undefined)
    clock = new Date("2026-07-10T17:00:00Z") // 20:00 Cairo
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("does nothing before 21:00, runs once after, never twice for the same date", async () => {
    const s = make()
    expect(await s.tick()).toBe("not_due")
    clock = new Date("2026-07-10T18:00:30Z")
    expect(await s.tick()).toBe("scheduled")
    expect(afterSuccess).toHaveBeenCalledTimes(1)
    expect(await s.tick()).toBe("already_ran")
    // a fresh instance (restart) reads the persisted state
    expect(await make().tick()).toBe("already_ran")
    expect(runBackup).toHaveBeenCalledTimes(1)
  })

  it("does not re-trigger when the clock moves backwards", async () => {
    const s = make()
    clock = new Date("2026-07-10T18:05:00Z")
    await s.tick()
    clock = new Date("2026-07-10T17:59:00Z")
    expect(await s.tick()).toBe("already_ran")
  })

  it("catches up after a restart inside the grace window", async () => {
    clock = new Date("2026-07-10T19:30:00Z") // 22:30 Cairo
    expect(await make().tick()).toBe("caught_up")
  })

  it("records missed after the grace window and does not run", async () => {
    clock = new Date("2026-07-10T22:00:00Z") // 01:00 next Cairo day? (after grace, same key check)
    clock = new Date("2026-07-10T21:30:00Z") // 00:30 Cairo on 07-11 -> new date, not yet due
    expect(await make().tick()).toBe("not_due")
    const s = make(60)
    clock = new Date("2026-07-11T19:30:00Z") // 22:30 Cairo, 90 min late > 60
    expect(await s.tick()).toBe("missed")
    expect(runBackup).not.toHaveBeenCalled()
    expect(await s.tick()).toBe("already_ran")
  })

  it("retries busy after 10 minutes", async () => {
    runBackup.mockRejectedValueOnce(new AgentError("BUSY", "busy"))
    const s = make()
    clock = new Date("2026-07-10T18:01:00Z")
    expect(await s.tick()).toBe("skipped_busy")
    clock = new Date("2026-07-10T18:05:00Z")
    expect(await s.tick()).toBe("waiting")
    clock = new Date("2026-07-10T18:12:00Z")
    expect(await s.tick()).toBe("caught_up")
  })

  it("retries a failure once after 30 minutes, then gives up for the day", async () => {
    runBackup.mockRejectedValue(new AgentError("DUMP_FAILED", "x"))
    const s = make()
    clock = new Date("2026-07-10T18:01:00Z")
    expect(await s.tick()).toBe("failed_will_retry")
    clock = new Date("2026-07-10T18:20:00Z")
    expect(await s.tick()).toBe("waiting")
    clock = new Date("2026-07-10T18:35:00Z")
    expect(await s.tick()).toBe("failed")
    expect(await s.tick()).toBe("already_ran")
    expect(runBackup).toHaveBeenCalledTimes(2)
  })

  it("refuses to start with an invalid time zone", () => {
    const s = new Scheduler(
      { enabled: true, timeHHmm: "21:00", timezone: "Mars/Base", graceMinutes: 10, statePath: path.join(dir, "s.json") },
      { logger, runBackup: runBackup as never }
    )
    expect(s.start()).toBe(false)
  })

  it("exposes next run info", async () => {
    const info = await make().info()
    expect(info.nextRunAt).toBe("2026-07-10T18:00:00.000Z")
    expect(info.nextRunLocal).toBe("2026-07-10 21:00")
  })

  it("scheduledInstantForDate returns same-day instant", () => {
    expect(scheduledInstantForDate("21:00", TZ, new Date("2026-01-10T10:00:00Z")).toISOString()).toBe("2026-01-10T19:00:00.000Z")
  })
})

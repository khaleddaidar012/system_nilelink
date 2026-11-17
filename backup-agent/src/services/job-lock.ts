import { promises as fs } from "node:fs"
import path from "node:path"
import { AgentError } from "../recovery/errors"
import { Logger } from "../logger"

const STALE_AFTER_MS = 6 * 60 * 60 * 1000

interface LockInfo {
  pid: number
  owner: string
  startedAt: string
}

/**
 * Single heavy-job mutex shared by backup, restore, import and the scheduler.
 * In-process flag (race-free) + lock file (survives restarts; stale locks are detected).
 */
export class JobLock {
  private held = false
  private currentOwner: string | null = null

  constructor(
    private readonly lockPath: string,
    private readonly logger: Logger
  ) {}

  isLocked(): boolean {
    return this.held
  }

  owner(): string | null {
    return this.currentOwner
  }

  /** Returns a release function. Throws BUSY if another job holds the lock. */
  async tryAcquire(owner: string): Promise<() => Promise<void>> {
    if (this.held) throw new AgentError("BUSY", "Another backup operation is already running")
    this.held = true // reserve synchronously so concurrent callers cannot both pass
    try {
      await fs.mkdir(path.dirname(this.lockPath), { recursive: true })
      await this.createLockFile(owner)
    } catch (err) {
      this.held = false
      throw err
    }
    this.currentOwner = owner
    return async () => {
      if (!this.held) return
      this.held = false
      this.currentOwner = null
      await fs.rm(this.lockPath, { force: true })
    }
  }

  private async createLockFile(owner: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fh = await fs.open(this.lockPath, "wx")
        const info: LockInfo = { pid: process.pid, owner, startedAt: new Date().toISOString() }
        await fh.writeFile(JSON.stringify(info))
        await fh.close()
        return
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
        if (!(await this.isStale())) throw new AgentError("BUSY", "Another backup operation is already running")
        this.logger.warn("removing stale lock file")
        await fs.rm(this.lockPath, { force: true })
      }
    }
    throw new AgentError("BUSY", "Could not acquire the job lock")
  }

  private async isStale(): Promise<boolean> {
    let info: LockInfo
    try {
      info = JSON.parse(await fs.readFile(this.lockPath, "utf8")) as LockInfo
    } catch {
      return true // unreadable lock file
    }
    if (!info.pid || Date.now() - new Date(info.startedAt).getTime() > STALE_AFTER_MS) return true
    if (info.pid === process.pid) return true // we are alive and `held` is false -> leftover
    try {
      process.kill(info.pid, 0)
      return false // process exists
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "ESRCH"
    }
  }
}

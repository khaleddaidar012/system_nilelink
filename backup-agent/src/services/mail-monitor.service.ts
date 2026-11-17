import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import net from "node:net"
import path from "node:path"
import { Logger } from "../logger"

export interface ServiceCheckResult {
  name: string
  status: "running" | "stopped" | "not_installed" | "unknown"
  details?: string
}

export interface ConnectivityResult {
  port: number
  reachable: boolean
  responseTimeMs?: number
  banner?: string
  error?: string
}

export interface QueueCountResult {
  /** null = the queue folder could not be located/read (never reported as 0) */
  inbound: number | null
  outbound: number | null
  badMail: number | null
  accessible: boolean
  error?: string
  badMailPath?: string
}

export interface MailEnableStatus {
  status: "online" | "degraded" | "offline" | "unknown"
  services: {
    smtp: ServiceCheckResult
    imap: ServiceCheckResult
  }
  connectivity: {
    smtp: ConnectivityResult
    imap: ConnectivityResult
  }
  queues: QueueCountResult
  lastCheck: string
  lastSuccessfulCheck: string | null
  lastOutage: {
    startedAt: string
    endedAt: string | null
    reason: string
  } | null
  diagnostics: string[]
}

export interface MailMonitorOptions {
  host?: string
  smtpPort?: number
  imapPort?: number
  smtpService?: string
  imapService?: string
  mailEnablePath?: string
  badMailPath?: string
  cacheTtlMs?: number
  isMock?: boolean
}

export class MailMonitorService {
  private readonly host: string
  private readonly smtpPort: number
  private readonly imapPort: number
  private readonly smtpService: string
  private readonly imapService: string
  private readonly mailEnablePath?: string
  private readonly badMailPath?: string
  private readonly cacheTtlMs: number
  private readonly isMock: boolean
  private readonly logger: Logger

  private cachedStatus: MailEnableStatus | null = null
  private lastCheckTime = 0
  private lastSuccessfulCheck: string | null = null
  private currentOutage: { startedAt: string; endedAt: string | null; reason: string } | null = null

  constructor(options: MailMonitorOptions, logger: Logger) {
    this.host = options.host || "127.0.0.1"
    this.smtpPort = options.smtpPort || 25
    this.imapPort = options.imapPort || 143
    this.smtpService = options.smtpService || "MESMTPCS"
    this.imapService = options.imapService || "MEIMAPS"
    this.mailEnablePath = options.mailEnablePath
    this.badMailPath = options.badMailPath
    this.cacheTtlMs = options.cacheTtlMs ?? 15_000
    this.isMock = Boolean(options.isMock || process.env.MOCK_MAILENABLE === "true")
    this.logger = logger
  }

  /**
   * Returns current MailEnable status with caching.
   */
  async getStatus(forceRefresh = false): Promise<MailEnableStatus> {
    const now = Date.now()
    if (!forceRefresh && this.cachedStatus && now - this.lastCheckTime < this.cacheTtlMs) {
      return this.cachedStatus
    }

    const status = await this.performCheck()
    this.cachedStatus = status
    this.lastCheckTime = now
    return status
  }

  private async performCheck(): Promise<MailEnableStatus> {
    const timestamp = new Date().toISOString()
    const diagnostics: string[] = []

    if (this.isMock) {
      const mockResult: MailEnableStatus = {
        status: "online",
        services: {
          smtp: { name: this.smtpService, status: "running" },
          imap: { name: this.imapService, status: "running" },
        },
        connectivity: {
          smtp: { port: this.smtpPort, reachable: true, responseTimeMs: 12, banner: "220 mail.nilelink.com ESMTP MailEnable" },
          imap: { port: this.imapPort, reachable: true, responseTimeMs: 15, banner: "* OK MailEnable IMAP4rev1 service" },
        },
        queues: {
          inbound: 2,
          outbound: 0,
          badMail: 0,
          accessible: true,
        },
        lastCheck: timestamp,
        lastSuccessfulCheck: timestamp,
        lastOutage: null,
        diagnostics: ["Mock mode enabled (development / simulated)"],
      }
      this.lastSuccessfulCheck = timestamp
      return mockResult
    }

    // 1. Parallel service checks and port checks
    const [smtpService, imapService, smtpConn, imapConn, queues] = await Promise.all([
      this.checkWindowsService(this.smtpService),
      this.checkWindowsService(this.imapService),
      this.checkTcpPort(this.host, this.smtpPort),
      this.checkTcpPort(this.host, this.imapPort),
      this.checkQueues(),
    ])

    // Collect diagnostics
    if (smtpService.status !== "running") {
      diagnostics.push(`SMTP service (${this.smtpService}) is ${smtpService.status}`)
    }
    if (imapService.status !== "running") {
      diagnostics.push(`IMAP service (${this.imapService}) is ${imapService.status}`)
    }
    if (!smtpConn.reachable) {
      diagnostics.push(`SMTP port ${this.smtpPort} unreachable on ${this.host}: ${smtpConn.error ?? "timed out"}`)
    }
    if (!imapConn.reachable) {
      diagnostics.push(`IMAP port ${this.imapPort} unreachable on ${this.host}: ${imapConn.error ?? "timed out"}`)
    }
    if (queues.badMailPath) {
      diagnostics.push(`MailEnable Bad Mail path: ${queues.badMailPath}`)
    }
    if (!queues.accessible && queues.error) {
      diagnostics.push(queues.error)
    }
    if (queues.badMail !== null && queues.badMail > 20) {
      diagnostics.push(`High bad mail queue count: ${queues.badMail} messages`)
    }

    // Determine overall status
    let status: "online" | "degraded" | "offline" | "unknown" = "unknown"

    const isWindows = process.platform === "win32"
    if (!isWindows && smtpService.status === "unknown" && !smtpConn.reachable) {
      status = "unknown"
      diagnostics.push("Host OS is not Windows and SMTP port is unreachable")
    } else if (smtpService.status === "running" && smtpConn.reachable) {
      if (
        imapService.status === "running" &&
        imapConn.reachable &&
        queues.accessible &&
        (queues.badMail ?? 0) < 50
      ) {
        status = "online"
      } else {
        status = "degraded"
      }
    } else if (smtpService.status === "stopped" || (!smtpConn.reachable && smtpService.status !== "not_installed")) {
      status = "offline"
    } else if (smtpService.status === "not_installed") {
      status = "unknown"
      diagnostics.push("MailEnable services not found on this server")
    } else if (smtpConn.reachable) {
      // SMTP responds even if Windows service query failed (e.g. permission or service name variant)
      status = "degraded"
    } else {
      status = "offline"
    }

    // Last successful check = both services running and both ports reachable (queue visibility is separate)
    const coreHealthy =
      smtpService.status === "running" &&
      imapService.status === "running" &&
      smtpConn.reachable &&
      imapConn.reachable
    if (coreHealthy) this.lastSuccessfulCheck = timestamp

    // Track outage lifecycle
    if (status === "online") {
      if (this.currentOutage && !this.currentOutage.endedAt) {
        this.currentOutage.endedAt = timestamp
      }
    } else if (status === "offline" || status === "degraded") {
      if (!this.currentOutage || this.currentOutage.endedAt) {
        this.currentOutage = {
          startedAt: timestamp,
          endedAt: null,
          reason: diagnostics.join("; ") || `Status changed to ${status}`,
        }
      }
    }

    return {
      status,
      services: {
        smtp: smtpService,
        imap: imapService,
      },
      connectivity: {
        smtp: smtpConn,
        imap: imapConn,
      },
      queues,
      lastCheck: timestamp,
      lastSuccessfulCheck: this.lastSuccessfulCheck,
      lastOutage: this.currentOutage,
      diagnostics,
    }
  }

  /**
   * Read-only Windows Service query via sc.exe
   */
  private checkWindowsService(serviceName: string): Promise<ServiceCheckResult> {
    if (process.platform !== "win32") {
      return Promise.resolve({
        name: serviceName,
        status: "unknown",
        details: "Platform is not Windows",
      })
    }

    return new Promise((resolve) => {
      // sc.exe query <ServiceName>
      execFile("sc.exe", ["query", serviceName], { timeout: 3000 }, (error, stdout) => {
        if (error) {
          const out = String(stdout || "")
          if (out.includes("1060") || out.toLowerCase().includes("does not exist")) {
            return resolve({ name: serviceName, status: "not_installed", details: "Service not installed" })
          }
          return resolve({
            name: serviceName,
            status: "unknown",
            details: error.message,
          })
        }

        const out = stdout.toUpperCase()
        if (out.includes("STATE") && out.includes("RUNNING")) {
          return resolve({ name: serviceName, status: "running" })
        }
        if (out.includes("STATE") && out.includes("STOPPED")) {
          return resolve({ name: serviceName, status: "stopped" })
        }

        return resolve({ name: serviceName, status: "unknown", details: stdout.slice(0, 100) })
      })
    })
  }

  /**
   * Non-blocking TCP connection test with timeout and response timing.
   */
  private checkTcpPort(host: string, port: number): Promise<ConnectivityResult> {
    return new Promise((resolve) => {
      const start = Date.now()
      const socket = new net.Socket()
      let settled = false

      const finish = (result: ConnectivityResult) => {
        if (settled) return
        settled = true
        socket.destroy()
        resolve(result)
      }

      socket.setTimeout(2500)

      socket.on("connect", () => {
        const responseTimeMs = Date.now() - start
        finish({
          port,
          reachable: true,
          responseTimeMs,
        })
      })

      socket.on("data", (data) => {
        // Capture initial banner line if received (e.g. "220 ...")
        const banner = data.toString("utf8").split(/\r?\n/)[0]?.slice(0, 100)
        finish({
          port,
          reachable: true,
          responseTimeMs: Date.now() - start,
          banner,
        })
      })

      socket.on("timeout", () => {
        finish({
          port,
          reachable: false,
          error: "Connection timed out",
        })
      })

      socket.on("error", (err) => {
        finish({
          port,
          reachable: false,
          error: err.message,
        })
      })

      try {
        socket.connect(port, host)
      } catch (err) {
        finish({
          port,
          reachable: false,
          error: err instanceof Error ? err.message : "Connect failed",
        })
      }
    })
  }

  /** Runs a read-only Windows command and resolves stdout (empty string on failure). */
  private run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout: 3000, windowsHide: true }, (_err, stdout) => resolve(String(stdout || "")))
    })
  }

  /**
   * Cleans an input path and resolves potential MailEnable install roots upward.
   * If input points to a subfolder (e.g. Queues, Bad Mail\Messages, Bin, Data),
   * parent directories are included as candidate installation roots.
   */
  private extractRootsFromPath(input?: string): string[] {
    if (!input) return []
    const cleaned = path.normalize(input.trim().replace(/^["']|["']$/g, "").replace(/[\\/]+$/, ""))
    if (!cleaned) return []

    const candidates = [cleaned]

    // Climb up directory tree up to 4 levels to uncover root installation directory
    let curr = cleaned
    for (let i = 0; i < 4; i++) {
      const parent = path.dirname(curr)
      if (!parent || parent === curr) break
      if (!candidates.includes(parent)) {
        candidates.push(parent)
      }
      curr = parent
    }

    return candidates
  }

  /**
   * Collects candidate MailEnable install directories from the real server configuration:
   * explicit MAILENABLE_PATH (resolved to its root), registry values, the Windows service binary path,
   * then well-known defaults.
   */
  private async discoverRoots(): Promise<string[]> {
    const roots: string[] = []
    const add = (p?: string) => {
      if (!p) return
      for (const cand of this.extractRootsFromPath(p)) {
        if (!roots.includes(cand)) roots.push(cand)
      }
    }

    add(this.mailEnablePath)

    if (process.platform === "win32") {
      for (const key of [
        "HKLM\\SOFTWARE\\Wow6432Node\\Mail Enable\\Mail Enable",
        "HKLM\\SOFTWARE\\Mail Enable\\Mail Enable",
      ]) {
        const out = await this.run("reg.exe", ["query", key])
        for (const line of out.split(/\r?\n/)) {
          const m = line.match(/^\s+\S.*?\s+REG_(?:EXPAND_)?SZ\s+["']?([A-Za-z]:\\[^"'\r\n]+)["']?/)
          if (m) add(m[1])
        }
      }

      for (const svc of [this.smtpService, this.imapService]) {
        const sc = await this.run("sc.exe", ["qc", svc])
        const bin = sc.match(/BINARY_PATH_NAME\s*:\s*(.+)/i)?.[1]
        if (bin) {
          const exe = bin.trim().match(/^"([^"]+)"|^(\S+\.exe)/i)
          const exePath = exe?.[1] ?? exe?.[2]
          if (exePath) add(exePath)
        }
      }
    }

    add("C:\\Program Files (x86)\\Mail Enable")
    add("C:\\Program Files\\Mail Enable")
    add("D:\\Program Files (x86)\\Mail Enable")
    add("D:\\Mail Enable")
    add("C:\\Mail Enable")
    return roots
  }

  /** Case/space-insensitive child directory lookup. */
  private async listDirs(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  }

  private norm(name: string): string {
    return name.toLowerCase().replace(/[\s_-]+/g, "")
  }

  private pick(names: string[], aliases: string[]): string | undefined {
    for (const alias of aliases) {
      const hit = names.find((n) => this.norm(n) === alias)
      if (hit) return hit
    }
    return undefined
  }

  /**
   * Resolves the Bad Mail directory.
   * In MailEnable Standard, Bad Mail is placed at:
   *   <MailEnable Root>\Bad Mail\Messages
   *   or <MailEnable Root>\Bad Mail
   * Older or customized setups might also place it under Queues or Queues\SMTP.
   */
  private async resolveBadMailDir(
    roots: string[],
    queuesDir: string | null,
    smtpDir: string | null
  ): Promise<string | null> {
    const candidates: string[] = []

    const addCandidate = (p?: string | null) => {
      if (!p) return
      const cleaned = path.normalize(p.trim().replace(/^["']|["']$/g, "").replace(/[\\/]+$/, ""))
      if (cleaned && !candidates.includes(cleaned)) {
        candidates.push(cleaned)
      }
    }

    // 1. Explicit override if configured
    if (this.badMailPath) {
      addCandidate(path.join(this.badMailPath, "Messages"))
      addCandidate(this.badMailPath)
    }

    // 2. All roots and their parent if queuesDir is known
    const allRoots = [...roots]
    if (queuesDir) {
      const qParent = path.dirname(queuesDir)
      if (!allRoots.includes(qParent)) allRoots.unshift(qParent)
    }

    for (const root of allRoots) {
      // Prioritize the exact verified directory on Windows Server first:
      addCandidate(path.join(root, "Bad Mail", "Messages"))
      addCandidate(path.join(root, "Bad Mail"))
      addCandidate(path.join(root, "Badmail", "Messages"))
      addCandidate(path.join(root, "Badmail"))

      // If root is itself named 'Bad Mail' or 'Badmail', check Messages directly
      const rootBase = path.basename(root).toLowerCase().replace(/[\s_-]+/g, "")
      if (rootBase === "badmail") {
        addCandidate(path.join(root, "Messages"))
        addCandidate(root)
      }

      // Dynamic folder lookup with case/space insensitivity
      try {
        const topDirs = await this.listDirs(root)
        const picked = this.pick(topDirs, ["badmail", "bad mail"])
        if (picked) {
          const badMailRoot = path.join(root, picked)
          try {
            const sub = await this.listDirs(badMailRoot)
            const msgPicked = this.pick(sub, ["messages"])
            if (msgPicked) {
              addCandidate(path.join(badMailRoot, msgPicked))
            }
          } catch {
            /* ignore */
          }
          addCandidate(badMailRoot)
        }
      } catch {
        /* ignore */
      }
    }

    // 3. Fallbacks inside queuesDir and smtpDir
    if (queuesDir) {
      addCandidate(path.join(queuesDir, "Bad Mail", "Messages"))
      addCandidate(path.join(queuesDir, "Bad Mail"))
      addCandidate(path.join(queuesDir, "Badmail", "Messages"))
      addCandidate(path.join(queuesDir, "Badmail"))
    }
    if (smtpDir) {
      addCandidate(path.join(smtpDir, "Bad Mail", "Messages"))
      addCandidate(path.join(smtpDir, "Bad Mail"))
      addCandidate(path.join(smtpDir, "Badmail", "Messages"))
      addCandidate(path.join(smtpDir, "Badmail"))
    }

    // Find the first candidate that exists and is a directory
    for (const cand of candidates) {
      try {
        const stat = await fs.stat(cand)
        if (stat.isDirectory()) {
          // If this directory is NOT already a 'Messages' directory, check if it contains a 'Messages' subdirectory
          if (path.basename(cand).toLowerCase() !== "messages") {
            try {
              const subMessages = path.join(cand, "Messages")
              const msgStat = await fs.stat(subMessages)
              if (msgStat.isDirectory()) {
                return subMessages
              }
            } catch {
              // No Messages subdir, continue with dynamic pick
              try {
                const sub = await this.listDirs(cand)
                const msgDir = this.pick(sub, ["messages"])
                if (msgDir) {
                  const fullMsg = path.join(cand, msgDir)
                  if ((await fs.stat(fullMsg)).isDirectory()) {
                    return fullMsg
                  }
                }
              } catch {
                /* ignore */
              }
            }
          }
          return cand
        }
      } catch {
        // Not found, check next candidate
      }
    }

    return null
  }

  /**
   * Inspects MailEnable queue directories in read-only mode. Folder names are matched against what
   * actually exists on disk; a queue that cannot be located/read is reported as null, never 0.
   */
  private async checkQueues(): Promise<QueueCountResult> {
    const roots = await this.discoverRoots()
    let queuesDir: string | null = null
    for (const root of roots) {
      for (const candidate of [path.join(root, "Queues"), root]) {
        try {
          if (path.basename(candidate).toLowerCase() !== "queues") continue
          if ((await fs.stat(candidate)).isDirectory()) {
            queuesDir = candidate
            break
          }
        } catch {
          /* try next */
        }
      }
      if (queuesDir) break
    }

    if (!queuesDir) {
      return {
        inbound: null,
        outbound: null,
        badMail: null,
        accessible: false,
        error: `MailEnable Queues directory not found (checked ${roots.length} candidate location(s)); set MAILENABLE_PATH on the agent`,
      }
    }

    try {
      const top = await this.listDirs(queuesDir)
      const smtpName = this.pick(top, ["smtp"])
      const smtpDir = smtpName ? path.join(queuesDir, smtpName) : null
      const smtpSub = smtpDir ? await this.listDirs(smtpDir) : []

      const resolveDir = (aliases: string[], includeTop: boolean): string | null => {
        const inSmtp = this.pick(smtpSub, aliases)
        if (inSmtp && smtpDir) return path.join(smtpDir, inSmtp)
        if (includeTop) {
          const inTop = this.pick(top, aliases)
          if (inTop) return path.join(queuesDir as string, inTop)
        }
        return null
      }

      // Bad Mail is located outside Queues in standard MailEnable (<Root>\Bad Mail\Messages)
      const badMailDir = await this.resolveBadMailDir(roots, queuesDir, smtpDir)

      const dirs = {
        inbound: resolveDir(["inbound", "incoming"], false),
        outbound: resolveDir(["outbound", "outgoing", "queue"], false),
        badMail: badMailDir,
      }

      const [inboundRes, outboundRes, badMailRes] = await Promise.all([
        dirs.inbound
          ? this.countMessages(dirs.inbound)
          : Promise.resolve({
              count: null,
              isMissing: true,
              error: `Inbound queue directory not found under ${smtpDir || queuesDir}`,
            }),
        dirs.outbound
          ? this.countMessages(dirs.outbound)
          : Promise.resolve({
              count: null,
              isMissing: true,
              error: `Outbound queue directory not found under ${smtpDir || queuesDir}`,
            }),
        dirs.badMail
          ? this.countMessages(dirs.badMail)
          : Promise.resolve({
              count: null,
              isMissing: true,
              error: `MailEnable Bad Mail directory not found. Checked: 'Bad Mail\\Messages' under candidate roots and Queues.`,
            }),
      ])

      const inbound = inboundRes.count
      const outbound = outboundRes.count
      const badMail = badMailRes.count

      const errors: string[] = []
      if (inboundRes.error) errors.push(inboundRes.error)
      if (outboundRes.error) errors.push(outboundRes.error)
      if (badMailRes.error) errors.push(badMailRes.error)

      if (inbound === null || outbound === null || badMail === null) {
        return {
          inbound,
          outbound,
          badMail,
          accessible: false,
          badMailPath: dirs.badMail ?? undefined,
          error: errors.join("; ") || `Could not read MailEnable queue folder(s). SMTP queue folders found: [${smtpSub.join(", ") || "none"}]`,
        }
      }

      return {
        inbound,
        outbound,
        badMail,
        accessible: true,
        badMailPath: dirs.badMail ?? undefined,
      }
    } catch (err) {
      return {
        inbound: null,
        outbound: null,
        badMail: null,
        accessible: false,
        error: `MailEnable queues directory is not readable: ${err instanceof Error ? err.message : "unknown error"}`,
      }
    }
  }

  /**
   * Counts queued messages as distinct base names (MailEnable stores each message as multiple files).
   * Only counts actual message files, ignoring subdirectories and system metadata.
   * Accurately distinguishes an empty queue (returns 0) from an unreadable directory (returns null).
   */
  private async countMessages(dirPath: string): Promise<{
    count: number | null
    error?: string
    isPermissionError?: boolean
    isMissing?: boolean
    isEmpty?: boolean
  }> {
    try {
      const stat = await fs.stat(dirPath)
      if (!stat.isDirectory()) {
        return {
          count: null,
          isMissing: true,
          error: `Queue path is not a directory: '${dirPath}'`,
        }
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const bases = new Set<string>()
      for (const e of entries) {
        // Only count actual files, NEVER subdirectories
        if (!e.isFile()) continue
        // Ignore Windows and OS metadata
        if (/^(thumbs\.db|desktop\.ini)$/i.test(e.name)) continue
        bases.add(path.parse(e.name).name.toLowerCase())
      }
      const count = bases.size
      return { count, isEmpty: count === 0 }
    } catch (err: any) {
      const code = err?.code || "UNKNOWN"
      const isPermission = code === "EACCES" || code === "EPERM"
      const isNotFound = code === "ENOENT"
      const errorMsg = isPermission
        ? `Permission denied (${code}) reading queue directory '${dirPath}'. Ensure the Windows service account (LocalSystem / NileLinkBackupAgent) has Read permissions.`
        : isNotFound
        ? `Queue directory not found: '${dirPath}'`
        : `Cannot access queue directory '${dirPath}': ${err instanceof Error ? err.message : String(err)}`
      return { count: null, isPermissionError: isPermission, isMissing: isNotFound, error: errorMsg }
    }
  }
}

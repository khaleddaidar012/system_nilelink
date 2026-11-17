import { promises as fs, mkdirSync } from "node:fs"
import path from "node:path"
import { redact } from "./lib/redact"

export type LogLevel = "debug" | "info" | "warn" | "error"
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  /** Wait until pending writes are on disk (used by tests and shutdown). */
  flush(): Promise<void>
}

export interface LoggerOptions {
  /** Directory for daily files agent-YYYY-MM-DD.log. */
  dir: string
  level: LogLevel
  console?: boolean
}

/** Structured JSON-lines logger. Every line passes through redact() before being written. */
export function createLogger(opts: LoggerOptions): Logger {
  mkdirSync(opts.dir, { recursive: true })
  let queue: Promise<void> = Promise.resolve()

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[opts.level]) return
    const now = new Date()
    const line = redact(
      JSON.stringify({ time: now.toISOString(), level, msg, ...(fields ?? {}) }, (_k, v) =>
        v instanceof Error ? v.message : v
      )
    )
    if (opts.console) {
      const out = level === "error" || level === "warn" ? process.stderr : process.stdout
      out.write(line + "\n")
    }
    const file = path.join(opts.dir, `agent-${now.toISOString().slice(0, 10)}.log`)
    queue = queue
      .then(() => fs.appendFile(file, line + "\n", "utf8"))
      .catch(() => {
        /* never let logging crash the agent */
      })
  }

  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    flush: () => queue,
  }
}

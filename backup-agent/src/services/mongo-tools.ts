import { spawn } from "node:child_process"
import path from "node:path"
import { AgentError } from "../recovery/errors"
import { Logger } from "../logger"

export type MongoTool = "mongodump" | "mongorestore"

export interface ToolResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface ToolRunner {
  run(tool: MongoTool, args: string[], opts: { timeoutMs: number }): Promise<ToolResult>
  /** e.g. "100.9.4". Throws TOOLS_NOT_FOUND when the executable cannot be started. */
  version(tool: MongoTool): Promise<string>
}

const MAX_CAPTURE = 1024 * 1024 // keep the last 1 MB of each stream

function appendTail(current: string, chunk: string): string {
  const next = current + chunk
  return next.length > MAX_CAPTURE ? next.slice(next.length - MAX_CAPTURE) : next
}

function killTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
  } else {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      /* already gone */
    }
  }
}

/**
 * Runs the official MongoDB Database Tools. `spawn` with an argument array and `shell: false`:
 * nothing user-supplied is ever interpolated into a command line.
 */
export function createSpawnRunner(toolsDir: string | undefined, logger: Logger): ToolRunner {
  const exe = (tool: MongoTool) => {
    const file = process.platform === "win32" ? `${tool}.exe` : tool
    return toolsDir ? path.join(toolsDir, file) : file
  }

  const run: ToolRunner["run"] = (tool, args, opts) =>
    new Promise<ToolResult>((resolve, reject) => {
      let stdout = ""
      let stderr = ""
      let timedOut = false
      const child = spawn(exe(tool), args, { shell: false, windowsHide: true })

      const timer = setTimeout(() => {
        timedOut = true
        killTree(child.pid)
      }, opts.timeoutMs)

      child.stdout.on("data", (d: Buffer) => (stdout = appendTail(stdout, d.toString("utf8"))))
      child.stderr.on("data", (d: Buffer) => (stderr = appendTail(stderr, d.toString("utf8"))))
      child.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        if (err.code === "ENOENT") {
          reject(new AgentError("TOOLS_NOT_FOUND", `${tool} executable was not found`))
        } else {
          reject(new AgentError("DUMP_FAILED", `Could not start ${tool}`, { cause: err }))
        }
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        logger.debug("tool finished", { tool, code, timedOut })
        resolve({ code, stdout, stderr, timedOut })
      })
    })

  return {
    run,
    async version(tool) {
      const res = await run(tool, ["--version"], { timeoutMs: 15_000 })
      const text = `${res.stdout}\n${res.stderr}`
      const match = /version:\s*([0-9][^\s]*)/i.exec(text)
      if (res.code !== 0 || !match) {
        throw new AgentError("TOOLS_NOT_FOUND", `${tool} did not report a version`)
      }
      return match[1]
    },
  }
}

/** Collections reported by mongodump ("done dumping db.collection (N documents)"). */
export function parseDumpLog(stderr: string, database: string): Array<{ name: string; documents: number }> {
  const out: Array<{ name: string; documents: number }> = []
  const re = /done dumping (\S+) \((\d+) documents?\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stderr)) !== null) {
    const full = m[1]
    const dot = full.indexOf(".")
    if (dot < 0) continue
    if (full.slice(0, dot) !== database) continue
    out.push({ name: full.slice(dot + 1), documents: Number(m[2]) })
  }
  return out
}

/** Maps tool output to a safe, stable error code. */
export function classifyToolFailure(stderr: string): "DB_UNREACHABLE" | "DISK_FULL" | "DUMP_FAILED" {
  const text = stderr.toLowerCase()
  if (/no space left|not enough space|disk full|enospc/.test(text)) return "DISK_FULL"
  if (
    /no reachable servers|server selection|connection refused|timed out|i\/o timeout|dial tcp|auth(entication)? failed|unauthorized|dns|lookup/.test(
      text
    )
  ) {
    return "DB_UNREACHABLE"
  }
  return "DUMP_FAILED"
}

import crypto from "node:crypto"
import http, { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod"
import { NonceStore, RateLimiter } from "./auth/nonce-store"
import { parseKeys, verifyRequest } from "./auth/hmac"
import { AgentConfig } from "./config"
import { Logger } from "./logger"
import { isAgentError, AgentError, AgentErrorCode } from "./recovery/errors"
import { buildDetailedHealth, AGENT_VERSION } from "./routes/health"
import { Scheduler } from "./scheduler/scheduler"
import {
  ActorSchema,
  BackupIdSchema,
  CreateBackupBody,
  EmptyBody,
  ListQuery,
  MAX_BODY_BYTES,
  ProtectBody,
  RestoreBackupBody,
} from "./schemas/api"
import { BackupService } from "./services/backup.service"
import { JobLock } from "./services/job-lock"
import { JobManager } from "./services/job-manager"
import { ToolRunner } from "./services/mongo-tools"
import { RestoreService } from "./services/restore.service"
import { RetentionService } from "./services/retention.service"
import { MailMonitorService } from "./services/mail-monitor.service"
import { verifyStoredBackup } from "./services/verify.service"
import { BackupStore } from "./storage/backup-store"

export interface ServerDeps {
  config: AgentConfig
  store: BackupStore
  lock: JobLock
  tools: ToolRunner
  logger: Logger
  backups: BackupService
  jobs: JobManager
  scheduler: Scheduler
  retention: RetentionService
  restore?: RestoreService
  mailMonitor?: MailMonitorService
  nonces?: NonceStore
  limiter?: RateLimiter
}

const STATUS: Partial<Record<AgentErrorCode, number>> = {
  BUSY: 409,
  NOT_FOUND: 404,
  INVALID_ID: 400,
  INVALID_REQUEST: 400,
  PROTECTED: 409,
  CORRUPT_BACKUP: 409,
  NOT_IMPLEMENTED: 501,
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, requestId: string, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "X-Request-Id": requestId, "Cache-Control": "no-store" })
  res.end(JSON.stringify(payload))
}

const ok = (data: unknown) => ({ ok: true, data })
const fail = (code: string, message: string) => ({ ok: false, error: { code, message } })

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body too large")
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

function parseBody<T extends z.ZodTypeAny>(schema: T, raw: Buffer): z.infer<T> {
  let json: unknown = {}
  if (raw.length > 0) {
    try {
      json = JSON.parse(raw.toString("utf8"))
    } catch {
      throw new HttpError(400, "INVALID_REQUEST", "Malformed JSON")
    }
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw new HttpError(400, "INVALID_REQUEST", "Invalid request body")
  return parsed.data
}

function parseActor(header: string | string[] | undefined) {
  if (typeof header !== "string" || header.length > 600) return undefined
  try {
    const json = JSON.parse(Buffer.from(header, "base64url").toString("utf8"))
    const parsed = ActorSchema.safeParse(json)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function validId(id: string) {
  const parsed = BackupIdSchema.safeParse(id)
  if (!parsed.success) throw new HttpError(400, "INVALID_ID", "Invalid backup id")
  return parsed.data
}

export function createAgentServer(deps: ServerDeps): http.Server {
  const { config, store, lock, tools, logger, backups, jobs, scheduler, retention } = deps
  const restore = deps.restore ?? new RestoreService(config, store, lock, tools, backups, logger)
  const mailMonitor =
    deps.mailMonitor ??
    new MailMonitorService(
      {
        host: config.mailEnable?.host,
        smtpPort: config.mailEnable?.smtpPort,
        imapPort: config.mailEnable?.imapPort,
        smtpService: config.mailEnable?.smtpService,
        imapService: config.mailEnable?.imapService,
        mailEnablePath: config.mailEnable?.path,
        badMailPath: config.mailEnable?.badMailPath,
      },
      logger
    )
  const keys = parseKeys(config.hmacKeysRaw)
  const nonces = deps.nonces ?? new NonceStore()
  const limiter = deps.limiter ?? new RateLimiter()

  if (keys.size === 0) logger.warn("no valid AGENT_HMAC_KEYS configured: every authenticated request will be rejected")

  return http.createServer(async (req, res) => {
    const requestId = crypto.randomBytes(8).toString("hex")
    const method = (req.method ?? "GET").toUpperCase()
    const pathAndQuery = req.url ?? "/"
    try {
      const url = new URL(pathAndQuery, "http://agent.local")
      const segments = url.pathname.split("/").filter(Boolean) // ["v1", ...]
      const isWrite = method !== "GET"
      const body = await readBody(req, MAX_BODY_BYTES)

      if (segments[0] !== "v1") throw new HttpError(404, "NOT_FOUND", "Not found")

      const auth = verifyRequest(req.headers, { method, pathAndQuery, body }, keys, nonces)

      // Unauthenticated health variant: only { status }
      if (method === "GET" && segments.length === 2 && segments[1] === "health" && !auth.ok) {
        return send(res, 200, requestId, ok({ status: "ok" }))
      }

      if (!auth.ok) {
        logger.warn("request rejected", { requestId, reason: auth.reason, method })
        return send(res, 401, requestId, fail("UNAUTHORIZED", "Unauthorized"))
      }
      if (!limiter.allow(auth.keyId as string, isWrite)) {
        return send(res, 429, requestId, fail("RATE_LIMITED", "Too many requests"))
      }
      const actor = parseActor(req.headers["x-nl-actor"])
      const createdBy = actor ? ({ kind: "user", ...actor } as const) : ({ kind: "system" } as const)
      const [, a, b, c] = segments

      // ---- health ----
      if (method === "GET" && a === "health" && !b) {
        const data = await buildDetailedHealth({ config, store, lock, tools, scheduler, retention })
        return send(res, 200, requestId, ok(data))
      }

      // ---- mail status (MailEnable) ----
      if (method === "GET" && a === "mail" && b === "status" && !c) {
        const force = url.searchParams.get("refresh") === "true"
        const data = await mailMonitor.getStatus(force)
        return send(res, 200, requestId, ok(data))
      }

      // ---- scheduler / retention ----
      if (method === "GET" && a === "scheduler" && !b) return send(res, 200, requestId, ok(await scheduler.info()))
      if (method === "GET" && a === "retention" && b === "preview" && !c) {
        return send(res, 200, requestId, ok(await retention.preview()))
      }

      // ---- jobs ----
      if (method === "GET" && a === "jobs" && b && !c) return send(res, 200, requestId, ok(await jobs.get(b)))

      // ---- backups ----
      if (a === "backups") {
        if (method === "GET" && !b) {
          const q = ListQuery.safeParse(Object.fromEntries(url.searchParams))
          if (!q.success) throw new HttpError(400, "INVALID_REQUEST", "Invalid query")
          const all = await store.list({ type: q.data.type })
          const items = all.slice(q.data.cursor, q.data.cursor + q.data.limit)
          const next = q.data.cursor + items.length
          return send(res, 200, requestId, ok({ items, nextCursor: next < all.length ? String(next) : null }))
        }
        if (method === "POST" && !b) {
          const input = parseBody(CreateBackupBody, body)
          if (lock.isLocked()) throw new AgentError("BUSY", "Another backup operation is already running")
          const job = jobs.start("backup", async (setStep) => {
            setStep("dumping")
            const r = await backups.createBackup({ type: "manual", createdBy, reason: input.reason })
            return { resultBackupId: r.metadata.id }
          })
          return send(res, 202, requestId, ok({ jobId: job.jobId }))
        }
        if (method === "POST" && b === "import" && !c) {
          throw new AgentError("NOT_IMPLEMENTED", "Import is not available yet")
        }
        if (b) {
          const id = validId(b)
          if (method === "GET" && !c) return send(res, 200, requestId, ok(await store.get(id)))
          if (method === "DELETE" && !c) {
            await store.delete(id)
            logger.info("backup deleted via API", { requestId, id, by: actor?.email })
            return send(res, 200, requestId, ok({ deleted: true }))
          }
          if (method === "POST" && c === "verify") {
            parseBody(EmptyBody, body)
            await store.get(id) // 404 early
            const job = jobs.start("verify", async (setStep) => {
              setStep("verifying")
              const result = await verifyStoredBackup(config.backupRoot, store, id)
              if (!result.ok) throw new AgentError("VERIFY_FAILED", `Verification failed: ${result.problems.join(", ")}`)
              return { resultBackupId: id }
            })
            return send(res, 202, requestId, ok({ jobId: job.jobId }))
          }
          if (method === "POST" && c === "protect") {
            const input = parseBody(ProtectBody, body)
            const updated = await store.setProtected(id, input.protected)
            return send(res, 200, requestId, ok({ id, protected: updated.protected }))
          }
          if (method === "POST" && c === "restore") {
            const input = parseBody(RestoreBackupBody, body)
            if (lock.isLocked()) throw new AgentError("BUSY", "Another backup or restore operation is already running")
            await store.get(id) // 404 early if backup doesn't exist
            const job = jobs.start("restore", async (setStep) => {
              const result = await restore.executeRestore(id, input, setStep)
              return { resultBackupId: id, ...result }
            })
            return send(res, 202, requestId, ok({ jobId: job.jobId }))
          }
        }
      }

      throw new HttpError(404, "NOT_FOUND", "Not found")
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, requestId, fail(err.code, err.message))
      if (isAgentError(err)) {
        const status = STATUS[err.code]
        if (status) return send(res, status, requestId, fail(err.code, err.message))
      }
      logger.error("unhandled request error", { requestId, method, error: err })
      return send(res, 500, requestId, fail("INTERNAL", `Internal error (request ${requestId})`))
    }
  })
}

export { AGENT_VERSION }

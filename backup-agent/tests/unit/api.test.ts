import { mkdtemp, rm } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { AddressInfo } from "node:net"
import crypto from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { sign } from "../../src/auth/hmac"
import { RateLimiter } from "../../src/auth/nonce-store"
import { AgentConfig } from "../../src/config"
import { createAgentServer } from "../../src/server"
import { BackupStore } from "../../src/storage/backup-store"
import { ensureLayout } from "../../src/storage/layout"
import { JobLock } from "../../src/services/job-lock"
import { JobManager } from "../../src/services/job-manager"

const SECRET = "a".repeat(64)
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => {} }

let dir: string
let server: http.Server
let port: number

async function call(method: string, p: string, opts: { body?: unknown; headers?: Record<string, string>; signed?: boolean; ts?: number; nonce?: string; rawBody?: string } = {}) {
  const raw = opts.rawBody ?? (opts.body === undefined ? "" : JSON.stringify(opts.body))
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) }
  if (opts.signed !== false) {
    const ts = String(opts.ts ?? Date.now())
    const nonce = opts.nonce ?? crypto.randomBytes(16).toString("hex")
    headers["x-nl-key-id"] = "k1"
    headers["x-nl-timestamp"] = ts
    headers["x-nl-nonce"] = nonce
    headers["x-nl-signature"] = sign(SECRET, { method, pathAndQuery: p, timestamp: ts, nonce, body: raw })
  }
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers, body: raw || undefined })
  return { status: res.status, json: (await res.json()) as any }
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "api-"))
  await ensureLayout(dir)
  const config = { backupRoot: dir, hmacKeysRaw: JSON.stringify({ k1: SECRET }), retentionMinFreeBytes: 0 } as unknown as AgentConfig
  const store = new BackupStore(dir)
  const lock = new JobLock(path.join(dir, "temp", "agent.lock"), logger)
  const scheduler = { info: async () => ({ enabled: true, nextRunAt: "x" }) } as never
  const retention = { diskPressure: async () => ({ low: false, minFreeBytes: 0 }), preview: async () => ({ keep: [], delete: [], reasons: {} }) } as never
  const tools = { version: async () => "100.0", run: async () => ({ code: 0, stdout: "", stderr: "" }) } as never
  server = createAgentServer({
    config, store, lock, tools, logger, scheduler, retention,
    backups: {} as never,
    jobs: new JobManager(path.join(dir, "logs", "jobs"), logger),
    limiter: new RateLimiter(1000, 0),
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

describe("agent API authentication", () => {
  it("accepts a valid signed request", async () => {
    const r = await call("GET", "/v1/backups")
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
  })

  it("rejects unsigned requests with a generic 401", async () => {
    const r = await call("GET", "/v1/backups", { signed: false })
    expect(r.status).toBe(401)
    expect(r.json.error.message).toBe("Unauthorized")
  })

  it("rejects stale timestamps", async () => {
    expect((await call("GET", "/v1/backups", { ts: Date.now() - 120_000 })).status).toBe(401)
  })

  it("rejects replayed nonces", async () => {
    const nonce = crypto.randomBytes(16).toString("hex")
    expect((await call("GET", "/v1/backups", { nonce })).status).toBe(200)
    expect((await call("GET", "/v1/backups", { nonce })).status).toBe(401)
  })

  it("rejects tampered body and wrong key id", async () => {
    const ts = String(Date.now())
    const nonce = crypto.randomBytes(16).toString("hex")
    const sig = sign(SECRET, { method: "POST", pathAndQuery: "/v1/backups", timestamp: ts, nonce, body: '{"reason":"a"}' })
    const res = await fetch(`http://127.0.0.1:${port}/v1/backups`, {
      method: "POST",
      headers: { "x-nl-key-id": "k1", "x-nl-timestamp": ts, "x-nl-nonce": nonce, "x-nl-signature": sig },
      body: '{"reason":"b"}',
    })
    expect(res.status).toBe(401)
    const r = await call("GET", "/v1/backups", { headers: { "x-nl-key-id": "zzz" }, signed: true })
    // header override is replaced by signing helper -> still valid; check explicit wrong id below
    expect(r.status).toBe(200)
    const bad = await fetch(`http://127.0.0.1:${port}/v1/backups`, {
      headers: { "x-nl-key-id": "nope", "x-nl-timestamp": ts, "x-nl-nonce": crypto.randomBytes(16).toString("hex"), "x-nl-signature": sig },
    })
    expect(bad.status).toBe(401)
  })

  it("health: unsigned gets only status, signed gets details without paths", async () => {
    const open = await call("GET", "/v1/health", { signed: false })
    expect(open.json.data).toEqual({ status: "ok" })
    const detail = await call("GET", "/v1/health")
    expect(detail.json.data.tools.mongodump).toBe("100.0")
    expect(JSON.stringify(detail.json)).not.toContain(dir)
    expect(detail.json.data.capabilities).toContain("mail-monitoring")
    expect(detail.json.data.version).toBe("0.2.2")
  })

  it("mail status: rejects unsigned requests, returns monitoring data when signed", async () => {
    expect((await call("GET", "/v1/mail/status", { signed: false })).status).toBe(401)
    const r = await call("GET", "/v1/mail/status")
    expect(r.status).toBe(200)
    expect(r.json.data).toHaveProperty("services.smtp")
    expect(r.json.data).toHaveProperty("connectivity.imap")
    expect(r.json.data).toHaveProperty("queues")
    expect(r.json.data).toHaveProperty("lastSuccessfulCheck")
  })
})

describe("agent API validation", () => {
  it("rejects bad ids, unknown fields and oversized bodies", async () => {
    expect((await call("GET", "/v1/backups/..%2f..%2fetc")).status).toBe(400)
    expect((await call("POST", "/v1/backups", { body: { reason: "x", path: "C:\\" } })).status).toBe(400)
    expect((await call("POST", "/v1/backups", { rawBody: JSON.stringify({ reason: "x".repeat(70_000) }) })).status).toBe(413)
    expect((await call("POST", "/v1/backups", { rawBody: "{not json" })).status).toBe(400)
  })

  it("unknown route 404 and unimplemented restore 501", async () => {
    expect((await call("GET", "/v1/nope")).status).toBe(404)
    expect((await call("POST", "/v1/backups/import", { body: {} })).status).toBe(501)
  })

  it("unknown job id", async () => {
    expect((await call("GET", "/v1/jobs/job_0000000000000000")).status).toBe(404)
    expect((await call("GET", "/v1/jobs/bad")).status).toBe(400)
  })
})

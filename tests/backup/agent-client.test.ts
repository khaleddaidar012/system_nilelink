import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { callAgent, BackupApiError } from "../../lib/backup/agent-client"
import { validateBackupAgentConfig, isLocalEndpoint } from "../../lib/backup/config"
import { verifyRequest, parseKeys } from "../../backup-agent/src/auth/hmac"
import { NonceStore } from "../../backup-agent/src/auth/nonce-store"

const TEST_SECRET = "c".repeat(64)
const TEST_KEY_ID = "k1"
const TEST_CF_CLIENT_ID = "test-service-token-id.access"
const TEST_CF_CLIENT_SECRET = "test-service-token-secret-xyz123"
const REMOTE_URL = "https://backup-agent.nilelinklogistics.com"
const LOCAL_URL = "http://127.0.0.1:8787"

describe("Backup Agent Client & Cloudflare Access Integration", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  function setRemoteConfig() {
    process.env.BACKUP_AGENT_URL = REMOTE_URL
    process.env.BACKUP_AGENT_KEY_ID = TEST_KEY_ID
    process.env.BACKUP_AGENT_HMAC_SECRET = TEST_SECRET
    process.env.CF_ACCESS_CLIENT_ID = TEST_CF_CLIENT_ID
    process.env.CF_ACCESS_CLIENT_SECRET = TEST_CF_CLIENT_SECRET
  }

  function setLocalConfig() {
    process.env.BACKUP_AGENT_URL = LOCAL_URL
    process.env.BACKUP_AGENT_KEY_ID = TEST_KEY_ID
    process.env.BACKUP_AGENT_HMAC_SECRET = TEST_SECRET
    delete process.env.CF_ACCESS_CLIENT_ID
    delete process.env.CF_ACCESS_CLIENT_SECRET
  }

  describe("1. Cloudflare Access Headers Inclusion", () => {
    it("attaches CF-Access-Client-Id and CF-Access-Client-Secret to outbound requests", async () => {
      setRemoteConfig()

      let capturedUrl = ""
      let capturedHeaders: Record<string, string> = {}
      global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(url)
        capturedHeaders = (init?.headers as Record<string, string>) ?? {}
        return new Response(JSON.stringify({ ok: true, data: { status: "ok" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      const data = await callAgent<{ status: string }>("GET", "/v1/health")

      assert.strictEqual(capturedUrl, `${REMOTE_URL}/v1/health`)
      assert.strictEqual(capturedHeaders["CF-Access-Client-Id"], TEST_CF_CLIENT_ID)
      assert.strictEqual(capturedHeaders["CF-Access-Client-Secret"], TEST_CF_CLIENT_SECRET)
      assert.deepStrictEqual(data, { status: "ok" })
    })

    it("attaches CF Access headers even for local endpoints if configured", async () => {
      setLocalConfig()
      process.env.CF_ACCESS_CLIENT_ID = TEST_CF_CLIENT_ID
      process.env.CF_ACCESS_CLIENT_SECRET = TEST_CF_CLIENT_SECRET

      let capturedHeaders: Record<string, string> = {}
      global.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {}
        return new Response(JSON.stringify({ ok: true, data: { status: "ok" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      await callAgent("GET", "/v1/health")
      assert.strictEqual(capturedHeaders["CF-Access-Client-Id"], TEST_CF_CLIENT_ID)
      assert.strictEqual(capturedHeaders["CF-Access-Client-Secret"], TEST_CF_CLIENT_SECRET)
    })
  })

  describe("2. Existing HMAC Headers and Signature Validity", () => {
    it("preserves HMAC headers and generates a signature valid against Backup Agent verifier", async () => {
      setRemoteConfig()

      let capturedHeaders: Record<string, string> = {}
      let capturedBody: string | undefined

      global.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {}
        capturedBody = init?.body as string | undefined
        return new Response(JSON.stringify({ ok: true, data: { jobId: "job_0123456789abcdef" } }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      }

      const requestPayload = { reason: "Pre-deployment check" }
      await callAgent("POST", "/v1/backups", { body: requestPayload })

      assert.strictEqual(capturedHeaders["x-nl-key-id"], TEST_KEY_ID)
      assert.ok(capturedHeaders["x-nl-timestamp"])
      assert.ok(capturedHeaders["x-nl-nonce"])
      assert.ok(capturedHeaders["x-nl-signature"])
      assert.strictEqual(capturedHeaders["content-type"], "application/json")

      // Verify the signature using the real Backup Agent HMAC verifier
      const keys = parseKeys(JSON.stringify({ [TEST_KEY_ID]: TEST_SECRET }))
      const nonces = new NonceStore()
      const reqBuffer = Buffer.from(capturedBody ?? "", "utf8")

      const authResult = verifyRequest(
        capturedHeaders,
        { method: "POST", pathAndQuery: "/v1/backups", body: reqBuffer },
        keys,
        nonces
      )

      assert.strictEqual(authResult.ok, true)
      assert.strictEqual(authResult.keyId, TEST_KEY_ID)
    })

    it("HMAC signing uses the exact request body transmitted", async () => {
      setRemoteConfig()

      let capturedBody = ""
      let capturedHeaders: Record<string, string> = {}
      global.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {}
        capturedBody = (init?.body as string) ?? ""
        return new Response(JSON.stringify({ ok: true, data: { id: "bk_1", protected: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      const payload = { protected: true }
      await callAgent("POST", "/v1/backups/bk_1/protect", { body: payload })

      assert.strictEqual(capturedBody, JSON.stringify(payload))

      const keys = parseKeys(JSON.stringify({ [TEST_KEY_ID]: TEST_SECRET }))
      const nonces = new NonceStore()
      const authResult = verifyRequest(
        capturedHeaders,
        { method: "POST", pathAndQuery: "/v1/backups/bk_1/protect", body: Buffer.from(capturedBody) },
        keys,
        nonces
      )
      assert.strictEqual(authResult.ok, true)
    })
  })

  describe("3. Missing Credentials Configuration Errors", () => {
    it("throws 503 BACKUP_NOT_CONFIGURED when BACKUP_AGENT_URL is missing", async () => {
      setRemoteConfig()
      delete process.env.BACKUP_AGENT_URL

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/health")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 503)
          assert.strictEqual(err.code, "BACKUP_NOT_CONFIGURED")
          assert.ok(err.message.includes("BACKUP_AGENT_URL"))
          return true
        }
      )
    })

    it("throws 503 BACKUP_NOT_CONFIGURED when HMAC secret or key is missing", async () => {
      setRemoteConfig()
      delete process.env.BACKUP_AGENT_HMAC_SECRET

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/health")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 503)
          assert.strictEqual(err.code, "BACKUP_NOT_CONFIGURED")
          assert.ok(err.message.includes("BACKUP_AGENT_HMAC_SECRET"))
          return true
        }
      )
    })

    it("throws 503 BACKUP_NOT_CONFIGURED when remote URL lacks CF Access credentials", async () => {
      setRemoteConfig()
      delete process.env.CF_ACCESS_CLIENT_ID
      delete process.env.CF_ACCESS_CLIENT_SECRET

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/health")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 503)
          assert.strictEqual(err.code, "BACKUP_NOT_CONFIGURED")
          assert.ok(err.message.includes("Cloudflare Access service token is required"))
          return true
        }
      )
    })

    it("throws 503 BACKUP_NOT_CONFIGURED when CF Access credentials are incomplete (partial)", async () => {
      setRemoteConfig()
      delete process.env.CF_ACCESS_CLIENT_SECRET

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/health")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 503)
          assert.strictEqual(err.code, "BACKUP_NOT_CONFIGURED")
          assert.ok(err.message.includes("Cloudflare Access credentials are incomplete"))
          return true
        }
      )
    })

    it("allows local dev endpoint without CF Access credentials", () => {
      setLocalConfig()
      const validation = validateBackupAgentConfig()
      assert.strictEqual(validation.ok, true)
      assert.strictEqual(isLocalEndpoint(LOCAL_URL), true)
      assert.strictEqual(isLocalEndpoint(REMOTE_URL), false)
    })
  })

  describe("4. Cloudflare 403 vs Agent HMAC 401 Error Distinctions", () => {
    it("handles Cloudflare Access 403 Forbidden as CF_ACCESS_DENIED (502)", async () => {
      setRemoteConfig()

      global.fetch = async () => {
        return new Response("<html><title>Access Denied</title><body>403 Forbidden by Cloudflare Access</body></html>", {
          status: 403,
          headers: { "Content-Type": "text/html", "cf-ray": "8d12345678-CAI" },
        })
      }

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/backups")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 502)
          assert.strictEqual(err.code, "CF_ACCESS_DENIED")
          assert.ok(err.message.includes("Cloudflare Access rejected the request"))
          return true
        }
      )
    })

    it("handles Backup Agent HMAC 401 as AGENT_AUTH_FAILED (502)", async () => {
      setRemoteConfig()

      global.fetch = async () => {
        return new Response(JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/backups")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 502)
          assert.strictEqual(err.code, "AGENT_AUTH_FAILED")
          assert.ok(err.message.includes("rejected the request signature"))
          return true
        }
      )
    })

    it("handles Cloudflare Access redirecting to login as CF_ACCESS_DENIED", async () => {
      setRemoteConfig()

      const redirectResponse = new Response("", { status: 200 })
      Object.defineProperty(redirectResponse, "redirected", { value: true })
      Object.defineProperty(redirectResponse, "url", {
        value: "https://nilelink.cloudflareaccess.com/cdn-cgi/access/login/agent",
      })

      global.fetch = async () => redirectResponse

      await assert.rejects(
        async () => {
          await callAgent("GET", "/v1/backups")
        },
        (err: unknown) => {
          assert.ok(err instanceof BackupApiError)
          assert.strictEqual(err.status, 502)
          assert.strictEqual(err.code, "CF_ACCESS_DENIED")
          assert.ok(err.message.includes("Service Auth policy required"))
          return true
        }
      )
    })
  })

  describe("5. Secrets are Never Exposed in Errors, Logs, or Responses", () => {
    it("never includes HMAC secret or CF credentials in BackupApiError message or properties", async () => {
      setRemoteConfig()

      global.fetch = async () => new Response("Internal Server Error", { status: 500 })

      try {
        await callAgent("GET", "/v1/health")
        assert.fail("Should have thrown")
      } catch (err) {
        assert.ok(err instanceof BackupApiError)
        const errorStr = JSON.stringify(err) + String(err)
        assert.strictEqual(errorStr.includes(TEST_SECRET), false)
        assert.strictEqual(errorStr.includes(TEST_CF_CLIENT_SECRET), false)
        assert.strictEqual(errorStr.includes(TEST_CF_CLIENT_ID), false)
      }
    })
  })

  describe("6. Existing Backup Operations API Contracts Compatibility", () => {
    it("supports GET /v1/health", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { status: "ok", agent: { version: "0.1.0" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<Record<string, unknown>>("GET", "/v1/health")
      assert.strictEqual(res.status, "ok")
    })

    it("supports GET /v1/backups with pagination", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { items: [], nextCursor: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ items: unknown[]; nextCursor: string | null }>("GET", "/v1/backups?limit=30&cursor=0")
      assert.deepStrictEqual(res.items, [])
    })

    it("supports POST /v1/backups (manual creation)", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { jobId: "job_abcdef0123456789" } }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ jobId: string }>("POST", "/v1/backups", { body: { reason: "Routine manual" } })
      assert.strictEqual(res.jobId, "job_abcdef0123456789")
    })

    it("supports GET /v1/jobs/:jobId", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { jobId: "job_1", kind: "backup", state: "running" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ jobId: string; state: string }>("GET", "/v1/jobs/job_1")
      assert.strictEqual(res.state, "running")
    })

    it("supports POST /v1/backups/:id/protect", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { id: "bk_1", protected: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ id: string; protected: boolean }>("POST", "/v1/backups/bk_1/protect", {
        body: { protected: true },
      })
      assert.strictEqual(res.protected, true)
    })

    it("supports DELETE /v1/backups/:id", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { deleted: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ deleted: boolean }>("DELETE", "/v1/backups/bk_1")
      assert.strictEqual(res.deleted, true)
    })

    it("supports GET /v1/scheduler", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { enabled: true, timeHHmm: "21:00", timezone: "Africa/Cairo" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ enabled: boolean; timeHHmm: string }>("GET", "/v1/scheduler")
      assert.strictEqual(res.enabled, true)
      assert.strictEqual(res.timeHHmm, "21:00")
    })

    it("supports GET /v1/retention/preview", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { keep: ["bk_1"], delete: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ keep: string[]; delete: string[] }>("GET", "/v1/retention/preview")
      assert.ok(res.keep.includes("bk_1"))
      assert.strictEqual(res.delete.length, 0)
    })

    it("supports POST /v1/backups/:id/restore", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(JSON.stringify({ ok: true, data: { jobId: "job_restore_123456" } }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })

      const res = await callAgent<{ jobId: string }>("POST", "/v1/backups/bk_1/restore", {
        body: { targetMode: "test", targetDbName: "nilelink_restore_test" },
      })
      assert.strictEqual(res.jobId, "job_restore_123456")
    })

    it("supports GET /v1/mail/status (MailEnable monitoring)", async () => {
      setRemoteConfig()
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              status: "online",
              services: { smtp: { name: "MESMTPCS", status: "running" }, imap: { name: "MEIMAPS", status: "running" } },
              connectivity: { smtp: { port: 25, reachable: true }, imap: { port: 143, reachable: true } },
              queues: { inbound: 0, outbound: 0, badMail: 0, accessible: true },
              lastCheck: new Date().toISOString(),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )

      const res = await callAgent<any>("GET", "/v1/mail/status")
      assert.strictEqual(res.status, "online")
      assert.strictEqual(res.services.smtp.status, "running")
      assert.strictEqual(res.connectivity.smtp.reachable, true)
    })
  })
})


import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { GET } from "../../app/api/admin/overview/route"
import { setDbOverviewOverrideForTesting } from "../../lib/backup/overview-data"
import { createAccessToken, ACCESS_COOKIE_NAME } from "../../lib/auth/token-service"
import { setCallAgentOverrideForTesting, BackupApiError } from "../../lib/backup/agent-client"

describe("Admin Overview API Route (GET /api/admin/overview)", () => {
  afterEach(() => {
    setCallAgentOverrideForTesting(null)
    setDbOverviewOverrideForTesting(null)
  })

  async function makeAuthRequest(role: "super_admin" | "staff" | "customer" | null = "super_admin") {
    const headers = new Headers()
    if (role) {
      const token = await createAccessToken({
        userId: "user_test_123",
        email: "test@nilelink.com",
        role,
        firstName: "Test",
        lastName: "User",
      })
      headers.set("cookie", `${ACCESS_COOKIE_NAME}=${token}`)
    }
    return new NextRequest("http://localhost/api/admin/overview", {
      method: "GET",
      headers,
    })
  }

  function mockDb(staff: any[] = [], audits: any[] = []) {
    setDbOverviewOverrideForTesting(async () => ({ staff, audits }))
  }

  it("1. rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
    const req = await makeAuthRequest(null)
    const res = await GET(req)
    assert.strictEqual(res.status, 401)
    const json = await res.json()
    assert.strictEqual(json.code, "UNAUTHORIZED")
  })

  it("2. rejects customer role requests with 403 FORBIDDEN", async () => {
    const req = await makeAuthRequest("customer")
    const res = await GET(req)
    assert.strictEqual(res.status, 403)
    const json = await res.json()
    assert.strictEqual(json.code, "FORBIDDEN")
  })

  it("3. returns healthy status and aggregates all data when all systems are online", async () => {
    mockDb(
      [
        { _id: "u1", firstName: "Khaled", lastName: "Admin", email: "k@nile.com", role: "super_admin", status: "active", createdAt: new Date() },
        { _id: "u2", firstName: "Ahmed", lastName: "Ops", email: "a@nile.com", role: "staff", status: "active", createdAt: new Date() },
        { _id: "u3", firstName: "Sara", lastName: "Logistics", email: "s@nile.com", role: "staff", status: "inactive", createdAt: new Date() },
      ],
      [
        {
          _id: "aud1",
          event: "BACKUP_CREATED",
          operation: "backup",
          result: "success",
          backupId: "bk_20261013T210000Z_auto_11112222",
          actor: { name: "System", role: "system" },
          createdAt: new Date(),
        },
      ]
    )

    setCallAgentOverrideForTesting(async (_method, path) => {
      if (path === "/v1/mail/status") {
        return {
          status: "online",
          services: { smtp: { name: "MESMTPCS", status: "running" }, imap: { name: "MEIMAPS", status: "running" } },
          connectivity: { smtp: { port: 25, reachable: true, responseTimeMs: 14 }, imap: { port: 143, reachable: true } },
          queues: { inbound: 2, outbound: 0, badMail: 0, accessible: true },
          lastCheck: new Date().toISOString(),
          lastSuccessfulCheck: new Date().toISOString(),
          lastOutage: null,
          diagnostics: [],
        }
      }
      if (path === "/v1/health") {
        return {
          status: "ok",
          agent: { isLocked: false, currentJob: null, freeDiskBytes: 150 * 1024 ** 3, totalDiskBytes: 500 * 1024 ** 3, diskLow: false },
          stats: { totalBackups: 10, quarantined: 0, lastCompletedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
          scheduler: { enabled: true, nextRunAt: new Date(Date.now() + 10 * 3600 * 1000).toISOString() },
        }
      }
      if (path.startsWith("/v1/backups")) {
        return {
          items: [
            {
              id: "bk_20261013T210000Z_auto_11112222",
              type: "automatic",
              status: "completed",
              completedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
              sizeBytes: 5000000,
            },
          ],
        }
      }
      if (path === "/v1/scheduler") {
        return { enabled: true, nextRunAt: new Date(Date.now() + 10 * 3600 * 1000).toISOString() }
      }
      return {}
    })

    const req = await makeAuthRequest("super_admin")
    const res = await GET(req)
    assert.strictEqual(res.status, 200)

    const data = await res.json()
    assert.strictEqual(data.systemStatus, "healthy")
    assert.strictEqual(data.alerts.length, 0)

    // Verify email
    assert.strictEqual(data.email.status, "online")
    assert.strictEqual(data.email.smtpStatus, "running")
    assert.strictEqual(data.email.smtpReachable, true)

    // Verify backups
    assert.strictEqual(data.backups.agentStatus, "online")
    assert.strictEqual(data.backups.latestBackupStatus, "completed")
    assert.strictEqual(data.backups.isBackupOverdue, false)
    assert.strictEqual(data.backups.missedScheduledBackup, false)

    // Verify employees
    assert.strictEqual(data.employees.total, 3)
    assert.strictEqual(data.employees.active, 2)
    assert.strictEqual(data.employees.inactive, 1)
    assert.strictEqual(data.employees.roleDistribution.super_admin, 1)
    assert.strictEqual(data.employees.roleDistribution.staff, 2)

    // Verify recent activity
    assert.strictEqual(data.recentActivity.length, 1)
    assert.strictEqual(data.recentActivity[0].event, "BACKUP_CREATED")
    assert.ok(data.recentActivity[0].titleAr.includes("نسخة"))
  })

  it("4. handles email server offline by generating critical alert without failing backups", async () => {
    mockDb()
    setCallAgentOverrideForTesting(async (_method, path) => {
      if (path === "/v1/mail/status") {
        return {
          status: "offline",
          services: { smtp: { name: "MESMTPCS", status: "stopped" }, imap: { name: "MEIMAPS", status: "stopped" } },
          connectivity: { smtp: { port: 25, reachable: false, error: "ECONNREFUSED" }, imap: { port: 143, reachable: false } },
          queues: { inbound: 0, outbound: 0, badMail: 0, accessible: false },
          lastCheck: new Date().toISOString(),
          lastOutage: { startedAt: new Date().toISOString(), endedAt: null, reason: "SMTP stopped" },
          diagnostics: ["SMTP service stopped"],
        }
      }
      if (path === "/v1/health") {
        return {
          status: "ok",
          agent: { isLocked: false, freeDiskBytes: 100 * 1024 ** 3, totalDiskBytes: 500 * 1024 ** 3, diskLow: false },
          stats: { totalBackups: 5, lastCompletedAt: new Date().toISOString() },
        }
      }
      return { items: [] }
    })

    const req = await makeAuthRequest("staff")
    const res = await GET(req)
    assert.strictEqual(res.status, 200)

    const data = await res.json()
    assert.strictEqual(data.systemStatus, "critical")
    assert.strictEqual(data.email.status, "offline")
    assert.strictEqual(data.email.smtpStatus, "stopped")

    const emailAlert = data.alerts.find((a: any) => a.source === "email")
    assert.ok(emailAlert)
    assert.strictEqual(emailAlert.level, "critical")
    assert.ok(emailAlert.titleEn.includes("Offline"))
    assert.ok(emailAlert.titleAr.includes("غير متصل"))
  })

  it("5. handles Backup Agent unreachable gracefully with partial failure resilience", async () => {
    mockDb([
      { _id: "u1", firstName: "Staff", lastName: "One", email: "s@nile.com", role: "staff", status: "active", createdAt: new Date() },
    ])

    // Agent is down: callAgent throws 503
    setCallAgentOverrideForTesting(async () => {
      throw new BackupApiError(503, "AGENT_UNAVAILABLE", "The backup agent is unreachable")
    })

    const req = await makeAuthRequest("super_admin")
    const res = await GET(req)
    assert.strictEqual(res.status, 200)

    const data = await res.json()
    assert.strictEqual(data.systemStatus, "critical")

    // Backup agent reported as offline
    assert.strictEqual(data.backups.agentStatus, "offline")
    // Email reported as unknown (does NOT claim email is offline when agent is unreachable!)
    assert.strictEqual(data.email.status, "unknown")

    // Database data intact
    assert.strictEqual(data.employees.total, 1)

    // Agent alert present
    const agentAlert = data.alerts.find((a: any) => a.source === "agent")
    assert.ok(agentAlert)
    assert.strictEqual(agentAlert.level, "critical")
  })

  it("6. flags last backup failed and missed scheduled backup warnings", async () => {
    mockDb()
    setCallAgentOverrideForTesting(async (_method, path) => {
      if (path === "/v1/mail/status") {
        return {
          status: "online",
          services: { smtp: { name: "MESMTPCS", status: "running" }, imap: { name: "MEIMAPS", status: "running" } },
          connectivity: { smtp: { port: 25, reachable: true }, imap: { port: 143, reachable: true } },
          queues: { inbound: 0, outbound: 0, badMail: 0, accessible: true },
          lastCheck: new Date().toISOString(),
        }
      }
      if (path === "/v1/health") {
        return {
          status: "ok",
          agent: { isLocked: false, freeDiskBytes: 5 * 1024 ** 3, totalDiskBytes: 500 * 1024 ** 3, diskLow: true },
          stats: { totalBackups: 5, lastCompletedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() }, // 48h ago
          scheduler: { enabled: true, last: { lastResult: "failed" } },
        }
      }
      if (path.startsWith("/v1/backups")) {
        return {
          items: [
            { id: "bk_fail", type: "automatic", status: "failed", completedAt: null, sizeBytes: 0 },
            { id: "bk_ok", type: "automatic", status: "completed", completedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), sizeBytes: 500000 },
          ],
        }
      }
      return { enabled: true, last: { lastResult: "failed" } }
    })

    const req = await makeAuthRequest("super_admin")
    const res = await GET(req)
    assert.strictEqual(res.status, 200)

    const data = await res.json()
    assert.strictEqual(data.systemStatus, "warning")
    assert.strictEqual(data.backups.latestBackupStatus, "failed")
    assert.strictEqual(data.backups.failedBackups, 1)
    assert.strictEqual(data.backups.missedScheduledBackup, true)
    assert.strictEqual(data.backups.isBackupOverdue, true)
    assert.ok(data.backups.lastSuccessfulBackupAgeHours! >= 47)

    // Check alerts
    const failedAlert = data.alerts.find((a: any) => a.id === "alert-backup-latest-failed")
    assert.ok(failedAlert)
    const missedAlert = data.alerts.find((a: any) => a.id === "alert-backup-missed")
    assert.ok(missedAlert)
    const diskAlert = data.alerts.find((a: any) => a.id === "alert-backup-disk-low")
    assert.ok(diskAlert)
  })

  it("7. handles empty employee database gracefully", async () => {
    mockDb([], [])
    setCallAgentOverrideForTesting(async () => ({ items: [] }))

    const req = await makeAuthRequest("super_admin")
    const res = await GET(req)
    assert.strictEqual(res.status, 200)

    const data = await res.json()
    assert.strictEqual(data.employees.total, 0)
    assert.strictEqual(data.employees.active, 0)
    assert.strictEqual(data.employees.inactive, 0)
    assert.deepStrictEqual(data.employees.recentlyAdded, [])
    assert.deepStrictEqual(data.recentActivity, [])
  })

  it("8. ensures every alert has both Arabic and English translations", async () => {
    mockDb()
    setCallAgentOverrideForTesting(async () => {
      throw new BackupApiError(503, "AGENT_UNAVAILABLE", "Agent down")
    })

    const req = await makeAuthRequest("super_admin")
    const res = await GET(req)
    const data = await res.json()

    assert.ok(data.alerts.length > 0)
    for (const alert of data.alerts) {
      assert.ok(alert.titleEn.length > 0)
      assert.ok(alert.titleAr.length > 0)
      assert.ok(alert.messageEn.length > 0)
      assert.ok(alert.messageAr.length > 0)
    }
  })

  it("9. outdated agent (404 on /v1/mail/status) is reported as monitoring unavailable, not healthy and not 'Backup not found'", async () => {
    mockDb()
    setCallAgentOverrideForTesting(async (_method, path) => {
      if (path === "/v1/mail/status") {
        throw new BackupApiError(502, "MAIL_ENDPOINT_MISSING", "The deployed agent does not expose /v1/mail/status.")
      }
      if (path === "/v1/health") {
        return {
          status: "ok",
          agent: { isLocked: false, freeDiskBytes: 100 * 1024 ** 3, totalDiskBytes: 500 * 1024 ** 3, diskLow: false },
          stats: { totalBackups: 3, lastCompletedAt: new Date().toISOString() },
          scheduler: { enabled: true, nextRunAt: new Date(Date.now() + 3600 * 1000).toISOString() },
        }
      }
      return { items: [] }
    })

    const data = await (await GET(await makeAuthRequest("super_admin"))).json()
    assert.strictEqual(data.email.status, "unknown")
    assert.strictEqual(data.email.monitoring, "endpoint_missing")
    assert.strictEqual(data.email.queues.inbound, null)
    assert.strictEqual(data.email.queues.outbound, null)
    assert.strictEqual(data.email.queues.badMail, null)
    assert.notStrictEqual(data.systemStatus, "healthy")
    assert.ok(data.alerts.some((a: any) => a.id === "alert-email-unknown"))
    assert.ok(!String(data.email.error).includes("Backup not found"))
    assert.strictEqual(data.backups.agentStatus, "online")
  })

  it("10. degraded email (queues unreadable) keeps null counts and raises a warning", async () => {
    mockDb()
    setCallAgentOverrideForTesting(async (_method, path) => {
      if (path === "/v1/mail/status") {
        return {
          status: "degraded",
          services: { smtp: { name: "MESMTPCS", status: "running" }, imap: { name: "MEIMAPS", status: "running" } },
          connectivity: { smtp: { port: 25, reachable: true }, imap: { port: 143, reachable: true } },
          queues: { inbound: null, outbound: null, badMail: null, accessible: false, error: "queues not found" },
          lastCheck: new Date().toISOString(),
          lastSuccessfulCheck: new Date().toISOString(),
          lastOutage: null,
          diagnostics: ["queues not found"],
        }
      }
      if (path === "/v1/health") {
        return { status: "ok", agent: { isLocked: false, diskLow: false }, stats: { totalBackups: 1, lastCompletedAt: new Date().toISOString() }, scheduler: { enabled: true, nextRunAt: new Date(Date.now() + 3600 * 1000).toISOString() } }
      }
      return { items: [] }
    })

    const data = await (await GET(await makeAuthRequest("super_admin"))).json()
    assert.strictEqual(data.email.status, "degraded")
    assert.strictEqual(data.email.monitoring, "available")
    assert.strictEqual(data.email.queues.inbound, null)
    assert.ok(data.alerts.some((a: any) => a.id === "alert-email-degraded"))
    assert.strictEqual(data.systemStatus, "warning")
  })
})

import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { POST } from "../../app/api/admin/system/backups/[id]/restore/route"
import { setRequireBackupAdminOverrideForTesting } from "../../lib/backup/guard"
import { setCallAgentOverrideForTesting } from "../../lib/backup/agent-client"
import { setRecordSystemAuditOverrideForTesting } from "../../lib/backup/audit"

describe("Restore API Route (/api/admin/system/backups/[id]/restore)", () => {
  const VALID_ID = "bk_20261011T120000Z_manual_abcdef12"

  afterEach(() => {
    setRequireBackupAdminOverrideForTesting(null)
    setCallAgentOverrideForTesting(null)
    setRecordSystemAuditOverrideForTesting(null)
  })

  function mockAdmin(role: "super_admin" | "staff" = "super_admin") {
    setRequireBackupAdminOverrideForTesting(async () => ({
      session: {
        userId: "user_123",
        email: "admin@nilelink.com",
        role,
        firstName: "Super",
        lastName: "Admin",
      },
      actor: {
        userId: "user_123",
        email: "admin@nilelink.com",
      },
    }))
    setRecordSystemAuditOverrideForTesting(async () => {})
  }

  it("rejects invalid backup IDs with 400 INVALID_ID", async () => {
    mockAdmin("super_admin")
    const req = new NextRequest("http://localhost/api/admin/system/backups/invalid_id/restore", {
      method: "POST",
      body: JSON.stringify({ targetMode: "test" }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: "invalid_id" }) })
    assert.strictEqual(res.status, 400)
    const json = await res.json()
    assert.strictEqual(json.code, "INVALID_ID")
  })

  it("rejects non-super-admin from triggering production restore with 403 FORBIDDEN", async () => {
    mockAdmin("staff") // staff member with canManageBackups, but NOT super_admin
    const req = new NextRequest(`http://localhost/api/admin/system/backups/${VALID_ID}/restore`, {
      method: "POST",
      body: JSON.stringify({
        targetMode: "production",
        confirmPhrase: "RESTORE",
        acknowledgeDataLoss: true,
      }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: VALID_ID }) })
    assert.strictEqual(res.status, 403)
    const json = await res.json()
    assert.strictEqual(json.code, "FORBIDDEN")
    assert.ok(json.error.includes("super administrators"))
  })

  it("rejects production restore if confirmPhrase is not 'RESTORE'", async () => {
    mockAdmin("super_admin")
    const req = new NextRequest(`http://localhost/api/admin/system/backups/${VALID_ID}/restore`, {
      method: "POST",
      body: JSON.stringify({
        targetMode: "production",
        confirmPhrase: "WRONG_PHRASE",
        acknowledgeDataLoss: true,
      }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: VALID_ID }) })
    assert.strictEqual(res.status, 400)
    const json = await res.json()
    assert.strictEqual(json.code, "INVALID_REQUEST")
    assert.ok(json.error.includes("RESTORE"))
  })

  it("rejects production restore if acknowledgeDataLoss is not true", async () => {
    mockAdmin("super_admin")
    const req = new NextRequest(`http://localhost/api/admin/system/backups/${VALID_ID}/restore`, {
      method: "POST",
      body: JSON.stringify({
        targetMode: "production",
        confirmPhrase: "RESTORE",
        acknowledgeDataLoss: false,
      }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: VALID_ID }) })
    assert.strictEqual(res.status, 400)
    const json = await res.json()
    assert.strictEqual(json.code, "INVALID_REQUEST")
  })

  it("successfully initiates test restore and returns 202 with jobId", async () => {
    mockAdmin("staff")
    let calledPath = ""
    let calledBody: any = null

    setCallAgentOverrideForTesting(async (_method, path, opts) => {
      calledPath = path
      calledBody = opts?.body
      return { jobId: "job_restore_test_999" }
    })

    const req = new NextRequest(`http://localhost/api/admin/system/backups/${VALID_ID}/restore`, {
      method: "POST",
      body: JSON.stringify({
        targetMode: "test",
        targetDbName: "nilelink_custom_test",
      }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: VALID_ID }) })
    assert.strictEqual(res.status, 202)
    const json = await res.json()
    assert.strictEqual(json.jobId, "job_restore_test_999")
    assert.strictEqual(calledPath, `/v1/backups/${VALID_ID}/restore`)
    assert.strictEqual(calledBody.targetMode, "test")
  })

  it("successfully initiates production restore for super_admin and records audit", async () => {
    mockAdmin("super_admin")
    let auditRecorded = false
    setRecordSystemAuditOverrideForTesting(async (entry: any) => {
      if (entry.event === "RESTORE_REQUESTED" && entry.details.targetMode === "production") {
        auditRecorded = true
      }
    })

    setCallAgentOverrideForTesting(async () => ({ jobId: "job_restore_prod_111" }))

    const req = new NextRequest(`http://localhost/api/admin/system/backups/${VALID_ID}/restore`, {
      method: "POST",
      body: JSON.stringify({
        targetMode: "production",
        confirmPhrase: "RESTORE",
        acknowledgeDataLoss: true,
      }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: VALID_ID }) })
    assert.strictEqual(res.status, 202)
    const json = await res.json()
    assert.strictEqual(json.jobId, "job_restore_prod_111")
    assert.strictEqual(auditRecorded, true)
  })
})

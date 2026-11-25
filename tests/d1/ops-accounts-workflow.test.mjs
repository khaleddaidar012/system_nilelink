import assert from "node:assert/strict"
import { test } from "node:test"
import { Miniflare } from "miniflare"
import { readD1MigrationStatements } from "../../scripts/d1/migrations.mjs"
import { createAccessToken, ACCESS_COOKIE_NAME } from "../../lib/auth/token-service.ts"
import { createD1WorkflowHandler } from "../../lib/workflows/d1-handlers.ts"
import { handleShipmentInvoices, shipmentInvoiceError } from "../../lib/workflows/shipment-invoices.ts"
import { WorkflowStore, actorFor } from "../../lib/workflows/runtime.ts"
import { OPERATIONS_PRESET, ACCOUNTS_PRESET, sanitizeStaffPermissions } from "../../lib/auth/staff-categories.ts"

const origin = "http://localhost"

async function req(token, path, method = "GET", body) {
  return new Request(origin + path, {
    method,
    headers: { cookie: `${ACCESS_COOKIE_NAME}=${token}`, origin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function runAccounting(db, token, action, path, method = "GET", body, id) {
  try {
    const store = new WorkflowStore(db)
    const request = await req(token, path, method, body)
    const actor = await actorFor(store, request)
    store.activity = { user: actor.user, action }
    return await handleShipmentInvoices(store, actor, { action, request, id })
  } catch (error) {
    return shipmentInvoiceError(error)
  }
}

test("sanitizeStaffPermissions strips financial permissions from operations accounts", () => {
  const sanitized = sanitizeStaffPermissions({
    ...OPERATIONS_PRESET,
    canAccessAccounts: true,
    createInvoice: true,
    editInvoice: true,
    issueTaxInvoice: true,
    sendFinancialDocuments: true,
    canUseTieredPricing: true,
  })
  assert.equal(sanitized.canAccessAccounts, false)
  assert.equal(sanitized.createInvoice, false)
  assert.equal(sanitized.editInvoice, false)
  assert.equal(sanitized.issueTaxInvoice, false)
  assert.equal(sanitized.sendFinancialDocuments, false)
  assert.equal(sanitized.canUseTieredPricing, false)
  assert.equal(sanitized.canViewShipmentData, true)
  assert.equal(sanitized.canMarkReadyForAccounts, true)
})

test("operations -> ready-for-accounts -> admin approval -> accounts draft -> approval request -> admin publish", async () => {
  process.env.DATABASE_PROVIDER = "d1"
  process.env.D1_MIGRATION_PREVIEW = "true"
  process.env.JWT_SECRET = "local-ops-accounts-test-secret"
  const simulator = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("fixture") } }',
    compatibilityDate: "2025-04-01",
    d1Databases: { DB: "ops-accounts-test" },
    d1Persist: false,
  })
  try {
    const db = await simulator.getD1Database("DB")
    await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
    const now = new Date().toISOString()
    const adminId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const opsId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const accId = "cccccccccccccccccccccccc"
    const custId = "dddddddddddddddddddddddd"
    const reqId = "eeeeeeeeeeeeeeeeeeeeeeee"

    await db.batch([
      db.prepare("INSERT INTO users(id,data) VALUES(?,?)").bind(adminId, JSON.stringify({ _id: adminId, email: "khaled@nilelinklogistics.com", firstName: "Khaled", lastName: "Admin", role: "super_admin", status: "active", createdAt: now, updatedAt: now })),
      db.prepare("INSERT INTO users(id,data) VALUES(?,?)").bind(opsId, JSON.stringify({ _id: opsId, email: "waad@nilelinklogistics.com", firstName: "Waad", lastName: "Ops", role: "staff", status: "active", staffPermissions: OPERATIONS_PRESET, createdAt: now, updatedAt: now })),
      db.prepare("INSERT INTO users(id,data) VALUES(?,?)").bind(accId, JSON.stringify({ _id: accId, email: "logy@nilelinklogistics.com", firstName: "Logy", lastName: "Accounts", role: "staff", status: "active", staffPermissions: ACCOUNTS_PRESET, createdAt: now, updatedAt: now })),
      db.prepare("INSERT INTO customers(id,data) VALUES(?,?)").bind(custId, JSON.stringify({ _id: custId, companyName: "Delta Export", accountStatus: "active", commercialRegisterNumber: "CR-10", taxCardNumber: "TAX-10", createdAt: now, updatedAt: now })),
      db.prepare("INSERT INTO customer_requests(id,data) VALUES(?,?)").bind(reqId, JSON.stringify({ _id: reqId, customerId: custId, trackingNumber: "NL-REQ-2026-000010", subject: "Export Container", status: "processing", quoteRequired: false, createdAt: now, updatedAt: now })),
    ])

    const adminToken = await createAccessToken({ userId: adminId, email: "khaled@nilelinklogistics.com", role: "super_admin" })
    const opsToken = await createAccessToken({ userId: opsId, email: "waad@nilelinklogistics.com", role: "staff" })
    const accToken = await createAccessToken({ userId: accId, email: "logy@nilelinklogistics.com", role: "staff" })
    const wf = createD1WorkflowHandler(db)

    // 1. Operations cannot create invoice
    const opsInv = await runAccounting(db, opsToken, "shipment-invoice-from-request", `/api/admin/requests/${reqId}/invoices/create`, "POST", {}, reqId)
    assert.equal(opsInv.status, 403)

    // 2. Accounts cannot create invoice before admin approval
    const accEarly = await runAccounting(db, accToken, "shipment-invoice-from-request", `/api/admin/requests/${reqId}/invoices/create`, "POST", {}, reqId)
    assert.equal(accEarly.status, 403)

    // 3. Operations marks shipment ready for accounts -> notifies super_admin
    const markRes = await wf({ action: "accounts-readiness-mark", request: await req(opsToken, `/api/admin/requests/${reqId}/accounts-readiness`, "POST", { note: "All docs ready" }), id: reqId, input: { note: "All docs ready" } })
    assert.equal(markRes.status, 200)
    assert.equal((await markRes.json()).readiness.state, "pending_admin")

    // 4. Accounts cannot see pending_admin shipments in ready list
    const accListBefore = await wf({ action: "accounts-readiness-list", request: await req(accToken, "/api/admin/accounts-readiness") })
    assert.equal((await accListBefore.json()).shipments.length, 0)

    // 5. Operations cannot approve its own readiness request
    const opsApprove = await wf({ action: "accounts-readiness-decide", request: await req(opsToken, `/api/admin/requests/${reqId}/accounts-readiness`, "POST", { decision: "approve" }), id: reqId, input: { decision: "approve" } })
    assert.equal(opsApprove.status, 403)

    // 6. Admin approves -> Accounts now sees it and can create draft invoice
    const adminApprove = await wf({ action: "accounts-readiness-decide", request: await req(adminToken, `/api/admin/requests/${reqId}/accounts-readiness`, "POST", { decision: "approve" }), id: reqId, input: { decision: "approve" } })
    assert.equal(adminApprove.status, 200)
    const accListAfter = await wf({ action: "accounts-readiness-list", request: await req(accToken, "/api/admin/accounts-readiness") })
    assert.equal((await accListAfter.json()).shipments.length, 1)

    // 7. Accounts creates draft invoice, adds a completed stage + price, and requests admin approval
    const created = await runAccounting(db, accToken, "shipment-invoice-from-request", `/api/admin/requests/${reqId}/invoices/create`, "POST", {}, reqId)
    assert.equal(created.status, 201)
    const invoiceId = (await created.json()).invoice.id

    const detail = await (await runAccounting(db, accToken, "shipment-invoice-detail", `/api/admin/shipment-invoices/${invoiceId}`, "GET", undefined, invoiceId)).json()
    const costId = crypto.randomUUID()
    const saved = await runAccounting(db, accToken, "shipment-invoice-save", `/api/admin/shipment-invoices/${invoiceId}`, "PUT", {
      revision: detail.invoice.revision,
      pricingMode: "per-item-v1",
      notes: "Ready for approval",
      stages: {
        shipping: { completed: true, costs: [{ id: costId, description: "Sea Freight", amount: "1000.00", saleEqualsCost: false, sellingPrice: "1500.00", currency: "EGP", exchangeRate: "1", notes: "" }] },
        transportation: { completed: false, costs: [] },
        customs: { completed: false, costs: [] },
      },
    }, invoiceId)
    assert.equal(saved.status, 200)
    const savedJson = await saved.json()

    // Accounts cannot publish directly
    const previewRes = await runAccounting(db, accToken, "shipment-invoice-preview", `/api/admin/shipment-invoices/${invoiceId}/preview`, "POST", { revision: savedJson.invoice.revision }, invoiceId)
    assert.equal(previewRes.status, 200)
    const previewData = await previewRes.json()
    const accPublish = await runAccounting(db, accToken, "shipment-invoice-publish", `/api/admin/shipment-invoices/${invoiceId}/publish`, "POST", { revision: savedJson.invoice.revision, previewKey: previewData.previewKey }, invoiceId)
    assert.equal(accPublish.status, 403)

    // Accounts sends approval request to admin
    const reqApproval = await runAccounting(db, accToken, "shipment-invoice-request-approval", `/api/admin/shipment-invoices/${invoiceId}/request-approval`, "POST", { revision: savedJson.invoice.revision }, invoiceId)
    assert.equal(reqApproval.status, 200)
    const reqApprovalJson = await reqApproval.json()
    assert.ok(reqApprovalJson.invoice.approvalRequest)

    // Filter awaiting_approval returns this invoice
    const awaiting = await (await runAccounting(db, adminToken, "shipment-invoice-list", "/api/admin/shipment-invoices?status=awaiting_approval")).json()
    assert.equal(awaiting.invoices.length, 1)

    // Admin previews and publishes -> clears approvalRequest and marks confirmed
    const adminPreview = await (await runAccounting(db, adminToken, "shipment-invoice-preview", `/api/admin/shipment-invoices/${invoiceId}/preview`, "POST", { revision: reqApprovalJson.invoice.revision }, invoiceId)).json()
    const published = await runAccounting(db, adminToken, "shipment-invoice-publish", `/api/admin/shipment-invoices/${invoiceId}/publish`, "POST", { revision: reqApprovalJson.invoice.revision, previewKey: adminPreview.previewKey }, invoiceId)
    assert.equal(published.status, 200)
    const publishedJson = await published.json()
    assert.equal(publishedJson.invoice.status, "published")
    assert.equal(publishedJson.invoice.approvalRequest, null)
  } finally {
    await simulator.dispose()
  }
})

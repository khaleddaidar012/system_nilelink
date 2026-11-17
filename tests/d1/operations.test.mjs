import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { WorkflowStore, timestamped } from '../../lib/workflows/runtime.ts'
import { evaluateExpiry } from '../../lib/workflows/expiry.ts'
import { workspaceActivity } from '../../lib/activity/workspace.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { POST as sendInvoice } from '../../app/api/admin/invoices/[id]/send/route.ts'
import { POST as sendStatement } from '../../app/api/admin/customers/[id]/statement/send/route.ts'
import { POST as expiryRoute } from '../../app/api/cron/check-expiries/route.ts'
import { requireBackupAdmin } from '../../lib/backup/guard.ts'
import { sendEmail } from '../../lib/email/send.ts'
import { registerProvider } from '../../lib/email/providers/index.ts'
import { createResendProvider } from '../../lib/email/providers/resend.ts'
import { processDeliveryJob } from '../../lib/workflows/delivery-worker.ts'
import { clientInvoice, financialRenderers } from '../../lib/workflows/financial-views.ts'
import { POST as cancelInvoice } from '../../app/api/admin/invoices/[id]/cancel/route.ts'

let simulator, db, store, staffCookie, customerCookie, number = 20, invoice
const id = n => n.toString(16).padStart(24, '0')
const keys = ['DATABASE_PROVIDER', 'D1_MIGRATION_PREVIEW', 'NODE_ENV', 'JWT_SECRET', 'CRON_SECRET', 'EMAIL_PROVIDER']
const env = Object.fromEntries(keys.map(key => [key, process.env[key]])), contextKey = Symbol.for('__cloudflare-context__'), oldContext = globalThis[contextKey]
const time = Date.UTC(2035, 0, 1)
async function insert(table, data) { await db.prepare(`INSERT INTO ${table} (id,data) VALUES (?,?)`).bind(data._id, JSON.stringify(data)).run() }
async function count(table) { return (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n }
function req(input, key, cookie = staffCookie, headers = {}) {
  return new Request('http://localhost/api/test', { method: 'POST', headers: { ...(cookie ? { cookie } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...(input === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
}
const params = value => ({ params: Promise.resolve({ id: value }) })
async function customer(patch = {}) { const value = timestamped({ _id: id(++number), companyName: `Company ${number}`, contactEmail: `company${number}@example.test`, commercialRegisterNumber: `CR-${number}`, accountStatus: 'active', ...patch }); await insert('customers', value); return value }
async function document(customerId, days, patch = {}) {
  const value = timestamped({ customerId, title: `Document ${++number}`, category: 'commercial_register', fileName: 'fixture.pdf', storageKey: `fixture/${number}`, fileSize: 10, mimeType: 'application/pdf', status: 'approved', isArchived: false, expiryDate: new Date(time + days * 86400000).toISOString(), warningEscalationTier: 'none', ...patch })
  await insert('documents', value); return value
}
before(async () => {
  Object.assign(process.env, { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', NODE_ENV: 'test', JWT_SECRET: 'local-operations-fixture-secret' })
  delete process.env.CRON_SECRET
  simulator = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'operations-test' }, d1Persist: false })
  db = await simulator.getD1Database('DB'); await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  store = new WorkflowStore(db); globalThis[contextKey] = { env: { DB: db }, cf: {}, ctx: {} }
  await insert('customers', timestamped({ _id: id(1), companyName: 'Recipient', contactEmail: 'recipient@example.test', commercialRegisterNumber: 'CR-1' }))
  for (const [n, role] of [[2, 'staff'], [3, 'customer_admin']]) {
    const user = timestamped({ _id: id(n), email: `user${n}@example.test`, role, status: 'active', firstName: 'Test', lastName: 'User', customerId: n === 3 ? id(1) : null,
      staffPermissions: { sendFinancialDocuments: true, editInvoice: true, canManageBackups: true, canSendAlerts: true, issueTaxInvoice: false } })
    await insert('users', user)
    const cookie = `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: user._id, role, email: user.email, firstName: 'Test', lastName: 'User', customerId: user.customerId })}`
    if (n === 2) staffCookie = cookie; else customerCookie = cookie
  }
  invoice = timestamped({ customerId: id(1), invoiceNumber: 'INV-2035-000001', token: 'operations-fixture-token', documentType: 'invoice', status: 'confirmed', currency: 'EGP', totalAmount: 100, paidAmount: 0, remainingAmount: 100,
    issueDate: '2035-01-01T00:00:00.000Z', dueDate: '2035-02-01T00:00:00.000Z', customerSnapshot: { companyName: 'Recipient', contactEmail: 'recipient@example.test' }, items: [{ description: 'Freight', quantity: 1, unitPrice: 100, total: 100 }], internalNotes: 'private-note' })
  await insert('invoices', invoice)
})
after(async () => {
  await simulator?.dispose()
  if (oldContext === undefined) delete globalThis[contextKey]; else globalThis[contextKey] = oldContext
  for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
})
test('workspace badges clear on opening, return for new items, and remain isolated per staff member', async () => {
  const get = cookie => workspaceActivity(db, new Request('http://localhost/api/admin/workspace-activity', { headers: { cookie } }))
  const mark = (section, cookie = staffCookie, origin = 'http://localhost') => workspaceActivity(db, new Request('http://localhost/api/admin/workspace-activity', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ section }) }))
  const other = timestamped({ role: 'staff', status: 'active', email: 'workspace@example.test', firstName: 'Other', lastName: 'Staff' })
  await insert('users', other)
  const otherCookie = `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: other._id, role: other.role, email: other.email, firstName: other.firstName, lastName: other.lastName })}`
  await insert('customer_requests', timestamped({ customerId: id(1), requestedBy: id(3), trackingNumber: 'BADGE-1', status: 'submitted' }))
  const initial = await get(staffCookie)
  assert.equal(initial.status, 200)
  assert.equal((await initial.json()).counts.requests, 1)
  assert.equal((await mark('requests')).status, 200)
  assert.equal((await (await get(staffCookie)).json()).counts.requests, 0)
  assert.equal((await (await get(otherCookie)).json()).counts.requests, 1)
  await insert('customer_requests', timestamped({ customerId: id(1), requestedBy: id(3), trackingNumber: 'BADGE-2', status: 'submitted' }))
  assert.equal((await (await get(staffCookie)).json()).counts.requests, 1)
  assert.equal((await mark('activity')).status, 200)
  assert.equal((await (await get(staffCookie)).json()).counts.requests, 1)
  assert.equal((await get(customerCookie)).status, 403)
  assert.equal((await mark('requests', staffCookie, 'https://untrusted.test')).status, 403)
  assert.equal((await mark('invalid')).status, 400)
})

test('invoice delivery is queued atomically with audit and never marked sent', async () => {
  const result = await sendInvoice(req(undefined, 'delivery-invoice-key-1'), params(invoice._id))
  assert.equal(result.status, 202, JSON.stringify(await result.clone().json()))
  const json = await result.json(); assert.equal(json.queued, true); assert.equal(json.deliveryStatus, 'pending')
  const job = (await store.read('_nilelink_delivery_jobs', json.deliveryId)).data
  assert.equal(job.recipient, 'recipient@example.test'); assert.equal(job.previewOnly, true)
  assert.equal('internalNotes' in job.payload.invoice, false)
  assert.deepEqual((await store.read('invoices', invoice._id)).data, invoice)
  assert.equal((await store.list('invoice_activity_logs', 'invoiceId = ?', [invoice._id])).length, 1)
  const replay = await sendInvoice(req(undefined, 'delivery-invoice-key-1'), params(invoice._id))
  assert.equal(replay.status, 202); assert.equal((await replay.json()).replayed, true)
  assert.equal(await count('_nilelink_delivery_jobs'), 1)
})
test('delivery permissions, invoice state, tax permission and retry key are checked before queueing', async () => {
  assert.equal((await sendInvoice(req(undefined), params(invoice._id))).status, 400)
  assert.equal((await sendInvoice(req(undefined, 'customer-delivery-key', customerCookie), params(invoice._id))).status, 403)
  const source = await store.read('invoices', invoice._id)
  await store.commit({ updates: [{ before: source, patch: { status: 'draft' } }] })
  assert.equal((await sendInvoice(req(undefined, 'draft-delivery-key'), params(invoice._id))).status, 409)
  await store.commit({ updates: [{ before: await store.read('invoices', invoice._id), patch: { status: 'confirmed', documentType: 'tax_invoice' } }] })
  assert.equal((await sendInvoice(req(undefined, 'tax-delivery-key-1'), params(invoice._id))).status, 403)
  await store.commit({ updates: [{ before: await store.read('invoices', invoice._id), patch: { documentType: 'invoice' } }] })
})
test('concurrent delivery retries create exactly one job and audit', async () => {
  const before = await count('_nilelink_delivery_jobs')
  const results = await Promise.all([sendInvoice(req(undefined, 'concurrent-delivery-key'), params(invoice._id)), sendInvoice(req(undefined, 'concurrent-delivery-key'), params(invoice._id))])
  assert.ok(results.every(result => result.status === 202)); assert.equal(await count('_nilelink_delivery_jobs'), before + 1)
})
test('statement queues a frozen currency-specific snapshot and rejects reused keys with changed inputs', async () => {
  const request = { fromDate: '2035-01-01', toDate: '2035-01-31', currency: 'EGP', recipientEmail: 'billing@example.test', customMessage: 'Please review' }
  const result = await sendStatement(req(request, 'statement-delivery-key'), params(id(1)))
  assert.equal(result.status, 202)
  const job = (await store.read('_nilelink_delivery_jobs', (await result.json()).deliveryId)).data
  assert.equal(job.payload.statement.summary.closingBalance, 100); assert.equal(job.recipient, 'billing@example.test')
  assert.equal((await sendStatement(req({ ...request, currency: 'USD' }, 'statement-delivery-key'), params(id(1)))).status, 409)
})
test('queue audit failure rolls back the delivery job', async () => {
  const before = await count('_nilelink_delivery_jobs'), original = store.commit.bind(store)
  store.commit = args => original({ ...args, extra: [db.prepare('INSERT INTO _nilelink_write_guards (id, valid) VALUES (?,0)').bind('delivery-rollback')] })
  try {
    const { actorFor } = await import('../../lib/workflows/runtime.ts'), { queueFinancialDelivery } = await import('../../lib/workflows/delivery.ts')
    const request = req(undefined, 'delivery-rollback-key')
    await assert.rejects(() => actorFor(store, request).then(actor => queueFinancialDelivery(store, actor, { action: 'invoice-send', id: invoice._id, request })))
  } finally { store.commit = original }
  assert.equal(await count('_nilelink_delivery_jobs'), before)
})
test('expiry preserves approved accounts with pending files and ignores shipment documents for account health', async () => {
  const client = await customer()
  const current = await store.read('customers', client._id)
  await store.commit({ updates: [{ before: current, patch: { accountStatus: 'active', statusReason: 'Staff approved account' } }] })
  await document(client._id, 365)
  await document(client._id, 365, { status: 'pending_review' })
  await document(client._id, -1, { entityType: 'CustomerRequest' })
  await evaluateExpiry(store, null, time)
  let account = (await store.read('customers', client._id)).data
  assert.equal(account.accountStatus, 'active')
  assert.equal(account.statusReason, 'Staff approved account')
  await evaluateExpiry(store, null, time)
  assert.equal((await store.read('customers', client._id)).data.accountStatus, 'active')
  await document(client._id, -1, { entityType: 'Customer' })
  await evaluateExpiry(store, null, time)
  assert.equal((await store.read('customers', client._id)).data.accountStatus, 'inactive')
})

test('expiry transitions, health and in-app alerts commit once and preserve source fields', async () => {
  const client = await customer(), doc = await document(client._id, -1, { originalExtra: { retain: true } })
  const first = await evaluateExpiry(store, null, time)
  assert.equal(first.expiredCount, 1); assert.equal(first.notificationsCreated, 2)
  const stored = (await store.read('documents', doc._id)).data
  assert.equal(stored.status, 'expired'); assert.equal(stored.lastNotificationSentAt, undefined); assert.equal(stored.lastNotificationQueuedAt, new Date(time).toISOString())
  assert.deepEqual(stored.originalExtra, { retain: true })
  assert.equal((await store.read('customers', client._id)).data.accountStatus, 'inactive')
  const second = await evaluateExpiry(store, null, time)
  assert.equal(second.notificationsCreated, 0)
})
test('overlapping expiry evaluations do not duplicate notifications and persist warning tiers', async () => {
  const client = await customer(), doc = await document(client._id, 5)
  const before = await count('notifications')
  const results = await Promise.all([evaluateExpiry(store, null, time), evaluateExpiry(store, null, time)])
  assert.equal(results.reduce((sum, result) => sum + result.notificationsCreated, 0), 2)
  assert.equal(await count('notifications'), before + 2)
  assert.equal((await store.read('documents', doc._id)).data.status, 'expiring_soon')
})
test('expiry sends a new detailed alert at the next tier without repeating the same tier', async () => {
  const client = await customer(), doc = await document(client._id, 30)
  await evaluateExpiry(store, null, time)
  await evaluateExpiry(store, null, time + 10 * 86400000)
  await evaluateExpiry(store, null, time + 10 * 86400000)
  const notes = await store.list('notifications', "json_extract(data, '$.relatedDocumentId') = ?", [doc._id])
  assert.equal(notes.length, 4)
  assert.deepEqual(notes.map(row => row.data.expiryTierDays).sort(), [20, 20, 30, 30])
  assert.ok(notes.every(row => row.data.message.includes(doc.title)))
})

test('expiry does not undo a manual inactive hold and flags invalid dates for review', async () => {
  const held = await customer({ accountStatus: 'inactive', statusReason: 'Manual staff hold' })
  await document(held._id, 90)
  const broken = await customer(), doc = await document(broken._id, 30, { expiryDate: 'invalid-date' })
  const result = await evaluateExpiry(store, null, time)
  assert.ok(result.requiresReview >= 1)
  assert.equal((await store.read('customers', held._id)).data.statusReason, 'Manual staff hold')
  assert.equal((await store.read('documents', doc._id)).data.expiryDate, 'invalid-date')
})
test('cron has no hardcoded-secret fallback and honors current staff alert permission', async () => {
  const denied = await expiryRoute(req(undefined, undefined, null, { authorization: 'Bearer nilelink_cron_secret_2026_automated_radar' }))
  assert.equal(denied.status, 401)
  assert.equal((await expiryRoute(req(undefined, undefined, customerCookie))).status, 403)
  process.env.CRON_SECRET = 'local-fixture-cron-secret'
  assert.equal((await expiryRoute(req(undefined, undefined, null, { authorization: 'Bearer local-fixture-cron-secret' }))).status, 200)
})
test('D1 backup guard blocks the Mongo backup agent and checks current authorization', async () => {
  const result = await requireBackupAdmin(req(undefined), { destructive: true })
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'D1_BACKUP_UNAVAILABLE')
  assert.equal((await requireBackupAdmin(req(undefined, undefined, customerCookie))).status, 403)
  assert.equal((await requireBackupAdmin(req(undefined, undefined, null))).status, 401)
})
test('email service forwards PDF attachments to the provider without sending external mail', async () => {
  process.env.EMAIL_PROVIDER = 'resend'
  let captured
  registerProvider('resend', () => ({ name: 'fixture', async send(options) { captured = options; return { success: true, messageId: 'local-fixture' } } }))
  try {
    const attachments = [{ filename: 'invoice.pdf', content: Buffer.from('%PDF-fixture'), contentType: 'application/pdf' }]
    await sendEmail({ to: 'fixture@example.test', subject: 'Fixture', html: '<p>Fixture</p>', attachments })
    assert.deepEqual(captured.attachments, attachments)
  } finally { registerProvider('resend', createResendProvider) }
})
test('lost queue response resolves the committed job without inserting a second one', async () => {
  const original = store.commit.bind(store), before = await count('_nilelink_delivery_jobs')
  store.commit = async args => { await original(args); throw new Error('Lost response after commit') }
  try {
    const { actorFor } = await import('../../lib/workflows/runtime.ts'), { queueFinancialDelivery } = await import('../../lib/workflows/delivery.ts')
    const request = req(undefined, 'delivery-uncertain-key')
    const result = await queueFinancialDelivery(store, await actorFor(store, request), { action: 'invoice-send', id: invoice._id, request })
    assert.equal(result.status, 202); assert.equal((await result.json()).replayed, true)
  } finally { store.commit = original }
  assert.equal(await count('_nilelink_delivery_jobs'), before + 1)
})
test('expiry cooldown does not claim email delivery and exact expiry timestamp is expired', async () => {
  const client = await customer(), advisory = await document(client._id, 30), exact = await document(client._id, 0)
  await evaluateExpiry(store, null, time)
  const countFor = doc => store.list('notifications', "json_extract(data, '$.relatedDocumentId') = ?", [doc._id])
  assert.equal((await countFor(advisory)).length, 2)
  assert.equal((await store.read('documents', exact._id)).data.status, 'expired')
  await evaluateExpiry(store, null, time + 86400000)
  assert.equal((await countFor(advisory)).length, 2)
  assert.deepEqual((await countFor(advisory)).map(row => row.data.targetAudience).sort(), ['all_staff', 'customer'])
  const note = (await countFor(advisory))[0].data
  assert.equal(note.channel, 'in_app'); assert.equal(note.emailStatus, 'not_applicable')
})
test('expiry audit failure rolls back document, customer and notification together', async () => {
  const client = await customer(), doc = await document(client._id, -1), original = store.commit.bind(store)
  store.commit = args => original({ ...args, extra: [db.prepare('INSERT INTO _nilelink_write_guards (id, valid) VALUES (?,0)').bind('expiry-rollback')] })
  try {
    const result = await evaluateExpiry(store, null, time)
    assert.ok(result.conflicts > 0)
  } finally { store.commit = original }
  assert.deepEqual((await store.read('documents', doc._id)).data, doc)
  assert.deepEqual((await store.read('customers', client._id)).data, client)
  assert.equal((await store.list('notifications', "json_extract(data, '$.relatedDocumentId') = ?", [doc._id])).length, 0)
})

async function workerFixture(previewOnly = true) {
  const source = timestamped({ customerId: id(1), invoiceNumber: `WORKER-${++number}`, token: `worker-token-${number}`, documentType: 'invoice', status: 'confirmed', currency: 'EGP', totalAmount: 100, paidAmount: 0, remainingAmount: 100,
    issueDate: '2035-01-01T00:00:00.000Z', dueDate: '2035-02-01T00:00:00.000Z', customerSnapshot: { companyName: '<script>fixture</script>', contactEmail: 'recipient@example.test' }, items: [{ description: 'Freight', quantity: 1, unitPrice: 100, total: 100 }] })
  await insert('invoices', source)
  const job = timestamped({ requestKey: `worker-request-${number}`, requestHash: `worker-hash-${number}`, kind: 'invoice-send', state: 'pending', recipient: 'recipient@example.test', customerId: id(1), invoiceId: source._id, requestedBy: id(2), payload: { invoice: clientInvoice(source) }, previewOnly })
  await insert('_nilelink_delivery_jobs', job)
  return { source, job }
}
async function withPdfFixture(callback) {
  const original = financialRenderers.invoice
  financialRenderers.invoice = async () => Buffer.from('%PDF-local-worker-fixture')
  try { await callback() } finally { financialRenderers.invoice = original }
}
test('delivery worker creates a preview with PDF attachment and escaped HTML without marking invoice sent', async () => {
  await withPdfFixture(async () => {
    const { source, job } = await workerFixture(), messages = []
    const transport = { mode: 'preview', async deliver(message, key) { messages.push({ message, key }); return { receiptId: 'local-preview' } } }
    const result = await processDeliveryJob(store, job._id, transport)
    assert.equal(result.state, 'previewed'); assert.equal(messages.length, 1)
    assert.equal(Buffer.from(messages[0].message.attachment.contentBase64, 'base64').subarray(0, 5).toString(), '%PDF-')
    assert.ok(messages[0].message.html.includes('&lt;script&gt;')); assert.ok(!messages[0].message.html.includes('<script>'))
    const stored = (await store.read('invoices', source._id)).data
    assert.equal(stored.status, 'confirmed'); assert.equal(stored.sentAt, undefined)
    assert.equal((await processDeliveryJob(store, job._id, transport)).replayed, true); assert.equal(messages.length, 1)
  })
})
test('overlapping delivery workers claim one job and invoke transport once', async () => {
  await withPdfFixture(async () => {
    const { job } = await workerFixture(); let calls = 0
    const transport = { mode: 'preview', async deliver() { calls++; return { receiptId: 'single-preview' } } }
    const results = await Promise.allSettled([processDeliveryJob(store, job._id, transport), processDeliveryJob(store, job._id, transport)])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(calls, 1)
  })
})
test('preview jobs cannot use live transport, and changed invoice snapshots are not sent', async () => {
  const { source, job } = await workerFixture(); let calls = 0
  const transport = { mode: 'live', async deliver() { calls++; return { receiptId: 'forbidden' } } }
  await assert.rejects(() => processDeliveryJob(store, job._id, transport), /Preview jobs/)
  await store.commit({ updates: [{ before: await store.read('invoices', source._id), patch: { notes: 'Changed after queueing' } }] })
  await assert.rejects(() => processDeliveryJob(store, job._id, { ...transport, mode: 'preview' }), /Invoice changed/)
  assert.equal(calls, 0)
})
test('lost transport response becomes uncertain and is never automatically resent or cancelled', async () => {
  await withPdfFixture(async () => {
    const { source, job } = await workerFixture(false); let calls = 0
    const transport = { mode: 'live', async deliver() { calls++; throw new Error('Accepted but response lost: private transport details') } }
    await assert.rejects(() => processDeliveryJob(store, job._id, transport), /requires reconciliation/)
    assert.equal((await store.read('_nilelink_delivery_jobs', job._id)).data.state, 'uncertain')
    await assert.rejects(() => processDeliveryJob(store, job._id, transport), /will not be resent/)
    assert.equal(calls, 1)
    assert.equal((await cancelInvoice(req({ reason: 'Cancel' }), params(source._id))).status, 409)
  })
})
test('render failure is distinct from uncertain transport and never invokes the sender', async () => {
  const { job } = await workerFixture(), original = financialRenderers.invoice; let calls = 0
  financialRenderers.invoice = async () => { throw new Error('Fixture rendering failure') }
  try {
    await assert.rejects(() => processDeliveryJob(store, job._id, { mode: 'preview', async deliver() { calls++; return { receiptId: 'unused' } } }), /rendering failed/)
    assert.equal((await store.read('_nilelink_delivery_jobs', job._id)).data.state, 'render_failed')
    assert.equal(calls, 0)
  } finally { financialRenderers.invoice = original }
})
test('injected accepted transport preserves a concurrent payment and records receipt atomically', async () => {
  await withPdfFixture(async () => {
    const { source, job } = await workerFixture(false)
    const transport = { mode: 'live', async deliver() {
      assert.equal((await cancelInvoice(req({ reason: 'Cannot cancel in-flight' }), params(source._id))).status, 409)
      await store.commit({ updates: [{ before: await store.read('invoices', source._id), patch: { paidAmount: 50, remainingAmount: 50, status: 'partially_paid' } }] })
      return { receiptId: 'fake-provider-accepted' }
    } }
    assert.equal((await processDeliveryJob(store, job._id, transport)).state, 'sent')
    const stored = (await store.read('invoices', source._id)).data
    assert.equal(stored.status, 'partially_paid'); assert.equal(stored.paidAmount, 50); assert.equal(stored.remainingAmount, 50); assert.ok(stored.sentAt)
    assert.equal((await store.read('_nilelink_delivery_jobs', job._id)).data.receiptId, 'fake-provider-accepted')
  })
})
test('receipt-write failure never resends a provider-accepted message', async () => {
  await withPdfFixture(async () => {
    const { source, job } = await workerFixture(false), original = store.commit.bind(store); let commits = 0, sends = 0
    store.commit = async args => {
      commits++
      if (commits === 2) return original({ ...args, extra: [db.prepare('INSERT INTO _nilelink_write_guards (id, valid) VALUES (?,0)').bind('receipt-rollback')] })
      return original(args)
    }
    try {
      const transport = { mode: 'live', async deliver() { sends++; return { receiptId: 'accepted-before-db-failure' } } }
      await assert.rejects(() => processDeliveryJob(store, job._id, transport))
      await assert.rejects(() => processDeliveryJob(store, job._id, transport))
      assert.equal(sends, 1); assert.equal((await store.read('_nilelink_delivery_jobs', job._id)).data.state, 'uncertain')
      assert.equal((await store.read('invoices', source._id)).data.sentAt, undefined)
    } finally { store.commit = original }
  })
})
test('delivery worker rechecks current permission before claiming a queued job', async () => {
  const { job } = await workerFixture(), user = await store.read('users', id(2)), permissions = user.data.staffPermissions
  await store.commit({ updates: [{ before: user, patch: { staffPermissions: { ...permissions, sendFinancialDocuments: false } } }] })
  try {
    await assert.rejects(() => processDeliveryJob(store, job._id), /permission has been revoked/)
    assert.equal((await store.read('_nilelink_delivery_jobs', job._id)).data.state, 'pending')
  } finally { await store.commit({ updates: [{ before: await store.read('users', id(2)), patch: { staffPermissions: permissions } }] }) }
})

test('live invoice API sends a PDF through the configured provider and replay never sends twice', async () => {
  const names = ['EMAIL_DELIVERY_ENABLED', 'EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY']
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  Object.assign(process.env, { EMAIL_DELIVERY_ENABLED: 'true', EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'sender@example.test', RESEND_API_KEY: 're_fixture' })
  const messages = []
  registerProvider('resend', () => ({ name: 'fixture', async send(message) { messages.push(message); return { success: true, messageId: 'live-fixture-receipt' } } }))
  try {
    await withPdfFixture(async () => {
      const { source } = await workerFixture(false), key = 'live-invoice-integration-key'
      const created = await sendInvoice(req(undefined, key), params(source._id))
      assert.equal(created.status, 200); const result = await created.json(); assert.equal(result.queued, false); assert.equal(result.deliveryStatus, 'sent')
      assert.equal(messages.length, 1); assert.ok(messages[0].idempotencyKey.startsWith('nilelink-delivery-'))
      assert.equal(messages[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-')
      assert.equal((await store.read('invoices', source._id)).data.status, 'sent')
      assert.equal((await sendInvoice(req(undefined, key), params(source._id))).status, 200); assert.equal(messages.length, 1)
    })
  } finally {
    registerProvider('resend', createResendProvider)
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  }
})

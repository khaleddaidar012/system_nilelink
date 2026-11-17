import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy } from 'wrangler'
import { createD1WorkflowHandler } from '../../lib/workflows/d1-handlers.ts'
import { WorkflowStore, actorFor, timestamped, notification } from '../../lib/workflows/runtime.ts'
import { handleInvoices } from '../../lib/workflows/invoices.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { createR2PreviewStorage } from '../../lib/storage/r2-preview-storage.ts'
import { PREVIEW_OBJECT_PREFIX } from '../../lib/storage/preview-object-prefix.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv.length !== 4 || process.argv[3] !== '--execute') throw new Error('Usage: node --use-system-ca --import ./tests/d1/register-typescript.mjs scripts/d1/validate-staging-workflows.mjs <private-fixture-directory> --execute')
const target = await realpath(process.argv[2])
if (!target.startsWith(path.join(root, '.private/d1-migration/worker-staging') + path.sep)) throw new Error('A private staging fixture target is required')
const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'))
const config = JSON.parse(await readFile(path.join(target, 'wrangler.json'), 'utf8'))
if (manifest.scope !== 'synthetic-worker-e2e' || manifest.sourceRecordsCopied !== false || manifest.accountId !== 'f882b38e4571e0141cb6353f5a271af7' || config.account_id !== manifest.accountId || manifest.databaseName !== 'nilelink-d1-staging-e2e' || config.d1_databases.length !== 1 || config.d1_databases[0].database_id !== manifest.databaseId || config.d1_databases[0].preview_database_id !== manifest.databaseId || config.d1_databases[0].remote !== true || config.r2_buckets.length !== 1 || config.r2_buckets[0].bucket_name !== 'nilelink-d1-staging-e2e-files' || config.r2_buckets[0].remote !== true) throw new Error('Fixture resource identity mismatch')
for (const name of ['CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_KEY']) if (process.env[name]) throw new Error('Use the reviewed OAuth profile, without auth overrides')
for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID']) if (process.env[name] && process.env[name] !== manifest.accountId) throw new Error('Environment account mismatch')
const directory = path.join(target, 'workflow-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'node-domain-handlers-with-real-remote-d1-and-r2', startedAt: new Date().toISOString(), accountId: manifest.accountId, databaseId: manifest.databaseId, bucketName: manifest.bucketName, results: [], sourceRecordsModified: false, externalMessagesSent: false, workerCpuValidated: false, productionCertified: false, status: 'running' }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
async function check(name, callback) {
  try { await callback(); report.results.push({ name, passed: true }); await save(); console.log(JSON.stringify({ check: name, passed: true })) }
  catch (error) { report.results.push({ name, passed: false, error: String(error.message).slice(0, 1500) }); throw error }
}
const oldJwt = process.env.JWT_SECRET
process.env.JWT_SECRET = randomBytes(48).toString('hex')
let proxy
try {
  await save()
  proxy = await getPlatformProxy({ configPath: path.join(target, 'wrangler.json'), envFiles: [], persist: false, remoteBindings: true })
  const db = proxy.env.DB, storage = createR2PreviewStorage({ D1_PREVIEW_FILES: proxy.env.D1_PREVIEW_FILES })
  const store = new WorkflowStore(db), dispatch = createD1WorkflowHandler(db, { storage })
  const customerA = timestamped({ companyName: 'Remote validation ' + randomUUID(), contactEmail: randomUUID() + '@example.test', commercialRegisterNumber: randomUUID(), accountStatus: 'active', maxAllowedDocuments: 20 })
  const customerB = timestamped({ companyName: 'Remote validation ' + randomUUID(), contactEmail: randomUUID() + '@example.test', commercialRegisterNumber: randomUUID(), accountStatus: 'active' })
  const users = [
    timestamped({ email: randomUUID() + '@example.test', firstName: 'Synthetic', lastName: 'Admin', role: 'super_admin', status: 'active', customerId: null }),
    ...[customerA, customerA, customerB].map(customer => timestamped({ email: randomUUID() + '@example.test', firstName: 'Synthetic', lastName: 'Customer', role: 'customer_admin', status: 'active', customerId: customer._id })),
    timestamped({ email: randomUUID() + '@example.test', firstName: 'Synthetic', lastName: 'Restricted', role: 'staff', status: 'active', customerId: null, staffPermissions: { createInvoice: false, editInvoice: false } }),
  ]
  await store.commit({ inserts: [{ table: 'customers', data: customerA }, { table: 'customers', data: customerB }, ...users.map(data => ({ table: 'users', data }))] })
  const cookies = await Promise.all(users.map(user => createAccessToken({ userId: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, customerId: user.customerId }).then(token => `${ACCESS_COOKIE_NAME}=${token}`)))
  const http = (cookie = cookies[0], input, key) => new Request('https://fixture.invalid/api/test', { method: input === undefined ? 'GET' : 'POST', headers: { cookie, ...(input === undefined ? {} : { 'content-type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
  const run = (action, input, id, cookie = cookies[0], key) => dispatch({ action, request: http(cookie, input, key), id })
  async function json(response, status = 200) { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data }
  const draftInput = { customerId: customerA._id, currency: 'EGP', documentType: 'invoice', issueDate: '2040-01-01', dueDate: '2040-02-01', items: [{ description: 'Synthetic freight', quantity: 2, unitPrice: 100 }], taxRate: 14, discount: 0, additionalCharges: 0 }
  const draft = async () => (await json(await run('invoice-create', draftInput), 201)).invoice
  let invoice
  await check('draft edit preserves unknown fields; confirmation freezes later edits', async () => {
    invoice = await draft(); assert.equal(invoice.totalAmount, 228)
    await store.commit({ updates: [{ before: await store.read('invoices', invoice._id), patch: { retained: { nested: [1, null, 'original'] } } }] })
    invoice = (await json(await run('invoice-update', { items: [{ description: 'Edited freight', quantity: 3, unitPrice: 100 }] }, invoice._id))).invoice
    assert.equal(invoice.totalAmount, 342); assert.deepEqual(invoice.retained, { nested: [1, null, 'original'] })
    await json(await run('invoice-confirm', {}, invoice._id))
    assert.equal((await run('invoice-update', { notes: 'Forbidden edit' }, invoice._id)).status, 409)
    assert.equal((await run('invoice-archive', {}, invoice._id)).status, 409)
  })
  await check('concurrent duplicate payment keys produce one payment and one balance change', async () => {
    const key = randomUUID(), input = { customerId: customerA._id, invoiceId: invoice._id, amount: 20, currency: 'EGP' }
    const responses = await Promise.all([run('payment-record', input, undefined, cookies[0], key), run('payment-record', input, undefined, cookies[0], key)])
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 201])
    assert.equal((await store.list('payments', 'invoiceId = ?', [invoice._id])).length, 1)
    assert.equal((await store.read('invoices', invoice._id)).data.paidAmount, 20)
    assert.equal((await run('payment-record', { ...input, amount: 21 }, undefined, cookies[0], key)).status, 409)
  })
  await check('competing payments cannot overpay; invoice balances equal stored payment totals', async () => {
    const input = { customerId: customerA._id, invoiceId: invoice._id, amount: 200, currency: 'EGP' }
    const results = await Promise.all([run('payment-record', input, undefined, cookies[0], randomUUID()), run('payment-record', input, undefined, cookies[0], randomUUID())])
    assert.deepEqual(results.map(response => response.status).sort(), [201, 409])
    const payments = await store.list('payments', 'invoiceId = ?', [invoice._id]), current = (await store.read('invoices', invoice._id)).data
    assert.equal(payments.reduce((sum, row) => sum + row.data.amount, 0), 220)
    assert.equal(current.paidAmount, 220); assert.equal(current.remainingAmount, 122)
    const before = JSON.stringify(current)
    assert.equal((await run('invoice-cancel', { reason: 'Paid cancellation must fail' }, invoice._id)).status, 409)
    assert.equal(JSON.stringify((await store.read('invoices', invoice._id)).data), before)
  })
  await check('unpaid cancellation and draft archive preserve original items, tokens and audit', async () => {
    const unpaid = await draft(); await json(await run('invoice-confirm', {}, unpaid._id))
    await json(await run('invoice-cancel', { reason: 'Synthetic cancellation' }, unpaid._id))
    const cancelled = (await store.read('invoices', unpaid._id)).data
    assert.equal(cancelled.status, 'cancelled'); assert.deepEqual(cancelled.items, unpaid.items); assert.equal(cancelled.token, unpaid.token)
    const archived = await draft(); await json(await run('invoice-archive', {}, archived._id))
    const retained = (await store.read('invoices', archived._id)).data
    assert.ok(retained.archivedAt); assert.equal(retained.token, archived.token); assert.deepEqual(retained.items, archived.items)
    assert.equal((await store.list('invoice_activity_logs', 'invoiceId = ?', [archived._id])).length, 2)
  })
  await check('forged role claims cannot override stored permissions and tenant isolation', async () => {
    const restricted = users[4], token = await createAccessToken({ userId: restricted._id, email: restricted.email, firstName: restricted.firstName, lastName: restricted.lastName, role: 'super_admin' })
    assert.equal((await run('invoice-create', draftInput, undefined, `${ACCESS_COOKIE_NAME}=${token}`)).status, 403)
    assert.equal((await run('invoice-create', draftInput, undefined, cookies[1])).status, 403)
    const other = await json(await run('portal-financials', undefined, undefined, cookies[3]))
    assert.equal(other.invoices.some(row => row._id === invoice._id), false)
  })
  await check('injected audit failure rolls back the entire real D1 invoice transaction', async () => {
    const counts = async () => Promise.all(['invoices', 'invoice_activity_logs'].map(async table => (await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE json_extract(data,'$.customerId') = ?`).bind(customerA._id).first()).n))
    const before = await counts(), failing = new WorkflowStore(db), commit = failing.commit.bind(failing)
    failing.commit = command => commit({ ...command, extra: [db.prepare('INSERT INTO _nilelink_write_guards (id,valid) VALUES (?,0)').bind(randomUUID())] })
    const request = http(cookies[0], draftInput)
    await assert.rejects(async () => handleInvoices(failing, await actorFor(failing, request), { action: 'invoice-create', request }))
    assert.deepEqual(await counts(), before)
  })
  await check('simultaneous notification readers retain both users and deny a foreign tenant', async () => {
    const note = notification({ recipientCustomerId: customerA._id, title: 'Synthetic concurrent read' })
    await store.commit({ inserts: [{ table: 'notifications', data: note }] })
    const responses = await Promise.all([run('notifications-read', { notificationId: note._id }, undefined, cookies[1]), run('notifications-read', { notificationId: note._id }, undefined, cookies[2])])
    assert.deepEqual(responses.map(response => response.status), [200, 200])
    assert.deepEqual((await store.read('notifications', note._id)).data.readBy.sort(), [users[1]._id, users[2]._id].sort())
    assert.equal((await run('notifications-read', { notificationId: note._id }, undefined, cookies[3])).status, 404)
  })
  const upload = (names, selectedStorage = storage) => {
    const form = new FormData()
    for (const name of names) { form.append('files', new File(['%PDF-1.7 Synthetic fault validation ' + name], name, { type: 'application/pdf' })); form.append('categories', 'commercial_register'); form.append('titles', name) }
    return createD1WorkflowHandler(db, { storage: selectedStorage })({ action: 'document-upload', request: new Request('https://fixture.invalid/api/portal/documents/upload', { method: 'POST', headers: { cookie: cookies[1] }, body: form }) })
  }
  await check('injected second-file failure removes only uncommitted R2 objects and leaves no metadata', async () => {
    let calls = 0
    const keys = [], selectedStorage = { ...storage, async put(...args) { if (++calls === 2) throw new Error('Injected second upload failure'); const result = await storage.put(...args); keys.push(args[1]); return result } }
    assert.equal((await upload(['fault-a.pdf', 'fault-b.pdf'], selectedStorage)).status, 500)
    assert.equal((await store.list('documents', 'customerId = ?', [customerA._id])).length, 0)
    for (const key of keys) assert.equal(await proxy.env.D1_PREVIEW_FILES.get(PREVIEW_OBJECT_PREFIX + key), null)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM _nilelink_storage_pending WHERE ownerId = ?').bind(customerA._id).first()).n, 0)
  })
  await check('concurrent real R2 uploads respect D1 document quota and retain the committed file', async () => {
    await store.commit({ updates: [{ before: await store.read('customers', customerA._id), patch: { maxAllowedDocuments: 1 } }] })
    const responses = await Promise.all([upload(['quota-a.pdf']), upload(['quota-b.pdf'])])
    assert.equal(responses.filter(response => response.status === 201).length, 1)
    assert.equal(responses.filter(response => [400, 409].includes(response.status)).length, 1)
    const documents = await store.list('documents', 'customerId = ?', [customerA._id]); assert.equal(documents.length, 1)
    assert.ok(await proxy.env.D1_PREVIEW_FILES.get(PREVIEW_OBJECT_PREFIX + documents[0].data.storageKey))
    assert.equal((await db.prepare('SELECT count(*) AS n FROM _nilelink_storage_pending WHERE ownerId = ?').bind(customerA._id).first()).n, 0)
  })
  report.status = 'all-checks-passed'
} catch { report.status = 'stopped-on-failure'; process.exitCode = 1 }
finally {
  report.completedAt = new Date().toISOString(); await save(); await proxy?.dispose()
  if (oldJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwt
  console.log(JSON.stringify({ directory, status: report.status, passed: report.results.filter(result => result.passed).length, total: report.results.length, workerCpuValidated: false }))
}

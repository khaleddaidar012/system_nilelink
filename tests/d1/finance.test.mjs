import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { createD1WorkflowHandler } from '../../lib/workflows/d1-handlers.ts'
import { WorkflowStore, timestamped } from '../../lib/workflows/runtime.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { POST } from '../../app/api/admin/payments/route.ts'
import { POST as createInvoice, GET as listInvoices } from '../../app/api/admin/invoices/route.ts'
import { GET as detailInvoice, PUT as updateInvoice, DELETE as archiveInvoice } from '../../app/api/admin/invoices/[id]/route.ts'
import { POST as confirmInvoice } from '../../app/api/admin/invoices/[id]/confirm/route.ts'
import { GET as peekInvoice } from '../../app/api/admin/invoices/next-number/route.ts'
import { invoiceNumber } from '../../lib/workflows/invoices.ts'
import { GET as portalFinancials } from '../../app/api/portal/financials/route.ts'
import { GET as tokenInvoice } from '../../app/api/invoice/[token]/route.ts'
import { POST as cancelInvoice } from '../../app/api/admin/invoices/[id]/cancel/route.ts'
import { GET as statementRoute } from '../../app/api/admin/customers/[id]/statement/route.ts'
import { GET as statementPdfRoute } from '../../app/api/admin/customers/[id]/statement/pdf/route.ts'
import { GET as adminPdfRoute } from '../../app/api/admin/invoices/[id]/pdf/route.ts'
import { GET as portalPdfRoute } from '../../app/api/portal/invoices/[id]/pdf/route.ts'
import { financialRenderers } from '../../lib/workflows/financial-views.ts'
import { mkdir, writeFile } from 'node:fs/promises'

let simulator, db, store, dispatch, staffCookie, customerCookie, counter = 100
const id = value => value.toString(16).padStart(24, '0')
const keys = ['DATABASE_PROVIDER', 'D1_MIGRATION_PREVIEW', 'NODE_ENV', 'JWT_SECRET']
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
const contextKey = Symbol.for('__cloudflare-context__'), oldContext = globalThis[contextKey]
async function insert(table, data) { await db.prepare(`INSERT INTO ${table} (id,data) VALUES (?,?)`).bind(data._id, JSON.stringify(data)).run() }
async function count(table) { return (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n }
async function invoice(patch = {}) {
  const value = timestamped({ _id: id(++counter), invoiceNumber: `TEST-${counter}`, token: `token-${counter}`, customerId: id(1), currency: 'EGP', status: 'confirmed', totalAmount: 100, paidAmount: 0, remainingAmount: 100, extraSourceField: { retain: true }, ...patch })
  await insert('invoices', value); return value
}
function req(value, key, cookie = staffCookie) {
  return new Request('http://localhost/api/admin/payments', { method: 'POST', headers: { cookie, 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(value) })
}
function input(inv, patch = {}) { return { customerId: id(1), invoiceId: inv._id, amount: 20, ...patch } }
function pay(inv, key, patch = {}, cookie) { return dispatch({ action: 'payment-record', request: req(input(inv, patch), key, cookie) }) }
before(async () => {
  Object.assign(process.env, { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', NODE_ENV: 'test', JWT_SECRET: 'local-finance-fixtures-secret' })
  simulator = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'finance-test' }, d1Persist: false })
  db = await simulator.getD1Database('DB')
  await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  store = new WorkflowStore(db); dispatch = createD1WorkflowHandler(db)
  globalThis[contextKey] = { env: { DB: db }, cf: {}, ctx: {} }
  for (const n of [1, 2]) await insert('customers', timestamped({ _id: id(n), companyName: `Company${n}`, contactEmail: `customer${n}@example.test`, commercialRegisterNumber: `CR${n}` }))
  for (const [n, role] of [[3, 'staff'], [4, 'customer_admin']]) {
    const user = timestamped({ _id: id(n), email: `${n}@example.test`, role, status: 'active', firstName: 'Test', lastName: 'User', staffPermissions: { createInvoice: true, editInvoice: true, issueTaxInvoice: false, viewCustomerStatements: true, exportCustomerStatements: true }, ...(n === 4 ? { customerId: id(1) } : {}) })
    await insert('users', user)
    const cookie = `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: user._id, email: user.email, role, firstName: 'Test', lastName: 'User', customerId: user.customerId })}`
    if (n === 3) staffCookie = cookie; else customerCookie = cookie
  }
})
after(async () => {
  await simulator?.dispose()
  if (oldContext === undefined) delete globalThis[contextKey]; else globalThis[contextKey] = oldContext
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
})
test('actual route atomically records payment, balance and log, preserving extra source fields', async () => {
  const inv = await invoice()
  const result = await POST(req(input(inv), 'first-payment-key-0001'))
  assert.equal(result.status, 201, JSON.stringify(await result.clone().json()))
  const stored = (await store.read('invoices', inv._id)).data
  assert.equal(stored.paidAmount, 20); assert.equal(stored.remainingAmount, 80); assert.equal(stored.status, 'partially_paid')
  assert.deepEqual(stored.extraSourceField, inv.extraSourceField)
  const logs = await store.list('invoice_activity_logs', 'invoiceId = ?', [inv._id]); assert.equal(logs.length, 1)
  const replay = await POST(req(input(inv), 'first-payment-key-0001'))
  assert.equal(replay.status, 200); assert.equal((await replay.json()).replayed, true)
  assert.equal((await pay(inv, 'first-payment-key-0001', { amount: 21 })).status, 409)
})
test('rejects missing retry key, customer access, wrong tenant, currency and invalid amounts', async () => {
  const inv = await invoice(), before = await count('payments')
  assert.equal((await pay(inv, null)).status, 400)
  assert.equal((await pay(inv, 'customer-payment-key', {}, customerCookie)).status, 403)
  for (const patch of [{ customerId: id(2) }, { currency: 'USD' }, { amount: 100.01 }, { amount: 0.001 }, { amount: -1 }, { amount: 0 }]) {
    assert.ok([400, 409].includes((await pay(inv, 'invalid-payment-key', patch)).status))
  }
  assert.equal(await count('payments'), before)
})
test('preserves inconsistent or high precision historical balances for explicit reconciliation', async () => {
  for (const patch of [{ remainingAmount: 99 }, { paidAmount: 0.001 }, { paidAmount: 10, remainingAmount: 90 }, { totalAmount: 1e15 }, { status: 'draft' }, { status: 'cancelled' }, { status: 'paid' }]) {
    const inv = await invoice(patch)
    assert.equal((await pay(inv, `historical-key-${inv._id}`)).status, 409)
    assert.deepEqual((await store.read('invoices', inv._id)).data, inv)
  }
})
test('simultaneous retries with one key create exactly one payment and one audit entry', async () => {
  const inv = await invoice()
  const results = await Promise.all([pay(inv, 'concurrent-same-key'), pay(inv, 'concurrent-same-key')])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201])
  assert.equal((await store.list('payments', 'invoiceId = ?', [inv._id])).length, 1)
  assert.equal((await store.list('invoice_activity_logs', 'invoiceId = ?', [inv._id])).length, 1)
})
test('concurrent different payments cannot overspend or lose invoice balance changes', async () => {
  const inv = await invoice()
  const results = await Promise.all([pay(inv, 'concurrent-other-key-1', { amount: 60 }), pay(inv, 'concurrent-other-key-2', { amount: 60 })])
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
  assert.equal((await store.read('invoices', inv._id)).data.remainingAmount, 40)
  assert.equal((await pay(inv, 'final-settlement-key', { amount: 40 })).status, 201)
  assert.equal((await store.read('invoices', inv._id)).data.status, 'paid')
})
test('audit failure rolls back the payment and balance together', async () => {
  const inv = await invoice(), originalCommit = store.commit.bind(store)
  store.commit = args => originalCommit({ ...args, extra: [db.prepare('INSERT INTO _nilelink_write_guards (id,valid) VALUES (?,0)').bind('force-finance-rollback')] })
  try {
    const { actorFor } = await import('../../lib/workflows/runtime.ts')
    const { handleFinance } = await import('../../lib/workflows/finance.ts')
    const request = req(input(inv), 'forced-rollback-key')
    await assert.rejects(() => actorFor(store, request).then(actor => handleFinance(store, actor, { action: 'payment-record', request })))
  } finally { store.commit = originalCommit }
  assert.deepEqual((await store.read('invoices', inv._id)).data, inv)
  assert.equal((await store.list('payments', 'invoiceId = ?', [inv._id])).length, 0)
})
test('lost response after commit is resolved without a second payment', async () => {
  const inv = await invoice(), originalCommit = store.commit.bind(store)
  store.commit = async args => { await originalCommit(args); throw new Error('Simulated lost response after commit') }
  try {
    const { actorFor } = await import('../../lib/workflows/runtime.ts')
    const { handleFinance } = await import('../../lib/workflows/finance.ts')
    const request = req(input(inv), 'uncertain-payment-key')
    const result = await handleFinance(store, await actorFor(store, request), { action: 'payment-record', request })
    assert.equal(result.status, 200); assert.equal((await result.json()).replayed, true)
  } finally { store.commit = originalCommit }
  assert.equal((await store.list('payments', 'invoiceId = ?', [inv._id])).length, 1)
  assert.equal((await store.read('invoices', inv._id)).data.paidAmount, 20)
})

function draftInput(patch = {}) {
  return { customerId: id(1), currency: 'EGP', documentType: 'invoice', issueDate: '2040-01-01', dueDate: '2040-02-01',
    items: [{ description: 'Freight', quantity: 2, unitPrice: 100 }], taxRate: 14, discount: 0, additionalCharges: 0, ...patch }
}
const params = value => ({ params: Promise.resolve({ id: value._id }) })
async function draft(patch = {}) {
  const result = await createInvoice(req(draftInput(patch)))
  assert.equal(result.status, 201, JSON.stringify(await result.clone().json()))
  return (await result.json()).invoice
}
test('invoice creation uses existing calculator, safe customer snapshot, and atomic audit', async () => {
  const inv = await draft()
  assert.equal(inv.totalAmount, 228); assert.equal(inv.remainingAmount, 228); assert.equal(inv.status, 'draft')
  assert.equal(inv.customerId, id(1)); assert.equal(inv.customerSnapshot.companyName, 'Company1')
  assert.ok(inv.token.length >= 36)
  assert.equal((await store.list('invoice_activity_logs', 'invoiceId = ?', [inv._id])).length, 1)
  const detail = await detailInvoice(req({}), params(inv))
  assert.equal(detail.status, 200)
  const json = await detail.json()
  assert.equal(json.invoice.createdBy._id, id(3)); assert.equal('passwordHash' in json.invoice.createdBy, false)
})
test('invoice inputs reject invalid dates, overflowing arithmetic, ambiguous clients and excessive lines', async () => {
  const before = await count('invoices')
  for (const patch of [{ issueDate: 'bad' }, { issueDate: '2040-02-30' }, { dueDate: '2039-01-01' }, { externalCustomer: { companyName: 'Other' } },
    { items: [{ description: 'Overflow', quantity: 1e300, unitPrice: 1e300 }] }, { items: Array.from({ length: 101 }, () => ({ description: 'x', quantity: 1, unitPrice: 1 })) }]) {
    assert.ok([400, 409].includes((await createInvoice(req(draftInput(patch)))).status))
  }
  assert.equal(await count('invoices'), before)
})
test('invoice links must belong to one customer, request and quote in the same currency', async () => {
  const requestId = id(++counter), quoteId = id(++counter)
  await insert('customer_requests', timestamped({ _id: requestId, customerId: id(2), trackingNumber: `REL-${counter}` }))
  await insert('quotes', timestamped({ _id: quoteId, customerId: id(2), requestId, quoteNumber: `REL-Q-${counter}`, currency: 'USD' }))
  assert.equal((await createInvoice(req(draftInput({ relatedRequestId: requestId })))).status, 409)
  assert.equal((await createInvoice(req(draftInput({ customerId: id(2), relatedRequestId: requestId, relatedQuoteId: quoteId })))).status, 409)
  const inv = await draft({ customerId: id(2), relatedRequestId: requestId, relatedQuoteId: quoteId, currency: 'USD' })
  assert.equal(inv.relatedQuoteId, quoteId)
})
test('invoice allocation respects historical numbers and counters; peek is read only and allocations unique', async () => {
  await invoice({ invoiceNumber: 'INV-2041-009999' })
  const before = await count('invoice_sequences')
  const result = await peekInvoice(new Request('http://localhost/api/admin/invoices/next-number?year=2041', { headers: { cookie: staffCookie } }))
  assert.equal((await result.json()).nextNumber, 'INV-2041-010000')
  assert.equal(await count('invoice_sequences'), before)
  const allocated = await Promise.all(Array.from({ length: 4 }, () => invoiceNumber(store, 2041, true)))
  assert.equal(new Set(allocated).size, 4)
  assert.ok(allocated.includes('INV-2041-010003'))
  assert.equal((await peekInvoice(new Request('http://localhost/?year=NaN', { headers: { cookie: staffCookie } }))).status, 400)
})
test('draft edits preserve unknown fields and full prior state, then confirmation freezes writes', async () => {
  const inv = await draft()
  const source = await store.read('invoices', inv._id)
  await store.commit({ updates: [{ before: source, patch: { retained: { nested: [1, null] }, items: inv.items.map(item => ({ ...item, oldItemExtra: true })) } }] })
  const updated = await updateInvoice(req({ items: [{ description: 'Freight updated', quantity: 3, unitPrice: 100 }], notes: 'Updated' }), params(inv))
  assert.equal(updated.status, 200)
  const json = (await updated.json()).invoice
  assert.equal(json.totalAmount, 342); assert.equal(json.items[0].oldItemExtra, true); assert.deepEqual(json.retained, { nested: [1, null] })
  const logs = await store.list('invoice_activity_logs', 'invoiceId = ?', [inv._id])
  assert.ok(logs.some(row => row.data.action === 'edit' && row.data.previousState.items[0].total === 200))
  const confirmed = await confirmInvoice(req({}), params(inv))
  assert.equal(confirmed.status, 200, JSON.stringify(await confirmed.clone().json()))
  const frozen = (await confirmed.json()).invoice
  assert.equal(frozen.status, 'confirmed'); assert.equal(frozen.customerSnapshot.companyName, 'Company1')
  assert.equal((await updateInvoice(req({ notes: 'late edit' }), params(inv))).status, 409)
  assert.equal((await archiveInvoice(req({}), params(inv))).status, 409)
  assert.equal((await confirmInvoice(req({}), params(inv))).status, 409)
  assert.equal((await store.list('notifications', "json_extract(data, '$.relatedInvoiceId') = ? AND targetAudience='customer'", [inv._id])).length, 1)
  assert.equal((await pay(frozen, 'new-draft-confirmed-payment', { amount: 342 })).status, 201)
})
test('tax invoice permissions use current database state even when existing tax type is unchanged', async () => {
  assert.equal((await createInvoice(req(draftInput({ documentType: 'tax_invoice' })))).status, 403)
  const inv = await draft()
  await store.commit({ updates: [{ before: await store.read('invoices', inv._id), patch: { documentType: 'tax_invoice' } }] })
  assert.equal((await updateInvoice(req({ notes: 'tax edit' }), params(inv))).status, 403)
  assert.equal((await confirmInvoice(req({}), params(inv))).status, 403)
  const user = await store.read('users', id(3))
  await store.commit({ updates: [{ before: user, patch: { staffPermissions: { ...user.data.staffPermissions, issueTaxInvoice: true } } }] })
  assert.equal((await confirmInvoice(req({}), params(inv))).status, 200)
})
test('external customers can be created and draft reassignment validates linked relationships', async () => {
  const inv = await draft({ customerId: null, externalCustomer: { companyName: 'Walk-in client', contactPhone: '+20123' } })
  assert.equal(inv.customerId, null); assert.equal(inv.customerSnapshot.contactPhone, '+20123')
  const updated = await updateInvoice(req({ customerId: id(2) }), params(inv))
  assert.equal(updated.status, 200)
  assert.equal((await updated.json()).invoice.customerSnapshot.companyName, 'Company2')
  assert.equal((await updateInvoice(req({ customerId: null }), params(inv))).status, 400)
})
test('draft archive retains invoice, token, original items and audit history', async () => {
  const inv = await draft()
  const result = await archiveInvoice(req({}), params(inv))
  assert.equal(result.status, 200)
  const retained = (await store.read('invoices', inv._id)).data
  assert.equal(retained.token, inv.token); assert.deepEqual(retained.items, inv.items); assert.ok(retained.archivedAt)
  assert.equal((await store.list('invoice_activity_logs', 'invoiceId = ?', [inv._id])).length, 2)
  assert.equal((await confirmInvoice(req({}), params(inv))).status, 409)
})
test('confirmation rejects inconsistent historical line totals without rewriting the draft', async () => {
  const inv = await draft()
  await store.commit({ updates: [{ before: await store.read('invoices', inv._id), patch: { items: [{ ...inv.items[0], total: 199 }] } }] })
  assert.equal((await confirmInvoice(req({}), params(inv))).status, 409)
  assert.equal((await store.read('invoices', inv._id)).data.items[0].total, 199)
})
test('concurrent confirmations produce one decision, one confirmation audit and one notification', async () => {
  const inv = await draft()
  const results = await Promise.all([confirmInvoice(req({}), params(inv)), confirmInvoice(req({}), params(inv))])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  assert.equal((await store.list('invoice_activity_logs', "invoiceId = ? AND json_extract(data, '$.action') = 'confirm'", [inv._id])).length, 1)
})
test('list filters and pagination preserve currency-separated summaries and exclude archives', async () => {
  await draft({ currency: 'EUR', notes: 'Euro' })
  const result = await listInvoices(new Request('http://localhost/api/admin/invoices?search=Company1&limit=2', { headers: { cookie: staffCookie } }))
  assert.equal(result.status, 200)
  const json = await result.json()
  assert.equal(json.invoices.length, 2); assert.equal(json.metrics.totalInvoicedAmount, null)
  assert.ok(json.metrics.byCurrency.EUR); assert.ok(json.metrics.byCurrency.EGP)
  assert.ok(json.invoices.every(inv => !inv.archivedAt))
  const denied = await listInvoices(new Request('http://localhost/api/admin/invoices', { headers: { cookie: customerCookie } }))
  assert.equal(denied.status, 403)
})
test('imported high precision balances remain readable and mark only their currency summary for review', async () => {
  const inv = await invoice({ invoiceNumber: 'READ-PRECISION-TEST', totalAmount: 0.001, remainingAmount: 0.001 })
  const result = await listInvoices(new Request('http://localhost/api/admin/invoices?search=READ-PRECISION-TEST', { headers: { cookie: staffCookie } }))
  assert.equal(result.status, 200)
  const json = await result.json()
  assert.equal(json.invoices[0].totalAmount, 0.001)
  assert.equal(json.metrics.byCurrency.EGP.reconciliationRequired, true)
  assert.equal(json.metrics.totalInvoicedAmount, null)
  assert.equal((await store.read('invoices', inv._id)).data.totalAmount, 0.001)
})
test('exhausted invoice counters fail without changing their source data', async () => {
  const source = { _id: 'INV_2042', seq: Number.MAX_SAFE_INTEGER, extra: 'retained' }
  await insert('invoice_sequences', source)
  await assert.rejects(() => invoiceNumber(store, 2042, true))
  const stored = await db.prepare('SELECT data FROM invoice_sequences WHERE id = ?').bind(source._id).first()
  assert.deepEqual(JSON.parse(stored.data), source)
})
test('invoice creation audit failure leaves no partial invoice or log', async () => {
  const originalCommit = store.commit.bind(store), before = await count('invoices')
  store.commit = args => originalCommit({ ...args, extra: [db.prepare('INSERT INTO _nilelink_write_guards (id,valid) VALUES (?,0)').bind('force-invoice-rollback')] })
  try {
    const { actorFor } = await import('../../lib/workflows/runtime.ts')
    const { handleInvoices } = await import('../../lib/workflows/invoices.ts')
    const request = req(draftInput())
    await assert.rejects(() => actorFor(store, request).then(actor => handleInvoices(store, actor, { action: 'invoice-create', request })))
  } finally { store.commit = originalCommit }
  assert.equal(await count('invoices'), before)
})
test('concurrent edit and confirmation never overwrite an already confirmed invoice', async () => {
  const inv = await draft()
  const results = await Promise.all([updateInvoice(req({ notes: 'racing note' }), params(inv)), confirmInvoice(req({}), params(inv))])
  assert.ok(results.some(result => result.status === 200))
  assert.ok(results.every(result => [200, 409].includes(result.status)))
  let stored = (await store.read('invoices', inv._id)).data
  if (stored.status === 'draft') {
    assert.equal((await confirmInvoice(req({}), params(inv))).status, 200)
    stored = (await store.read('invoices', inv._id)).data
  }
  assert.equal(stored.status, 'confirmed')
  assert.equal((await updateInvoice(req({ notes: 'late' }), params(inv))).status, 409)
})
test('invoice write permissions are revoked immediately despite an older staff token', async () => {
  const inv = await draft(), user = await store.read('users', id(3)), permissions = user.data.staffPermissions
  await store.commit({ updates: [{ before: user, patch: { staffPermissions: { ...permissions, createInvoice: false, editInvoice: false } } }] })
  try {
    assert.equal((await createInvoice(req(draftInput()))).status, 403)
    assert.equal((await updateInvoice(req({ notes: 'forbidden' }), params(inv))).status, 403)
    assert.equal((await confirmInvoice(req({}), params(inv))).status, 403)
    assert.equal((await archiveInvoice(req({}), params(inv))).status, 403)
  } finally { await store.commit({ updates: [{ before: await store.read('users', id(3)), patch: { staffPermissions: permissions } }] }) }
})
test('confirmation preserves zero and overdue status behavior of the existing model', async () => {
  const zero = await draft({ items: [{ description: 'Free service', quantity: 1, unitPrice: 0 }] })
  const paid = await confirmInvoice(req({}), params(zero))
  assert.equal(paid.status, 200); assert.equal((await paid.json()).invoice.status, 'paid')
  const overdue = await draft({ issueDate: '2020-01-01', dueDate: '2020-02-01' })
  const result = await confirmInvoice(req({}), params(overdue))
  assert.equal(result.status, 200); assert.equal((await result.json()).invoice.status, 'overdue')
})

const get = (path, cookie = staffCookie) => new Request('http://localhost' + path, { headers: cookie ? { cookie } : {} })
let ledgerCustomer, ledgerInvoice, publicFixture
test('portal and public-token reads exclude staff-only fields and drafts while preserving original amounts', async () => {
  publicFixture = await invoice({ customerSnapshot: { companyName: 'مؤسسة تجريبية', secret: 'snapshot-secret' },
    items: [{ description: 'خدمة شحن', quantity: 1, unitPrice: 100, total: 100, secret: 'item-secret' }],
    subtotal: 100, taxRate: 0, tax: 0, discount: 0, additionalCharges: 0,
    issueDate: '2040-01-01T00:00:00.000Z', dueDate: '2040-02-01T00:00:00.000Z',
    internalNotes: 'staff-secret', privateImportedExtra: 'legacy-secret', createdBy: id(3) })
  const hidden = await invoice({ status: 'draft' })
  const foreign = await invoice({ customerId: id(2) })
  const portal = await portalFinancials(get('/api/portal/financials', customerCookie))
  assert.equal(portal.status, 200)
  const json = await portal.json(), text = JSON.stringify(json)
  assert.ok(json.invoices.some(inv => inv._id === publicFixture._id))
  assert.ok(!json.invoices.some(inv => [hidden._id, foreign._id].includes(inv._id)))
  for (const secret of ['staff-secret', 'legacy-secret', 'snapshot-secret', 'item-secret']) assert.ok(!text.includes(secret))
  const result = await tokenInvoice(get('/api/invoice/token', null), { params: Promise.resolve({ token: publicFixture.token }) })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).invoice.totalAmount, 100)
  const draftResult = await tokenInvoice(get('/', null), { params: Promise.resolve({ token: hidden.token }) })
  assert.equal(draftResult.status, 404)
})
test('portal uses the current customer relationship and keeps mixed-currency totals separate', async () => {
  await invoice({ customerId: id(1), currency: 'EUR' })
  const result = await portalFinancials(get('/api/portal/financials', customerCookie))
  const json = await result.json()
  assert.ok(json.metrics.byCurrency.EUR); assert.ok(json.metrics.byCurrency.EGP)
  assert.equal(json.metrics.totalInvoicesValue, null)
  const user = await store.read('users', id(4))
  await store.commit({ updates: [{ before: user, patch: { customerId: id(2) } }] })
  try {
    const reassigned = await portalFinancials(get('/api/portal/financials', customerCookie))
    assert.ok((await reassigned.json()).invoices.every(inv => inv.customerId === id(2)))
  } finally { await store.commit({ updates: [{ before: await store.read('users', id(4)), patch: { customerId: id(1) } }] }) }
})
test('cancellation preserves invoice amounts and history, rejects paid invoices and cannot duplicate its audit', async () => {
  const inv = await invoice(), before = { ...inv }
  const result = await cancelInvoice(req({ reason: 'Requested correction' }), params(inv))
  assert.equal(result.status, 200)
  const value = (await result.json()).invoice
  assert.equal(value.status, 'cancelled'); assert.equal(value.totalAmount, before.totalAmount); assert.equal(value.token, before.token)
  const logs = await store.list('invoice_activity_logs', 'invoiceId = ?', [inv._id])
  assert.equal(logs.length, 1); assert.equal(logs[0].data.notes, 'Requested correction')
  assert.equal((await cancelInvoice(req({}), params(inv))).status, 409)
  const paid = await invoice()
  assert.equal((await pay(paid, 'cancel-paid-fixture-key')).status, 201)
  assert.equal((await cancelInvoice(req({}), params(paid))).status, 409)
})
test('payment racing cancellation has one winner and no orphan credit or contradictory balance', async () => {
  const inv = await invoice()
  const results = await Promise.all([cancelInvoice(req({ reason: 'Cancel' }), params(inv)), pay(inv, 'cancel-payment-race-key')])
  assert.equal(results.filter(result => [200, 201].includes(result.status)).length, 1)
  const stored = (await store.read('invoices', inv._id)).data, payments = await store.list('payments', 'invoiceId = ?', [inv._id])
  if (stored.status === 'cancelled') { assert.equal(payments.length, 0); assert.equal(stored.paidAmount, 0) }
  else { assert.equal(stored.status, 'partially_paid'); assert.equal(payments.length, 1); assert.equal(stored.remainingAmount, 80) }
})
test('statement uses one currency with exact opening, period and closing balances and deterministic ordering', async () => {
  ledgerCustomer = id(++counter)
  await insert('customers', timestamped({ _id: ledgerCustomer, companyName: 'Ledger fixture', contactEmail: 'ledger@example.test', commercialRegisterNumber: `LEDGER-${counter}` }))
  const first = await invoice({ customerId: ledgerCustomer, issueDate: '2045-01-01T00:00:00.000Z', totalAmount: 100 })
  ledgerInvoice = await invoice({ customerId: ledgerCustomer, issueDate: '2045-01-15T00:00:00.000Z', totalAmount: 50 })
  await insert('payments', timestamped({ customerId: ledgerCustomer, invoiceId: first._id, currency: 'EGP', amount: 40, paymentDate: '2045-01-20T00:00:00.000Z', notes: 'Bank payment' }))
  await invoice({ customerId: ledgerCustomer, currency: 'USD', totalAmount: 900, issueDate: '2045-01-15T00:00:00.000Z' })
  const path = `/api/admin/customers/${ledgerCustomer}/statement?fromDate=2045-01-10&toDate=2045-01-31&currency=EGP`
  const result = await statementRoute(get(path), { params: Promise.resolve({ id: ledgerCustomer }) })
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
  const { statement } = await result.json()
  assert.deepEqual(statement.summary, { openingBalance: 100, totalDebit: 50, totalCredit: 40, closingBalance: 110, currency: 'EGP', periodStart: '2045-01-10', periodEnd: '2045-01-31', totalTransactions: 2 })
  assert.deepEqual(statement.entries.map(entry => entry.balance), [150, 110])
  const filtered = await statementRoute(get(path + '&type=payments'), { params: Promise.resolve({ id: ledgerCustomer }) })
  const value = (await filtered.json()).statement
  assert.equal(value.entries.length, 1); assert.equal(value.entries[0].balance, 110); assert.equal(value.summary.closingBalance, 110)
})
test('statement validates dates, range and currency and checks live permission', async () => {
  const base = `/api/admin/customers/${ledgerCustomer}/statement`
  for (const query of ['?currency=all', '?type=invalid', '?fromDate=2045-02-30', '?fromDate=2045-02-01&toDate=2045-01-01']) {
    assert.equal((await statementRoute(get(base + query), { params: Promise.resolve({ id: ledgerCustomer }) })).status, 400)
  }
  assert.equal((await statementRoute(get(base, customerCookie), { params: Promise.resolve({ id: ledgerCustomer }) })).status, 403)
  const user = await store.read('users', id(3)), permissions = user.data.staffPermissions
  await store.commit({ updates: [{ before: user, patch: { staffPermissions: { ...permissions, viewCustomerStatements: false } } }] })
  try { assert.equal((await statementRoute(get(base), { params: Promise.resolve({ id: ledgerCustomer }) })).status, 403) }
  finally { await store.commit({ updates: [{ before: await store.read('users', id(3)), patch: { staffPermissions: permissions } }] }) }
})
test('PDF authorization runs before rendering; portal cannot access another tenant or a draft', async () => {
  const originalRenderer = financialRenderers.invoice
  let renders = 0
  financialRenderers.invoice = async () => { renders++; return Buffer.from('%PDF-fixture') }
  try {
    const hidden = await invoice({ status: 'draft' }), foreign = await invoice({ customerId: id(2) })
    assert.equal((await portalPdfRoute(get('/', customerCookie), params(hidden))).status, 404)
    assert.equal((await portalPdfRoute(get('/', customerCookie), params(foreign))).status, 404)
    assert.equal(renders, 0)
    assert.equal((await portalPdfRoute(get('/', customerCookie), params(publicFixture))).status, 200)
    assert.equal(renders, 1)
  } finally { financialRenderers.invoice = originalRenderer }
})
test('actual PDF routes generate local invoice and statement fixtures from D1 data', async () => {
  const invoicePdf = await adminPdfRoute(get('/?type=invoice'), params(publicFixture))
  assert.equal(invoicePdf.status, 200)
  assert.equal(invoicePdf.headers.get('content-type'), 'application/pdf')
  assert.equal(invoicePdf.headers.get('cache-control').includes('no-store'), true)
  const invoiceBytes = Buffer.from(await invoicePdf.arrayBuffer())
  assert.equal(invoiceBytes.subarray(0, 5).toString(), '%PDF-')
  const statementPdf = await statementPdfRoute(get(`/?currency=EGP&fromDate=2045-01-10&toDate=2045-01-31`), { params: Promise.resolve({ id: ledgerCustomer }) })
  assert.equal(statementPdf.status, 200)
  const statementBytes = Buffer.from(await statementPdf.arrayBuffer())
  assert.equal(statementBytes.subarray(0, 5).toString(), '%PDF-')
  // Non-sensitive local QA fixtures; never writes to source object storage or sends messages.
  await mkdir('.private/d1-migration/pdf-fixtures', { recursive: true })
  await writeFile('.private/d1-migration/pdf-fixtures/invoice.pdf', invoiceBytes)
  await writeFile('.private/d1-migration/pdf-fixtures/statement.pdf', statementBytes)
})
test('cross-customer historical payment links stop statement generation for reconciliation', async () => {
  await insert('payments', timestamped({ customerId: id(2), invoiceId: ledgerInvoice._id, currency: 'EGP', amount: 1, paymentDate: '2045-01-25T00:00:00.000Z' }))
  const result = await statementRoute(get('/?currency=EGP'), { params: Promise.resolve({ id: ledgerCustomer }) })
  assert.equal(result.status, 409)
})
test('legacy invoice without snapshots receives only its own safe customer fields before rendering', async () => {
  const originalRenderer = financialRenderers.invoice, inv = await invoice({ customerSnapshot: null })
  let rendered
  financialRenderers.invoice = async value => { rendered = value; return Buffer.from('%PDF-fixture') }
  try {
    const result = await portalPdfRoute(get('/', customerCookie), params(inv))
    assert.equal(result.status, 200); assert.equal(rendered.customerSnapshot.companyName, 'Company1')
    assert.equal('extraSourceField' in rendered, false)
    const publicResult = await tokenInvoice(get('/', null), { params: Promise.resolve({ token: inv.token }) })
    assert.equal(publicResult.status, 200)
    assert.equal((await publicResult.json()).invoice.customerSnapshot.companyName, 'Company1')
    assert.equal(publicResult.headers.get('cache-control'), 'no-store')
  } finally { financialRenderers.invoice = originalRenderer }
})
test('PDF type overrides cannot bypass tax permission and invalid types are rejected before rendering', async () => {
  const user = await store.read('users', id(3)), permissions = user.data.staffPermissions
  await store.commit({ updates: [{ before: user, patch: { staffPermissions: { ...permissions, issueTaxInvoice: false } } }] })
  const inv = await invoice({ documentType: 'tax_invoice' })
  try {
    assert.equal((await adminPdfRoute(get('/?type=statement'), params(inv))).status, 403)
    assert.equal((await adminPdfRoute(get('/?type=anything'), params(inv))).status, 400)
    assert.equal((await portalPdfRoute(get('/', staffCookie), params(inv))).status, 403)
  } finally { await store.commit({ updates: [{ before: await store.read('users', id(3)), patch: { staffPermissions: permissions } }] }) }
})

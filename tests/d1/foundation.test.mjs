import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { D1UsersRepository } from '../../lib/db/repositories/users.ts'
import { D1InvoiceSequencesRepository } from '../../lib/db/repositories/invoice-sequences.ts'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'

let simulator
let db

before(async () => {
  simulator = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("D1 test"); } }',
    compatibilityDate: '2025-04-01',
    d1Databases: { DB: 'nilelink-d1-foundation-tests' },
    d1Persist: false,
  })
  db = await simulator.getD1Database('DB')
  const statements = await readD1MigrationStatements()
  await db.batch(statements.map(sql => db.prepare(sql)))
})

after(async () => { await simulator?.dispose() })

async function insert(table, document, id = document._id) {
  // Tables below are test constants, never request input.
  return db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).bind(id, JSON.stringify(document)).run()
}

test('all 19 application models have tables; integrity and foreign keys pass', async () => {
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE '_nilelink_%'").all()
  assert.equal(results.length, 19)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  assert.equal(Object.values(await db.prepare('PRAGMA quick_check').first())[0], 'ok')
})

test('preserves unknown fields, array order, UTC milliseconds and absent vs null', async () => {
  const document = {
    _id: 'preserved-customer', companyName: 'شركة النيل', extra: { enabled: false, nullable: null },
    services: ['second', 'first'], createdAt: '2020-01-02T03:04:05.678Z',
    amounts: [0.1, 1234567.89], categories: [{ _id: 'original-subdocument-id' }],
  }
  await insert('customers', document)
  const row = await db.prepare('SELECT data, companyName, createdAt FROM customers WHERE id = ?').bind(document._id).first()
  assert.deepEqual(JSON.parse(row.data), document)
  assert.equal(row.companyName, document.companyName)
  assert.equal(row.createdAt, document.createdAt)
  const types = await db.prepare("SELECT json_type(data, '$.extra.nullable') AS explicitNull, json_type(data, '$.missing') AS missing FROM customers WHERE id = ?").bind(document._id).first()
  assert.deepEqual(types, { explicitNull: 'null', missing: null })
})

test('rejects mismatched or absent document identity and does not silently overwrite', async () => {
  await assert.rejects(insert('customers', { _id: 'other-id' }, 'wrong-id'))
  await assert.rejects(insert('customers', {}, 'missing-id'))
  await assert.rejects(insert('customers', { _id: 'preserved-customer' }))
})

test('live relationships reject orphans and batch failure rolls back earlier writes', async () => {
  await assert.rejects(insert('payments', { _id: 'orphan', customerId: 'not-there', invoiceId: 'not-there' }))
  await assert.rejects(db.batch([
    db.prepare('INSERT INTO customers (id, data) VALUES (?, ?)').bind('rolled-back', '{"_id":"rolled-back"}'),
    db.prepare('INSERT INTO payments (id, data) VALUES (?, ?)').bind('invalid-batch-payment', '{"_id":"invalid-batch-payment","customerId":"not-there","invoiceId":"not-there"}'),
  ]))
  assert.equal(await db.prepare('SELECT id FROM customers WHERE id = ?').bind('rolled-back').first(), null)
})

test('supports circular customer/staff references within one deferred import batch', async () => {
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys = ON'),
    db.prepare('INSERT INTO customers (id, data) VALUES (?, ?)').bind('circular-customer', JSON.stringify({ _id: 'circular-customer', assignedStaffId: 'circular-staff' })),
    db.prepare('INSERT INTO users (id, data) VALUES (?, ?)').bind('circular-staff', JSON.stringify({ _id: 'circular-staff', email: 'circular@example.test', customerId: 'circular-customer' })),
  ])
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
})

test('login retains the exact password hash; ordinary user lookup omits it', async () => {
  const user = { _id: 'login-user', email: 'login@example.test', passwordHash: 'existing-hash-unchanged', role: 'staff', status: 'active' }
  await insert('users', user)
  const repository = new D1UsersRepository(db)
  const credentials = await repository.findForPasswordLogin(' LOGIN@example.test ')
  assert.equal(credentials.user.passwordHash, user.passwordHash)
  assert.equal(Object.hasOwn((await repository.findById(user._id)).user, 'passwordHash'), false)
  assert.equal((await repository.findForPasswordLogin("' OR 1=1 --")), null)
  assert.equal((await db.prepare('SELECT json_extract(data, \'$.passwordHash\') AS hash FROM users WHERE id = ?').bind(user._id).first()).hash, user.passwordHash)
})

test('sparse username uniqueness distinguishes missing fields from explicit null', async () => {
  await insert('users', { _id: 'missing-username-1', email: 'missing1@example.test' })
  await insert('users', { _id: 'missing-username-2', email: 'missing2@example.test' })
  await insert('users', { _id: 'null-username-1', email: 'null1@example.test', username: null })
  await assert.rejects(insert('users', { _id: 'null-username-2', email: 'null2@example.test', username: null }))
  await insert('users', { _id: 'named-username-1', email: 'named1@example.test', username: 'operator' })
  await assert.rejects(insert('users', { _id: 'named-username-2', email: 'named2@example.test', username: 'operator' }))
})

test('compound sparse audit index includes absent jobId when event is present', async () => {
  await insert('system_audit_logs', { _id: 'audit-no-job', event: 'BACKUP_REQUESTED' })
  await assert.rejects(insert('system_audit_logs', { _id: 'audit-null-job', event: 'BACKUP_REQUESTED', jobId: null }))
  await insert('system_audit_logs', { _id: 'audit-with-job', event: 'BACKUP_REQUESTED', jobId: 'job-1' })
  await insert('system_audit_logs', { _id: 'audit-with-job-other-event', event: 'BACKUP_COMPLETED', jobId: 'job-1' })
  await assert.rejects(insert('system_audit_logs', { _id: 'audit-duplicate-job-event', event: 'BACKUP_REQUESTED', jobId: 'job-1' }))
})

test('counter preserves historical data and allocates unique numbers concurrently', async () => {
  const historical = { _id: 'INV_2026', seq: 87, updatedAt: '2020-01-01T00:00:00.000Z', extra: 'keep' }
  await insert('invoice_sequences', historical)
  const repository = new D1InvoiceSequencesRepository(db)
  assert.equal(await repository.peek('INV_2026'), 88)
  const numbers = await Promise.all(Array.from({ length: 40 }, () => repository.next('INV_2026')))
  assert.deepEqual(numbers.sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 88))
  assert.equal(await repository.peek('INV_2026'), 128)
  const stored = await db.prepare('SELECT data, revision FROM invoice_sequences WHERE id = ?').bind('INV_2026').first()
  assert.equal(JSON.parse(stored.data).extra, 'keep')
  assert.equal(stored.revision, 40)
})

test('first allocation is race-safe and unsafe integer overflow does not modify data', async () => {
  const repository = new D1InvoiceSequencesRepository(db)
  const numbers = await Promise.all(Array.from({ length: 10 }, () => repository.next('INV_2027')))
  assert.deepEqual(numbers.sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => i + 1))
  const exhausted = { _id: 'MAX_2026', seq: Number.MAX_SAFE_INTEGER }
  await insert('invoice_sequences', exhausted)
  await assert.rejects(repository.peek('MAX_2026'))
  await assert.rejects(repository.next('MAX_2026'))
  assert.deepEqual(JSON.parse((await db.prepare('SELECT data FROM invoice_sequences WHERE id = ?').bind(exhausted._id).first()).data), exhausted)
})

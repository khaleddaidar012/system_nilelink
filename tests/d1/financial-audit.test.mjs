import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { BSON } from 'mongodb'
import { sha256 } from '../../scripts/d1/snapshot.mjs'
import { exactMinorUnits, auditSnapshotFinances } from '../../scripts/d1/financial-audit.mjs'

const directories = []
async function snapshot(collections) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-finance-audit-test-')); directories.push(directory)
  const manifest = { formatVersion: 1, status: 'complete', collections: [] }
  for (const [index, [name, documents]] of Object.entries(collections).entries()) {
    const content = documents.map(doc => { const bytes = BSON.serialize(doc); return JSON.stringify({ bson: bytes.toString('base64'), sha256: sha256(bytes) }) + '\n' }).join('')
    const file = `collection-${index}.jsonl`; await writeFile(path.join(directory, file), content)
    manifest.collections.push({ name, type: 'collection', file, count: documents.length, sha256: sha256(content) })
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest)); return directory
}
after(async () => { for (const directory of directories) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('nilelink-finance-audit-test-'))
  await rm(directory, { recursive: true, force: true })
} })
const invoice = (patch = {}) => ({ _id: 'invoice', invoiceNumber: 'INV-2026-000001', customerId: 'customer', currency: 'EGP', status: 'partially_paid', subtotal: 100, discount: 0, additionalCharges: 0, tax: 0, taxRate: 0, items: [{ total: 100 }], totalAmount: 100, paidAmount: 30, remainingAmount: 70, ...patch })
const payment = (patch = {}) => ({ _id: 'payment', invoiceId: 'invoice', customerId: 'customer', currency: 'EGP', amount: 30, ...patch })

test('audit money conversion never rounds, accepts exact exponent notation and rejects unsafe precision', () => {
  assert.equal(exactMinorUnits(0.1), 10n); assert.equal(exactMinorUnits(0.3), 30n); assert.equal(exactMinorUnits(1e3), 100000n)
  for (const value of [0.1 + 0.2, 1e-3, 0.001, 1e15, -1, -0, '1.00', null, NaN, Infinity]) assert.throws(() => exactMinorUnits(value))
})

test('audit matches recorded payments and components while keeping customers, currencies and statuses separate', async () => {
  const directory = await snapshot({ customers: [{ _id: 'customer' }, { _id: 'other' }], invoices: [invoice(), invoice({ _id: 'usd', invoiceNumber: 'INV-2026-000002', customerId: 'other', currency: 'USD', status: 'draft', paidAmount: 0, remainingAmount: 100 })], payments: [payment()], invoicesequences: [{ _id: 'INV_2026', seq: 2 }] })
  const before = await readFile(path.join(directory, 'collection-1.jsonl'))
  const result = await auditSnapshotFinances(directory)
  assert.equal(result.blockerCount, 0); assert.equal(result.issues.length, 0); assert.equal(result.groups.length, 2)
  assert.equal(result.groups.find(group => group.currency === 'EGP').remainingMinor, '7000')
  assert.equal(result.groups.find(group => group.currency === 'USD').remainingMinor, '10000')
  assert.equal(result.cutoverCertified, false); assert.equal(result.historicalValuesRewritten, false)
  assert.deepEqual(await readFile(path.join(directory, 'collection-1.jsonl')), before)
})

test('audit blocks inconsistent balances, wrong payment ownership, orphan payments and cancelled invoice credit', async () => {
  const directory = await snapshot({ customers: [{ _id: 'customer' }], invoices: [invoice({ status: 'cancelled', remainingAmount: 71 })], payments: [payment({ customerId: 'wrong', currency: 'USD' }), payment({ _id: 'orphan', invoiceId: 'missing', amount: 1 })] })
  const result = await auditSnapshotFinances(directory)
  for (const code of ['INVOICE_BALANCE_MISMATCH', 'PAYMENT_RELATIONSHIP_MISMATCH', 'PAYMENT_INVOICE_MISSING', 'PAYMENT_ON_UNPAYABLE_INVOICE', 'UNPAYABLE_INVOICE_HAS_CREDIT']) assert.ok(result.issues.some(issue => issue.code === code), code)
  assert.ok(result.blockerCount > 0)
})

test('audit exposes unsupported source precision without presenting a partial group total', async () => {
  const directory = await snapshot({ customers: [{ _id: 'customer' }], invoices: [invoice({ paidAmount: 0.001, remainingAmount: 99.999 })] })
  const result = await auditSnapshotFinances(directory)
  assert.ok(result.issues.some(issue => issue.code === 'UNSUPPORTED_AMOUNT'))
  assert.equal(result.groups[0].supported, false); assert.equal(result.groups[0].totalMinor, null)
})

test('audit detects duplicate numbers, line/component mismatch and stale counters without resetting them', async () => {
  const directory = await snapshot({ customers: [{ _id: 'customer' }], invoices: [invoice({ subtotal: 99, paidAmount: 0, remainingAmount: 100 }), invoice({ _id: 'duplicate', paidAmount: 0, remainingAmount: 100 })], invoicesequences: [{ _id: 'INV_2026', seq: 0 }] })
  const result = await auditSnapshotFinances(directory)
  for (const code of ['INVALID_OR_DUPLICATE_INVOICE_NUMBER', 'INVOICE_COMPONENTS_MISMATCH', 'LINE_TOTALS_DO_NOT_MATCH_SUBTOTAL', 'SEQUENCE_REQUIRES_MAXIMUM_RECONCILIATION']) assert.ok(result.issues.some(issue => issue.code === code), code)
  assert.equal(result.sequenceChecks[0].recordedCounter, '0')
})

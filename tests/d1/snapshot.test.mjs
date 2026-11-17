import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BSON } from 'mongodb'
import { collectionTables, sha256, decodeRecord, toApplicationValue, validateSnapshot } from '../../scripts/d1/snapshot.mjs'
import { rehearseSnapshot } from '../../scripts/d1/rehearse.mjs'

const directories = []
after(async () => {
  for (const directory of directories) {
    const resolved = path.resolve(directory)
    // Only remove directories this test created directly under the temp root.
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()))
    assert.ok(path.basename(resolved).startsWith('nilelink-d1-test-'))
    await rm(resolved, { recursive: true, force: true })
  }
})

function lineFor(document) {
  const bytes = BSON.serialize(document)
  return JSON.stringify({ bson: bytes.toString('base64'), sha256: sha256(bytes) })
}

async function snapshot(collections) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-d1-test-'))
  directories.push(directory)
  const manifest = { formatVersion: 1, status: 'complete', operatorAssertedWritesFrozen: false, collections: [] }
  for (const [index, [name, documents]] of Object.entries(collections).entries()) {
    const file = `collection-${index}.jsonl`
    const content = documents.map(doc => lineFor(doc) + '\n').join('')
    await writeFile(path.join(directory, file), content)
    manifest.collections.push({ name, type: 'collection', file, count: documents.length, sha256: sha256(content) })
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
  return { directory, manifest }
}

test('raw BSON export format retains original bytes; projection retains nested IDs and date precision', () => {
  const id = new BSON.ObjectId('0123456789abcdef01234567')
  const original = {
    _id: id, date: new Date('2020-01-02T03:04:05.678Z'),
    count: new BSON.Int32(5), price: new BSON.Double(0.1),
    list: [id, null, { _id: id, active: false }], nullable: null,
    passwordHash: 'fixture-hash-untouched', arabic: 'النيل',
  }
  const source = lineFor(original)
  const projected = decodeRecord(source)
  assert.equal(projected.id, id.toHexString())
  assert.equal(projected.document.date, original.date.toISOString())
  assert.equal(projected.document.passwordHash, original.passwordHash)
  assert.equal(projected.document.list[2]._id, id.toHexString())
  assert.equal(projected.document.count, 5)
  assert.equal(projected.document.price, 0.1)
  const recovered = BSON.deserialize(Buffer.from(JSON.parse(source).bson, 'base64'), { promoteValues: false })
  assert.ok(recovered.count instanceof BSON.Int32)
  assert.ok(recovered.price instanceof BSON.Double)
  assert.ok(recovered.date instanceof Date)
  assert.ok(recovered._id.equals(id))
})

test('unsupported BSON and lossy JSON numeric values stop conversion', () => {
  for (const value of [BSON.Long.fromString('9007199254740993'), BSON.Decimal128.fromString('1.234567890123456789'), new BSON.Binary(Buffer.from('file')), new BSON.BSONRegExp('test', 'i'), undefined, Infinity, NaN, -0]) {
    assert.throws(() => toApplicationValue({ _id: 'unsupported', value }))
  }
  assert.throws(() => decodeRecord(lineFor({ _id: BSON.Long.fromNumber(5) })))
  assert.throws(() => decodeRecord(lineFor({ _id: 'large', text: 'a'.repeat(1_500_001) })))
})

test('record digest rejects corrupt bytes', () => {
  const parsed = JSON.parse(lineFor({ _id: 'record' }))
  parsed.sha256 = '0'.repeat(64)
  assert.throws(() => decodeRecord(JSON.stringify(parsed)), /checksum/)
})

test('duplicate BSON keys cannot disappear silently during JavaScript decoding', () => {
  const first = BSON.serialize({ _id: 'duplicate-key', value: 1 })
  const second = BSON.serialize({ value: 2 })
  const combined = Buffer.concat([first.subarray(0, first.length - 1), second.subarray(4)])
  combined.writeInt32LE(combined.length, 0)
  assert.throws(() => decodeRecord(JSON.stringify({ bson: combined.toString('base64'), sha256: sha256(combined) })), /round-trip mismatch/)
})

test('unknown collections block migration even when empty', async () => {
  const { directory } = await snapshot({ extra_legacy_collection: [] })
  await assert.rejects(validateSnapshot(directory), /Unmapped source collection/)
})

test('rejects incomplete snapshots, path traversal and mismatched source counts', async () => {
  const { directory, manifest } = await snapshot({ customers: [{ _id: 'source' }] })
  manifest.status = 'incomplete'
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
  await assert.rejects(validateSnapshot(directory), /Incomplete/)
  manifest.status = 'complete'
  manifest.collections[0].file = '../outside.jsonl'
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
  await assert.rejects(validateSnapshot(directory), /Unsafe snapshot filename/)
  manifest.collections[0].file = 'collection-0.jsonl'
  manifest.collections[0].count = 2
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
  await assert.rejects(validateSnapshot(directory), /count mismatch/)
})

test('valid JSON edits still fail the collection digest', async () => {
  const { directory } = await snapshot({ customers: [{ _id: 'original' }] })
  await writeFile(path.join(directory, 'collection-0.jsonl'), lineFor({ _id: 'modified' }) + '\n')
  await assert.rejects(validateSnapshot(directory), /collection checksum/)
})

test('all 19 collections migrate locally and every record matches, including circular references and passwords', async () => {
  const collections = Object.fromEntries(Object.keys(collectionTables).map(name => [name, []]))
  collections.customers.push({ _id: 'customer', companyName: 'النيل', assignedStaffId: 'user', extra: { retained: true } })
  collections.users.push({ _id: 'user', email: 'fixture@example.test', passwordHash: 'fixture-hash', customerId: 'customer' })
  collections.roleconfigs.push({ _id: 'role', title: 'staff' })
  collections.systemsettings.push({ _id: 'settings', settingKey: 'global', documentCategories: [{ _id: 'nested', key: 'tax' }] })
  collections.serviceconfigs.push({ _id: 'config', serviceKey: 'sea_freight' })
  collections.pricingrules.push({ _id: 'pricing', serviceKey: 'sea_freight' })
  collections.customerrequests.push({ _id: 'request', customerId: 'customer', requestedBy: 'user', trackingNumber: 'TRACK-1', services: ['service'] })
  collections.requestservices.push({ _id: 'service', requestId: 'request', serviceKey: 'sea_freight' })
  collections.documents.push({ _id: 'document', customerId: 'customer', uploadedBy: 'user', storageKey: 'existing-key' })
  collections.documentactivitylogs.push({ _id: 'document-log', customerId: 'customer', documentId: 'document' })
  collections.quotes.push({ _id: 'quote', customerId: 'customer', requestId: 'request', quoteNumber: 'QUOTE-1' })
  collections.quoteitems.push({ _id: 'item', quoteId: 'quote', requestServiceId: 'service', auditTrail: [{ previousPrice: 1.01 }] })
  collections.invoices.push({ _id: 'invoice', customerId: 'customer', invoiceNumber: 'INV-2026-000087', token: 'fixture-public-token', relatedQuoteId: 'quote', relatedRequestId: 'request', totalAmount: 123.45, paidAmount: 23.45, remainingAmount: 100, status: 'partially_paid', customerSnapshot: { companyName: 'historical' } })
  collections.invoicesequences.push({ _id: 'INV_2026', seq: new BSON.Int32(87) })
  collections.invoiceactivitylogs.push({ _id: 'invoice-log', invoiceId: 'invoice', customerId: 'customer' })
  collections.payments.push({ _id: 'payment', invoiceId: 'invoice', customerId: 'customer', amount: 23.45 })
  collections.notifications.push({ _id: 'notification', readBy: ['user'], relatedInvoiceId: 'invoice' })
  collections.analyticsevents.push({ _id: 'analytics', type: 'page_view', ipHash: 'fixture' })
  collections.systemauditlogs.push({ _id: 'audit', event: 'BACKUP_CREATED', jobId: 'fixture-job' })
  const { directory } = await snapshot(collections)
  const before = await readFile(path.join(directory, 'collection-0.jsonl'), 'utf8')
  const report = await rehearseSnapshot(directory)
  assert.equal(report.collections, 19)
  assert.equal(report.verifiedRecords, 19)
  assert.equal(report.foreignKeys, 'ok')
  assert.equal(report.quickCheck, 'ok')
  assert.equal(report.cutoverCertified, false)
  assert.equal(await readFile(path.join(directory, 'collection-0.jsonl'), 'utf8'), before)
})

test('rehearsal blocks orphaned relationships rather than deleting their records', async () => {
  const { directory } = await snapshot({
    customers: [{ _id: 'customer' }],
    payments: [{ _id: 'orphan', customerId: 'customer', invoiceId: 'missing-invoice' }],
  })
  await assert.rejects(rehearseSnapshot(directory), /FOREIGN KEY/)
})

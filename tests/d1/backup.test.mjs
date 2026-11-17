import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { createLocalBackup, rehearseLocalBackup } from '../../scripts/d1/backup.mjs'

let instance, db, temporary, good
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'nilelink-d1-backup-test-'))
  instance = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'backup-fixture' }, d1Persist: false })
  db = await instance.getD1Database('DB')
  await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  const documents = {
    customers: { _id: 'customer', assignedStaffId: 'user', companyName: 'النيل', extra: [null, { id: 'retained' }] },
    users: { _id: 'user', customerId: 'customer', email: 'fixture@example.test', passwordHash: 'fixture-hash' },
    role_configs: { _id: 'role', title: 'staff' }, system_settings: { _id: 'settings', settingKey: 'global' },
    service_configs: { _id: 'config', serviceKey: 'sea' }, pricing_rules: { _id: 'rule' },
    customer_requests: { _id: 'request', customerId: 'customer', requestedBy: 'user', trackingNumber: 'TRACK-1' },
    request_services: { _id: 'service', requestId: 'request' }, documents: { _id: 'document', customerId: 'customer', storageKey: 'source-file-retained' },
    document_activity_logs: { _id: 'doc-log', documentId: 'document', customerId: 'customer' },
    quotes: { _id: 'quote', customerId: 'customer', requestId: 'request', quoteNumber: 'QUOTE-1' },
    quote_items: { _id: 'item', quoteId: 'quote', requestServiceId: 'service' },
    invoices: { _id: 'invoice', customerId: 'customer', invoiceNumber: 'INV-2035-000008', token: 'fixture-token', totalAmount: 123.45, remainingAmount: 100, paidAmount: 23.45 },
    invoice_sequences: { _id: 'INV_2035', seq: 8, sourceExtra: true }, invoice_activity_logs: { _id: 'invoice-log', invoiceId: 'invoice' },
    payments: { _id: 'payment', invoiceId: 'invoice', customerId: 'customer', amount: 23.45, d1IdempotencyKey: 'payment-key' },
    notifications: { _id: 'notification', readBy: ['user'] }, analytics_events: { _id: 'analytics' }, system_audit_logs: { _id: 'audit', event: 'BACKUP_CREATED' },
    _nilelink_delivery_jobs: { _id: 'delivery', requestKey: 'delivery-key', state: 'pending', payload: { invoice: { _id: 'invoice' } }, previewOnly: true },
    chat_conversations: { _id:'chat',kind:'direct',directKey:'first:second',lastSequence:1 },
    chat_members: { _id:'chat:user',conversationId:'chat',userId:'user',active:true,lastReadSequence:0 },
    chat_messages: { _id:'message',conversationId:'chat',senderId:'user',sequence:1,clientMessageId:'fixture-message-key',text:'رسالة محفوظة',sender:{id:'user',name:'Original sender'} },
  }
  const statements = [db.prepare('PRAGMA defer_foreign_keys = ON')]
  for (const [table, data] of Object.entries(documents)) statements.push(db.prepare(`INSERT INTO ${table} (id,data,revision) VALUES (?,?,?)`).bind(data._id, JSON.stringify(data), 17))
  statements.push(db.prepare("INSERT INTO _nilelink_workflow_sequences (id,seq) VALUES ('request-2035',42)"), db.prepare("INSERT INTO _nilelink_storage_pending (storageKey,ownerId,createdAt) VALUES ('uncertain-object','customer','2035-01-01T00:00:00.123Z')"))
  statements.push(db.prepare(`INSERT INTO shipment_records VALUES
    ('shipment','2026-11-02','BOOK-001','0046','Line',2,'40','INV-1','Broker','Shipper','Damietta','Hamburg','تمور','080410','user',3,'UCR-01','[]')`))
  await db.batch(statements)
})
after(async () => {
  await instance?.dispose()
  if (temporary) {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()))
    assert.ok(path.basename(temporary).startsWith('nilelink-d1-backup-test-'))
    await rm(temporary, { recursive: true, force: true })
  }
})
test('backs up shipments, pending jobs, file journal, counters and original revisions', async () => {
  good = await createLocalBackup(db, temporary)
  assert.equal(good.manifest.tables.length, 27); assert.equal(good.manifest.totalRecords, 26)
  const compressed = await readFile(path.join(good.directory, 'backup.json.gz')), source = JSON.parse(gunzipSync(compressed))
  const customer = source.tables.find(table => table.name === 'customers').rows[0]
  assert.equal(customer.revision, 17); assert.equal(JSON.parse(customer.data).assignedStaffId, 'user')
  assert.equal(source.tables.find(table => table.name === '_nilelink_delivery_jobs').rows.length, 1)
  assert.equal(source.tables.find(table => table.name === 'shipment_records').rows[0].number_46, '0046')
  assert.equal(source.tables.find(table => table.name === 'shipment_records').rows[0].ucr, 'UCR-01')
  const report = await rehearseLocalBackup(good.directory)
  assert.equal(report.verifiedTables, 27); assert.equal(report.verifiedRecords, 26); assert.equal(report.quickCheck, 'ok')
  assert.equal(report.objectFilesVerified, false); assert.equal(report.productionCertified, false)
  assert.equal((await db.prepare('SELECT revision FROM customers').first()).revision, 17)
})
async function editedBackup(mutator, recompute = false) {
  const created = await createLocalBackup(db, temporary)
  const file = path.join(created.directory, 'backup.json.gz'), manifestFile = path.join(created.directory, 'manifest.json')
  const backup = JSON.parse(gunzipSync(await readFile(file))), manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  mutator(backup, manifest)
  if (recompute) {
    for (const table of backup.tables) table.sha256 = sha(JSON.stringify(table.rows))
    manifest.tables = backup.tables.map(table => ({ name: table.name, records: table.rows.length, sha256: table.sha256 }))
  }
  const bytes = Buffer.from(JSON.stringify(backup)), compressed = gzipSync(bytes)
  await writeFile(file, compressed)
  if (recompute) Object.assign(manifest, { sha256: sha(compressed), logicalSha256: sha(bytes), compressedBytes: compressed.length, uncompressedBytes: bytes.length })
  await writeFile(manifestFile, JSON.stringify(manifest))
  return created.directory
}
test('rejects corrupted bytes and changed revisions before restoring', async () => {
  const directory = await editedBackup(backup => { backup.tables[0].rows[0].revision = 99 })
  await assert.rejects(rehearseLocalBackup(directory), /checksum mismatch/)
})
test('rejects incomplete manifests and changed migration version', async () => {
  const created = await createLocalBackup(db, temporary)
  await writeFile(path.join(created.directory, 'manifest.json'), '{}')
  await assert.rejects(rehearseLocalBackup(created.directory), /manifest/)
  const directory = await editedBackup((backup, manifest) => { manifest.migrationHash = 'wrong-version' }, true)
  await assert.rejects(rehearseLocalBackup(directory), /manifest/)
})
test('checks relational constraints even when an edited backup has recalculated checksums', async () => {
  const directory = await editedBackup(backup => {
    const row = backup.tables.find(table => table.name === 'payments').rows[0]
    row.data = JSON.stringify({ ...JSON.parse(row.data), invoiceId: 'missing-invoice' })
  }, true)
  await assert.rejects(rehearseLocalBackup(directory))
  assert.equal((await db.prepare('SELECT invoiceId FROM payments').first()).invoiceId, 'invoice')
})
test('does not execute arbitrary tables or column names supplied by a backup', async () => {
  const directory = await editedBackup(backup => { backup.tables[0].columns = ['id); DELETE FROM users;--'] }, true)
  await assert.rejects(rehearseLocalBackup(directory), /column mapping/)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM users').first()).n, 1)
})
test('unknown source schema blocks backup instead of silently omitting extra tables', async () => {
  await db.prepare('CREATE TABLE unknown_legacy_data (id TEXT PRIMARY KEY)').run()
  try { await assert.rejects(createLocalBackup(db, temporary), /schema/) }
  finally { await db.prepare('DROP TABLE unknown_legacy_data').run() }
})

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Miniflare } from 'miniflare'
import { createCloudBackup, digest, unseal, seal, base64ToBytes } from '../../scripts/d1/cloud-backup-core.mjs'
import { createBackupWorker } from '../../scripts/d1/cloud-backup-worker.mjs'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { previousShipmentSchema, previousShipmentTable, shipmentSchema } from '../../lib/shipments/schema.mjs'
import { reviewedBackupSchema } from '../../scripts/d1/backup-schema.mjs'
import { shipmentInvoiceIndexes } from '../../lib/shipments/accounting-schema.mjs'

let instance, db, spec
const key = '12'.repeat(32), content = new TextEncoder().encode('original file عربي')
before(async () => {
  instance = new Miniflare({ modules: true, script: 'export default { fetch(){return new Response("fixture")} }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'cloud-backup-test' } })
  db = await instance.getD1Database('DB')
  const migrations = await readD1MigrationStatements(); await db.batch(migrations.map(sql => db.prepare(sql)))
  const ddl = migrations.filter(sql => !previousShipmentSchema.includes(sql) && !sql.startsWith('ALTER TABLE shipment_records ')).concat(shipmentSchema)
  const tables = []
  for (const sql of ddl) {
    const name = /^CREATE TABLE ([a-z_]+)\s*\(/.exec(sql)?.[1]
    if (name) tables.push({ name, columns: (await db.prepare(`PRAGMA table_xinfo(${name})`).all()).results.filter(c => c.hidden === 0).map(c => c.name) })
  }
  await db.prepare('INSERT INTO customers(id,data,revision) VALUES(?,?,?)').bind('fixture', JSON.stringify({ _id: 'fixture', companyName: 'عربي', unknown: [null, { x: 'original' }] }), 7).run()
  spec = { scope: 'baseline-staging-only', ddl, tables, files: [{ key: 'original/file.pdf', size: content.length, sha256: await digest(content) }], omittedFiles: [{ reason: 'missing-demo-source' }], source: { database: 'fixture' } }
})
after(async () => { await instance?.dispose() })
test('reviewed request-invoice uniqueness remains compatible with the previous backup schema', () => {
  const normalize=sql=>sql.replace(/\s+/g,' ').trim()
  const previous={...spec,ddl:spec.ddl.filter(sql=>normalize(sql)!==normalize(shipmentInvoiceIndexes[1]))}
  assert.equal(reviewedBackupSchema(previous,spec.ddl).ddl.length,spec.ddl.length)
  assert.equal(reviewedBackupSchema(spec,previous.ddl).ddl.length,previous.ddl.length)
})
function bucket() {
  const objects = new Map(), versions = new Map(), metadata = new Map()
  return { objects, async get(key) { const value = objects.get(key); return value ? { size: value.length, etag: versions.get(key), json: async () => JSON.parse(new TextDecoder().decode(value)), arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) } : null },
    async head(key) { const bytes = objects.get(key); return bytes ? { size: bytes.length, customMetadata: metadata.get(key) } : null },
    async put(key, input, options = {}) { if (options.onlyIf?.etagMatches ? versions.get(key) !== options.onlyIf.etagMatches : options.onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) return null; const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input); objects.set(key, bytes); metadata.set(key, options.customMetadata); const etag = String(Number(versions.get(key) || 0) + 1); versions.set(key, etag); return { key, etag } } }
}
function env() { const source = bucket(); source.objects.set('original/file.pdf', content); return { DB: db, SOURCE_FILES: source, BACKUPS: bucket(), BACKUP_STAGE: 'isolated-staging', BACKUP_ENCRYPTION_KEY: key } }
test('encrypted cloud backup preserves exact JSON, revisions and file bytes, with final completion receipt', async () => {
  const previousSpec = {
    ...spec,
    ddl: spec.ddl.filter(sql => !shipmentSchema.includes(sql)).concat(previousShipmentSchema),
    tables: spec.tables.map(table => table.name === 'shipment_records' ? previousShipmentTable : table),
  }
  const e = env(), receipt = await createCloudBackup(e, previousSpec)
  assert.equal(receipt.tables, 27); assert.equal(receipt.records, 1); assert.equal(receipt.files, 1); assert.equal(receipt.omittedFiles, 1)
  const encrypted = e.BACKUPS.objects.get(receipt.objectKey)
  assert.equal(await digest(encrypted), receipt.sha256)
  const backup = JSON.parse(new TextDecoder().decode(await unseal(encrypted, key, receipt.objectKey)))
  assert.equal(backup.database.tables.find(t => t.name === 'customers').rows[0].revision, 7)
  assert.deepEqual(JSON.parse(backup.database.tables[0].rows[0].data).unknown, [null, { x: 'original' }])
  assert.deepEqual(base64ToBytes(backup.files[0].base64), content)
  assert.ok(e.BACKUPS.objects.has(`staging-backups/${receipt.id}.complete.json`))
})
test('missing or corrupted source files never create completion marker', async () => {
  for (const bad of [null, new Uint8Array(content.length)]) {
    const e = env(); if (bad) e.SOURCE_FILES.objects.set('original/file.pdf', bad); else e.SOURCE_FILES.objects.clear()
    await assert.rejects(createCloudBackup(e, spec)); assert.equal(e.BACKUPS.objects.size, 0)
  }
})
test('changed database schema fails before writing backup objects', async () => {
  const e = env(); await assert.rejects(createCloudBackup(e, { ...spec, ddl: [] })); assert.equal(e.BACKUPS.objects.size, 0)
})
test('database changes during file capture prevent a mixed completed backup', async () => {
  const e = env(); let calls = 0
  e.DB = { prepare: sql => db.prepare(sql), async batch(statements) {
    const results = await db.batch(statements)
    if (++calls === 2) results[1].results[0].revision++
    return results
  } }
  await assert.rejects(createCloudBackup(e, spec), /changed during/)
  assert.equal(e.BACKUPS.objects.size, 0)
})
test('missing encryption key and unreviewed production stage fail before backup writes', async () => {
  for (const patch of [{ BACKUP_ENCRYPTION_KEY: '' }, { BACKUP_STAGE: 'production' }]) {
    const e = { ...env(), ...patch }
    await assert.rejects(createCloudBackup(e, spec)); assert.equal(e.BACKUPS.objects.size, 0)
  }
})
test('encryption rejects wrong key, changed ciphertext and object-key substitution', async () => {
  const bytes = await seal(content, key, 'first')
  await assert.rejects(unseal(bytes, '34'.repeat(32), 'first'))
  await assert.rejects(unseal(bytes, key, 'other'))
  bytes[14] ^= 1; await assert.rejects(unseal(bytes, key, 'first'))
})
test('readback corruption does not publish completion marker', async () => {
  const e = env(), get = e.BACKUPS.get
  e.BACKUPS.get = async k => { const value = await get(k); if (value) value.arrayBuffer = async () => new Uint8Array(value.size).buffer; return value }
  await assert.rejects(createCloudBackup(e, spec)); assert.equal([...e.BACKUPS.objects.keys()].filter(k => k.endsWith('.complete.json')).length, 0)
})
test('backup Worker hides endpoints without valid trigger credential', async () => {
  const worker = createBackupWorker(spec), e = { ...env(), BACKUP_TRIGGER_KEY: 'ab'.repeat(32) }
  assert.equal((await worker.fetch(new Request('https://fixture/run'), e)).status, 404)
  assert.equal((await worker.fetch(new Request('https://fixture/run', { method: 'POST', headers: { authorization: 'Bearer wrong' } }), e)).status, 404)
})
test('scheduled handler records its trigger without accepting a caller supplied label', async () => {
  const e = env(), worker = createBackupWorker(spec)
  await worker.scheduled({}, e)
  const marker = [...e.BACKUPS.objects.entries()].find(([k]) => k.endsWith('.complete.json'))
  assert.equal(JSON.parse(new TextDecoder().decode(marker[1])).trigger, 'scheduled')
  await assert.rejects(createCloudBackup(e, spec, { trigger: 'invalid' }))
})
test('first-launch scheduled jobs persist success and failure status without ciphertext or credentials', async () => {
  const firstLaunch = { ...spec, scope: 'first-launch-snapshot-only', source: { accountId: 'f882b38e4571e0141cb6353f5a271af7', databaseId: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', bucketName: 'nilelink-production-files' } }
  for (const failed of [false, true]) {
    const e = { ...env(), BACKUP_STAGE: 'prelaunch' }, worker = createBackupWorker(firstLaunch)
    if (failed) { e.SOURCE_FILES.objects.clear(); await assert.rejects(worker.scheduled({}, e)) }
    else await worker.scheduled({}, e)
    const runs = [...e.BACKUPS.objects].filter(([key]) => key.startsWith('backup-runs/'))
    assert.equal(runs.length, 1)
    const record = JSON.parse(new TextDecoder().decode(runs[0][1]))
    assert.equal(record.state, failed ? 'failed' : 'completed')
    assert.equal(record.trigger, 'scheduled')
    assert.ok(!JSON.stringify(record).includes(e.BACKUP_ENCRYPTION_KEY))
    assert.equal([...e.BACKUPS.objects.keys()].filter(key => key.endsWith('.complete.json')).length, failed ? 0 : 1)
  }
})
const manualRequest = id => new Request('https://fixture/run', { method: 'POST', headers: { authorization: 'Bearer ' + 'ab'.repeat(32), 'idempotency-key': id, 'x-nilelink-actor': '1'.repeat(24) } })
test('concurrent manual requests and replay make exactly one completed backup', async () => {
  const e = { ...env(), BACKUP_TRIGGER_KEY: 'ab'.repeat(32) }, worker = createBackupWorker(spec), id = crypto.randomUUID()
  const responses = await Promise.all([worker.fetch(manualRequest(id), e), worker.fetch(manualRequest(id), e)])
  assert.ok(responses.some(r => r.status === 200)); assert.ok(responses.every(r => [200, 202].includes(r.status)))
  const replay = await worker.fetch(manualRequest(id), e)
  const replayBody = await replay.json()
  assert.equal(replay.status, 200); assert.equal(replayBody.state, 'completed')
  assert.equal([...e.BACKUPS.objects.keys()].filter(k => k.endsWith('.aesgcm')).length, 1)
  assert.equal((await worker.fetch(manualRequest(crypto.randomUUID()), e)).status, 429)
  e.BACKUPS.objects.delete(replayBody.receipt.objectKey)
  assert.equal((await worker.fetch(manualRequest(id), e)).status, 409)
  assert.equal([...e.BACKUPS.objects.keys()].filter(k => k.endsWith('.aesgcm')).length, 0)
})
test('uncertain jobs never run again with the same request ID', async () => {
  const e = { ...env(), BACKUP_TRIGGER_KEY: 'ab'.repeat(32) }, worker = createBackupWorker(spec), id = crypto.randomUUID()
  e.SOURCE_FILES.objects.clear()
  assert.equal((await worker.fetch(manualRequest(id), e)).status, 409)
  e.SOURCE_FILES.objects.set('original/file.pdf', content)
  assert.equal((await worker.fetch(manualRequest(id), e)).status, 409)
  assert.equal([...e.BACKUPS.objects.keys()].filter(k => k.endsWith('.aesgcm')).length, 0)
})

test('dynamic backups include a newly committed document and pending upload, and reject missing pending hashes', async () => {
  const id = 'dynamic-document', pendingKey = 'journal/pending.pdf', committedKey = 'new/document.pdf'
  const sha256 = await digest(content)
  await db.prepare('INSERT INTO documents(id,data) VALUES(?,?)').bind(id, JSON.stringify({ _id: id, customerId: 'fixture', storageKey: committedKey, fileHash: sha256, fileSize: content.length })).run()
  await db.prepare('INSERT INTO _nilelink_storage_pending(storageKey,ownerId,createdAt) VALUES(?,?,?)').bind(pendingKey, 'fixture', new Date().toISOString()).run()
  try {
    const e = { ...env(), BACKUP_STAGE: 'prelaunch' }
    e.SOURCE_FILES.objects.set('_nilelink_d1_preview/' + committedKey, content)
    e.SOURCE_FILES.objects.set('_nilelink_d1_preview/' + pendingKey, content)
    const dynamic = { ...spec, scope: 'first-launch-snapshot-only', inventoryMode: 'database-documents-and-pending-v1', source: { accountId: 'f882b38e4571e0141cb6353f5a271af7', databaseId: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', bucketName: 'nilelink-production-files' } }
    await assert.rejects(createCloudBackup(e, dynamic), /Source file unavailable/)
    assert.equal(e.BACKUPS.objects.size, 0)
    const get = e.SOURCE_FILES.get.bind(e.SOURCE_FILES)
    e.SOURCE_FILES.get = async key => { const result = await get(key); return result && { ...result, customMetadata: { sha256 } } }
    const receipt = await createCloudBackup(e, dynamic)
    assert.equal(receipt.records, 3)
    assert.equal(receipt.files, 2)
    const backup = JSON.parse(new TextDecoder().decode(await unseal(e.BACKUPS.objects.get(receipt.objectKey), key, receipt.objectKey)))
    assert.equal(backup.inventoryMode, 'database-documents-and-pending-v1')
    assert.deepEqual(backup.files.map(file => file.key), ['_nilelink_d1_preview/' + pendingKey, '_nilelink_d1_preview/' + committedKey])
    assert.ok(backup.files.every(file => file.sha256 === sha256))
    assert.equal(backup.database.tables.find(table => table.name === '_nilelink_storage_pending').rows.length, 1)
  } finally {
    await db.prepare('DELETE FROM _nilelink_storage_pending WHERE storageKey=?').bind(pendingKey).run()
    await db.prepare('DELETE FROM documents WHERE id=?').bind(id).run()
  }
})

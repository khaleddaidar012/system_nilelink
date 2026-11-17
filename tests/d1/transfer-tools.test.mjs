import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { BSON } from 'mongodb'
import { DatabaseSync } from 'node:sqlite'
import { Miniflare } from 'miniflare'
import { sha256 } from '../../scripts/d1/snapshot.mjs'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { buildStagingImport, importStagingSnapshot, compareImportedTables } from '../../scripts/d1/import-staging.mjs'
import { prepareStagingTarget } from '../../scripts/d1/staging-target.mjs'
import { verifySourceFileBytes } from '../../scripts/d1/verify-source-r2.mjs'
import { backupAvailableSourceFiles } from '../../scripts/d1/file-backup.mjs'
import { rehearseSqlExport, restrictRestoreDatabase } from '../../scripts/d1/rehearse-sql-export.mjs'

const directories = []
async function temporary() { const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-transfer-test-')); directories.push(directory); return directory }
async function snapshot(collections) {
  const directory = await temporary(), manifest = { formatVersion: 1, status: 'complete', collections: [] }
  for (const [index, [name, documents]] of Object.entries(collections).entries()) {
    const content = documents.map(doc => { const bytes = BSON.serialize(doc); return JSON.stringify({ bson: bytes.toString('base64'), sha256: sha256(bytes) }) + '\n' }).join('')
    const file = `collection-${index}.jsonl`; await writeFile(path.join(directory, file), content)
    manifest.collections.push({ name, type: 'collection', file, count: documents.length, sha256: sha256(content) })
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest)); return directory
}
after(async () => { for (const directory of directories) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('nilelink-transfer-test-'))
  await rm(directory, { recursive: true, force: true })
} })

test('remote import SQL retains quotes, Arabic, nulls, passwords and circular staff/customer references exactly', async () => {
  const directory = await snapshot({ customers: [{ _id: 'customer', assignedStaffId: 'staff', companyName: 'النيل', extra: { nullable: null } }], users: [{ _id: 'staff', customerId: 'customer', email: 'fixture@example.test', passwordHash: 'unchanged-hash' }], systemsettings: [{ _id: "settings'); DROP TABLE users; --", settingKey: 'fixture', nested: { text: "O'Neil\u0000عربي" } }] })
  const plan = await buildStagingImport(directory)
  const simulator = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2025-04-01', d1Databases: { DB: 'import-sql-fixture' }, d1Persist: false })
  try {
    const db = await simulator.getD1Database('DB'); await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
    await db.exec(plan.sql)
    for (const [table, records] of plan.records) for (const record of records) {
      const actual = await db.prepare(`SELECT data,revision FROM ${table} WHERE id=?`).bind(record.id).first()
      assert.equal(actual.data, record.data); assert.equal(actual.revision, 0)
    }
    assert.equal(plan.sourceRecords, 3)
    const tables = (await readD1MigrationStatements()).map(sql => /^CREATE TABLE ([a-z_][a-z0-9_]*)\s*\(/.exec(sql)?.[1]).filter(Boolean)
    assert.equal(tables.length, 23)
    assert.equal(await compareImportedTables(tables, plan.records, async sql => [await db.prepare(sql).all()]), 3)
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0)
  } finally { await simulator.dispose() }
})

test('staging preparation creates private SQL only unless execution is explicitly requested', async () => {
  const snapshotDirectory = await snapshot({ customers: [{ _id: 'customer' }] }), parent = await temporary()
  const target = { accountId: '1234567890abcdef1234567890abcdef', databaseId: '12345678-1234-1234-1234-1234567890ab', databaseName: 'nilelink-d1-staging-fixture' }
  const targetDirectory = await prepareStagingTarget(target, parent)
  const result = await importStagingSnapshot(snapshotDirectory, targetDirectory, target.accountId)
  assert.equal(result.report.status, 'prepared-only'); assert.equal(result.report.cutoverCertified, false)
  assert.match(await readFile(path.join(result.directory, 'source.sql'), 'utf8'), /INSERT INTO customers/)
  await assert.rejects(importStagingSnapshot(snapshotDirectory, targetDirectory, 'abcdef1234567890abcdef1234567890'), /account mismatch/)
  await assert.rejects(importStagingSnapshot(snapshotDirectory, targetDirectory, target.accountId, { verifyOnlyDirectory: result.directory }), /incomplete or changed/)
})

test('oversized inline SQL records stop instead of truncating source documents', async () => {
  const directory = await snapshot({ systemsettings: [{ _id: 'large', payload: 'x'.repeat(50_000) }] })
  await assert.rejects(buildStagingImport(directory), /parameterized remote import strategy/)
})

test('read-only source object verification distinguishes missing, corrupt and unreadable bytes', async () => {
  const directory = await snapshot({ documents: ['valid', 'missing', 'corrupt', 'failed'].map(_id => ({ _id, storageKey: _id, fileSize: 7, fileHash: sha256('fixture') })) })
  const report = await verifySourceFileBytes(directory, { readObject: async key => {
    if (key === 'missing') return null
    if (key === 'failed') throw new Error('fixture failure')
    return { size: 7, body: (async function* () { yield Buffer.from(key === 'corrupt' ? 'changed' : 'fixture') })() }
  } })
  assert.equal(report.verifiedWithHistoricalHash, 1)
  for (const code of ['SOURCE_R2_OBJECT_MISSING', 'SOURCE_R2_BYTES_MISMATCH', 'SOURCE_R2_READ_FAILED']) assert.ok(report.issues.some(issue => issue.code === code), code)
  assert.equal(report.sourceModified, false); assert.equal(report.destinationModified, false)
})

test('available file backup and isolated restore preserve bytes and disclose every omitted object', async () => {
  const source = await temporary(); await mkdir(path.join(source, 'clients')); await writeFile(path.join(source, 'clients/original'), 'fixture')
  const directory = await snapshot({ documents: [{ _id: 'present', storageKey: 'clients/original', fileSize: 7, fileHash: sha256('fixture') }, { _id: 'missing', storageKey: 'clients/missing', fileSize: 7, fileHash: sha256('fixture') }] })
  const result = await backupAvailableSourceFiles(directory, source)
  assert.equal(result.report.copiedObjects, 1); assert.equal(result.report.restoreDrill.verifiedObjects, 1)
  assert.equal(result.report.allSourceFilesBackedUp, false); assert.equal(result.report.omittedObjects.length, 1)
  assert.equal(await readFile(path.join(result.directory, 'objects/clients/original'), 'utf8'), 'fixture')
  assert.equal(await readFile(path.join(result.report.restoreDrill.path, 'clients/original'), 'utf8'), 'fixture')
  assert.equal(await readFile(path.join(source, 'clients/original'), 'utf8'), 'fixture')
})

test('SQL export restores in memory and matches every source row; changed exports fail checksums', async () => {
  const directory = await snapshot({ customers: [{ _id: 'customer', assignedStaffId: 'staff' }], users: [{ _id: 'staff', customerId: 'customer', email: 'fixture@example.test', passwordHash: 'original' }] })
  const plan = await buildStagingImport(directory), exported = await temporary()
  const sql = (await readD1MigrationStatements()).map(statement => statement + ';').join('\n') + '\n' + plan.sql
  await writeFile(path.join(exported, 'staging.sql'), sql)
  await writeFile(path.join(exported, 'manifest.json'), JSON.stringify({ scope: 'remote-d1-staging-sql-export', bytes: Buffer.byteLength(sql), sha256: sha256(sql) }))
  const report = await rehearseSqlExport(exported, directory)
  assert.equal(report.verifiedRecords, 2); assert.equal(report.verifiedTables, 23); assert.equal(report.remoteRestoreExecuted, false)
  await writeFile(path.join(exported, 'staging.sql'), sql + '\nSELECT 1;')
  await assert.rejects(rehearseSqlExport(exported, directory), /checksum mismatch/)
})

test('restore authorizer rejects attached files, extensions, views and unsafe pragmas', () => {
  const db = new DatabaseSync(':memory:', { allowExtension: false, defensive: true })
  try {
    restrictRestoreDatabase(db)
    for (const sql of ["ATTACH DATABASE ':memory:' AS unexpected", 'PRAGMA writable_schema=ON', 'CREATE VIEW unexpected AS SELECT 1', "SELECT load_extension('nonexistent')"]) assert.throws(() => db.exec(sql), /authoriz|prohibit/i)
    db.exec('CREATE TABLE safe(id TEXT PRIMARY KEY,data TEXT CHECK(json_valid(data)))')
    db.prepare('INSERT INTO safe VALUES(?,?)').run('fixture', '{"keep":true}')
    assert.equal(db.prepare('SELECT count(*) AS n FROM safe').get().n, 1)
  } finally { db.close() }
})

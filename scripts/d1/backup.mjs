import { createHash, randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from './migrations.mjs'
import { shipmentTable } from '../../lib/shipments/schema.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const maxBytes = 64 * 1024 * 1024, maxRecords = 5000
const hash = value => createHash('sha256').update(value).digest('hex')
const internal = {
  _nilelink_write_guards: ['id', 'valid'], _nilelink_workflow_sequences: ['id', 'seq'],
  _nilelink_storage_pending: ['storageKey', 'ownerId', 'createdAt'],
  [shipmentTable.name]: shipmentTable.columns,
}
const excludedInfrastructure = ['_cf_KV', '_cf_METADATA', 'd1_migrations']
const schemaSql = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV', '_cf_METADATA', 'd1_migrations') AND tbl_name NOT IN ('_cf_KV', '_cf_METADATA', 'd1_migrations') ORDER BY type, name"
function simulator(persist = false) {
  return new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local backup lab") } }',
    compatibilityDate: '2025-04-01', d1Databases: { DB: '00000000-0000-0000-0000-000000000000' }, d1Persist: persist })
}
async function specification() {
  const migrations = await readD1MigrationStatements()
  const tables = migrations.map(sql => /^CREATE TABLE ([a-z_][a-z0-9_]*)\s*\(/.exec(sql)?.[1]).filter(Boolean)
  if (tables.length !== 27 || new Set(tables).size !== tables.length || !['chat_conversations','chat_members','chat_messages',shipmentTable.name].every(name=>tables.includes(name))) throw new Error('Backup table mapping requires review')
  const columns = Object.fromEntries(tables.map(table => [table, internal[table] || ['id', 'data', 'revision']]))
  const instance = simulator()
  try {
    const db = await instance.getD1Database('DB')
    await db.batch(migrations.map(sql => db.prepare(sql)))
    const schema = (await db.prepare(schemaSql).all()).results
    const schemaTables = schema.filter(row => row.type === 'table').map(row => row.name).sort()
    if (JSON.stringify(schemaTables) !== JSON.stringify([...tables].sort())) throw new Error('Unmapped backup table in migration schema')
    const metadata = await db.batch(tables.map(table => db.prepare(`PRAGMA table_xinfo(${table})`)))
    for (const [index, table] of tables.entries()) {
      if (JSON.stringify(metadata[index].results.filter(row => row.hidden === 0).map(row => row.name)) !== JSON.stringify(columns[table])) throw new Error('Backup column mapping requires review')
    }
    return { migrations, tables, columns, schema, migrationHash: hash(JSON.stringify(migrations)) }
  } finally { await instance.dispose() }
}
function checkRows(table, rows, columns) {
  if (!Array.isArray(rows)) throw new Error('Invalid backup rows')
  for (const row of rows) {
    if (!row || typeof row !== 'object' || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...columns].sort())) throw new Error('Backup columns require review')
    for (const value of Object.values(row)) if (value !== null && typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) throw new Error('Unsafe backup value')
    if (columns.includes('data')) {
      if (typeof row.data !== 'string' || typeof row.id !== 'string' || !Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error('Invalid document row')
      const document = JSON.parse(row.data)
      if (!document || Array.isArray(document) || document._id !== row.id) throw new Error('Backup document identity mismatch')
    }
  }
}
async function capture(db, spec) {
  // Schema and every table are read in one transaction-backed batch, with no source writes.
  const results = await db.batch([db.prepare(schemaSql), ...spec.tables.map(table => db.prepare(`SELECT ${spec.columns[table].join(', ')} FROM ${table} ORDER BY ${spec.columns[table][0]}`)), db.prepare('PRAGMA foreign_key_check'), db.prepare('PRAGMA quick_check')])
  if (JSON.stringify(results[0].results) !== JSON.stringify(spec.schema)) throw new Error('Unknown or changed source schema; backup stopped')
  if (results.at(-2).results.length || Object.values(results.at(-1).results[0] || {})[0] !== 'ok') throw new Error('Source integrity check failed')
  const tables = spec.tables.map((name, index) => {
    const rows = results[index + 1].results
    checkRows(name, rows, spec.columns[name])
    return { name, columns: spec.columns[name], rows, sha256: hash(JSON.stringify(rows)) }
  })
  const totalRecords = tables.reduce((sum, table) => sum + table.rows.length, 0)
  if (totalRecords > maxRecords) throw new Error('Local backup drill record limit exceeded')
  return { format: 'nilelink-local-d1-backup', version: 1, migrationHash: spec.migrationHash, tables, totalRecords }
}

/** Consistent logical snapshot; complete only once manifest.json has been written last. */
export async function createLocalBackup(db, parent = path.join(root, '.private/d1-migration/d1-backups')) {
  const spec = await specification(), backup = await capture(db, spec)
  const bytes = Buffer.from(JSON.stringify(backup))
  if (bytes.length > maxBytes) throw new Error('Local backup drill byte limit exceeded')
  const compressed = gzipSync(bytes), directory = path.join(path.resolve(parent), randomUUID())
  if (compressed.length > maxBytes) throw new Error('Local backup drill compressed byte limit exceeded')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(path.join(directory, 'backup.json.gz'), compressed, { flag: 'wx', mode: 0o600 })
  const manifest = { format: backup.format, version: 1, createdAt: new Date().toISOString(), migrationHash: spec.migrationHash,
    compressedBytes: compressed.length, uncompressedBytes: bytes.length, sha256: hash(compressed), logicalSha256: hash(bytes),
    totalRecords: backup.totalRecords, tables: backup.tables.map(table => ({ name: table.name, records: table.rows.length, sha256: table.sha256 })),
    scope: 'local-database-only', objectFilesIncluded: false, excludedInfrastructure, productionCertified: false }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return { directory, manifest }
}

async function readVerified(directory, spec) {
  const absolute = await realpath(directory)
  for (const name of ['manifest.json', 'backup.json.gz']) {
    const stat = await lstat(path.join(absolute, name))
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error('Unsafe or oversized backup file')
  }
  const manifest = JSON.parse(await readFile(path.join(absolute, 'manifest.json'), 'utf8'))
  const compressed = await readFile(path.join(absolute, 'backup.json.gz'))
  if (manifest.format !== 'nilelink-local-d1-backup' || manifest.version !== 1 || manifest.sha256 !== hash(compressed) || manifest.compressedBytes !== compressed.length || manifest.migrationHash !== spec.migrationHash || JSON.stringify(manifest.excludedInfrastructure) !== JSON.stringify(excludedInfrastructure)) throw new Error('Backup manifest or checksum mismatch')
  const bytes = gunzipSync(compressed, { maxOutputLength: maxBytes })
  if (manifest.uncompressedBytes !== bytes.length || manifest.logicalSha256 !== hash(bytes)) throw new Error('Logical backup checksum mismatch')
  const backup = JSON.parse(bytes.toString('utf8'))
  if (backup.format !== manifest.format || backup.version !== 1 || backup.migrationHash !== spec.migrationHash || !Array.isArray(backup.tables) || JSON.stringify(backup.tables.map(table => table.name)) !== JSON.stringify(spec.tables)) throw new Error('Backup schema mapping mismatch')
  let records = 0
  for (const table of backup.tables) {
    if (JSON.stringify(table.columns) !== JSON.stringify(spec.columns[table.name])) throw new Error('Backup column mapping mismatch')
    checkRows(table.name, table.rows, table.columns)
    if (table.sha256 !== hash(JSON.stringify(table.rows))) throw new Error('Backup table checksum mismatch')
    records += table.rows.length
  }
  if (records > maxRecords || records !== manifest.totalRecords || records !== backup.totalRecords ||
    JSON.stringify(manifest.tables) !== JSON.stringify(backup.tables.map(table => ({ name: table.name, records: table.rows.length, sha256: table.sha256 })))) throw new Error('Backup counts mismatch')
  return { backup, manifest }
}

/** Restores only into a newly-created, non-persistent simulator. Never accepts a target binding. */
export async function rehearseLocalBackup(directory) {
  const spec = await specification(), { backup, manifest } = await readVerified(directory, spec), instance = simulator()
  try {
    const db = await instance.getD1Database('DB')
    await db.batch(spec.migrations.map(sql => db.prepare(sql)))
    const statements = [db.prepare('PRAGMA defer_foreign_keys = ON')]
    for (const table of backup.tables) for (const row of table.rows) statements.push(db.prepare(`INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')})`).bind(...table.columns.map(column => row[column])))
    await db.batch(statements)
    const restored = await capture(db, spec)
    if (JSON.stringify(restored) !== JSON.stringify(backup)) throw new Error('Restored rows, revisions or counters differ')
    const final = await readVerified(directory, spec)
    if (JSON.stringify(final.manifest) !== JSON.stringify(manifest)) throw new Error('Backup changed during restore drill')
    return { scope: 'disposable-local-d1-only', verifiedTables: spec.tables.length, verifiedRecords: backup.totalRecords,
      comparison: 'exact-stored-json-columns-and-revisions', foreignKeys: 'ok', quickCheck: 'ok', objectFilesVerified: false, productionCertified: false }
  } finally { await instance.dispose() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, directory] = process.argv.slice(2)
  if (command === 'create-local' && !directory) {
    const instance = simulator(path.join(root, '.wrangler/state/v3/d1'))
    try {
      const created = await createLocalBackup(await instance.getD1Database('DB'))
      console.log(JSON.stringify({ directory: created.directory, tables: created.manifest.tables.length, records: created.manifest.totalRecords, scope: created.manifest.scope, productionCertified: false }, null, 2))
    }
    catch { console.error('Local D1 backup failed; no source application records changed. Check schema, migration state, limits and integrity privately.'); process.exitCode = 1 }
    finally { await instance.dispose() }
  } else if (command === 'rehearse' && directory && process.argv.length === 4) {
    try { console.log(JSON.stringify(await rehearseLocalBackup(path.resolve(directory)), null, 2)) }
    catch { console.error('Isolated D1 restore drill failed. No existing database was restored or changed.'); process.exitCode = 1 }
  } else console.log('node scripts/d1/backup.mjs create-local\nnode scripts/d1/backup.mjs rehearse <backup-directory>\nLocal lab only; 5000 records / 64 MiB uncompressed. No remote database, no in-place restore, no file backup.')
}

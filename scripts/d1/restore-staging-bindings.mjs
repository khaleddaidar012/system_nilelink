import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { verifyStagingTarget } from './staging-target.mjs'
import { restrictRestoreDatabase, rehearseSqlExport } from './rehearse-sql-export.mjs'
import { readD1MigrationStatements } from './migrations.mjs'
import { buildStagingImport, compareImportedTables } from './import-staging.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const targetDir = path.join(root, '.private/d1-migration/targets/b41eaa32-cabc-4167-9b58-9d0ea44eeb15')
const exportDir = path.join(root, '.private/d1-migration/targets/9cbd1b6d-6006-4935-a08f-e3f76da748dd/exports/48a9ff07-833d-4b0b-87af-51135845a540')
const snapshot = path.join(root, '.private/d1-migration/bce417f4-a391-49d0-aadf-1f34d789a529')
const directory = path.join(targetDir, 'restore-bindings')
const account = 'f882b38e4571e0141cb6353f5a271af7'
const databaseId = 'aa05ecd8-b430-40fa-a328-c86be744f20d'
const normalize = sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')
const state = { scope: 'remote-d1-restore-from-verified-sql-via-bounded-binding-batches', accountId: account, databaseId,
  sourceModified: false, productionCertified: false, objectFilesIncluded: false, status: 'preflight', committedBatches: 0 }
let proxy, local
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
try {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('Explicit --execute required')
  for (const key of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(key)) throw new Error('Authentication overrides are forbidden')
  const target = await verifyStagingTarget(targetDir, account)
  if (target.databaseId !== databaseId || target.databaseName !== 'nilelink-d1-staging-restore-20261019') throw new Error('Wrong restore target')
  await mkdir(directory, { mode: 0o700 }); await save()
  const rehearsal = await rehearseSqlExport(exportDir, snapshot)
  const bytes = await readFile(path.join(exportDir, 'staging.sql'))
  if (createHash('sha256').update(bytes).digest('hex') !== rehearsal.exportSha256) throw new Error('Export changed')
  const plan = await buildStagingImport(snapshot)
  local = new DatabaseSync(':memory:', { allowExtension: false, defensive: true })
  restrictRestoreDatabase(local); local.exec('PRAGMA foreign_keys=OFF'); local.exec(bytes.toString('utf8')); local.exec('PRAGMA foreign_keys=ON')
  const ddl = (await readD1MigrationStatements()).filter(sql => /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) /.test(sql))
  const tables = ddl.map(sql => /^CREATE TABLE ([a-z_][a-z0-9_]*)\s*\(/.exec(sql)?.[1]).filter(Boolean)
  if (tables.length !== 23) throw new Error('Unexpected schema')
  // Read the backup itself, never substitute freshly queried application data.
  const expectedSchema = local.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations')").all()
  if (JSON.stringify(expectedSchema.map(r => normalize(r.sql)).sort()) !== JSON.stringify(ddl.map(normalize).sort())) throw new Error('Backup schema changed')
  const config = JSON.parse(await readFile(path.join(targetDir, 'wrangler.json'), 'utf8'))
  config.d1_databases[0] = { ...config.d1_databases[0], remote: true, preview_database_id: databaseId }
  const configPath = path.join(directory, 'wrangler.json')
  await writeFile(configPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 })
  proxy = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
  const db = proxy.env.DB
  const query = async sql => { const result = await db.prepare(sql).all(); if (!result.success) throw new Error('Read failed'); return [result] }
  const existing = (await query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA')"))[0].results
  if (existing.length) throw new Error('Destination is not empty; no resume permitted')
  Object.assign(state, { status: 'writes-started-do-not-retry', exportSha256: rehearsal.exportSha256, sourceManifestSha256: plan.sourceManifestSha256 }); await save()
  async function batch(statements) {
    const results = await db.batch(statements)
    if (results.length !== statements.length || results.some(r => !r.success)) throw new Error('Incomplete batch; do not retry')
    state.committedBatches++; await save()
  }
  // All referenced tables exist before the first row is inserted.
  await batch(ddl.map(sql => db.prepare(sql)))
  const restores = []
  for (const table of tables) {
    const columns = local.prepare(`PRAGMA table_xinfo(${table})`).all().filter(c => c.hidden === 0).map(c => c.name)
    if (!columns.every(c => /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(c))) throw new Error('Invalid column')
    const rows = local.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all()
    let statements = []
    for (const row of rows) {
      if (table === 'customers' && Object.hasOwn(JSON.parse(row.data), 'assignedStaffId')) {
        restores.push(db.prepare('UPDATE customers SET data=? WHERE id=?').bind(row.data, row.id))
        const temporary = JSON.parse(row.data); delete temporary.assignedStaffId; row.data = JSON.stringify(temporary)
      }
      statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...columns.map(c => row[c])))
      if (statements.length === 30) { await batch(statements); statements = [] }
    }
    if (statements.length) await batch(statements)
    if (table === 'users' && restores.length) { await batch(restores); restores.length = 0 }
    console.log(JSON.stringify({ restoredTable: table, records: rows.length }))
  }
  // Preserve migration history separately from application rows.
  const history = local.prepare('SELECT id,name,applied_at FROM d1_migrations ORDER BY id').all()
  const historyDdl = local.prepare("SELECT sql FROM sqlite_schema WHERE name='d1_migrations'").get().sql
  await batch([db.prepare(historyDdl), ...history.map(row => db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').bind(row.id, row.name, row.applied_at))])
  state.status = 'restored-awaiting-comparison'; await save()
  const verifiedRecords = await compareImportedTables(tables, plan.records, query)
  for (const table of tables) {
    const columns = local.prepare(`PRAGMA table_xinfo(${table})`).all().filter(c => c.hidden === 0).map(c => c.name)
    const sql = `SELECT ${columns.join(',')} FROM ${table} ORDER BY ${columns[0]}`
    if (JSON.stringify((await query(sql))[0].results) !== JSON.stringify(local.prepare(sql).all())) throw new Error('Backup row comparison failed')
  }
  const historyActual = (await query('SELECT id,name,applied_at FROM d1_migrations ORDER BY id'))[0].results
  if (JSON.stringify(historyActual) !== JSON.stringify(history)) throw new Error('Migration history mismatch')
  const schema = (await query("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations')"))[0].results
  if (JSON.stringify(schema.map(r => normalize(r.sql)).sort()) !== JSON.stringify(ddl.map(normalize).sort())) throw new Error('Restored schema mismatch')
  const quick = (await query('PRAGMA quick_check'))[0].results, fk = (await query('PRAGMA foreign_key_check'))[0].results
  if (Object.values(quick[0] || {})[0] !== 'ok' || fk.length) throw new Error('Integrity failure')
  if (!(await readFile(path.join(exportDir, 'staging.sql'))).equals(bytes) || (await buildStagingImport(snapshot)).sourceManifestSha256 !== plan.sourceManifestSha256) throw new Error('Source changed')
  Object.assign(state, { status: 'all-restored-records-compared', verifiedRecords, verifiedTables: tables.length, schemaObjects: ddl.length,
    migrationHistoryRecords: history.length, exactBackupWritableColumnsCompared: true, quickCheck: 'ok', foreignKeyViolations: 0, checkedAt: new Date().toISOString() }); await save()
  console.log(JSON.stringify(state))
} catch (error) {
  // Error text is private: it could contain SQL or source values.
  await writeFile(path.join(directory, 'private-error.txt'), String(error.stack || error), { mode: 0o600 }).catch(() => {})
  console.error('Binding restore stopped; inspect private report. Never retry writes to a partially restored database.'); process.exitCode = 1
} finally { local?.close(); await proxy?.dispose() }

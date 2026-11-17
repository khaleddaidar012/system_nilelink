import { DatabaseSync, constants } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildStagingImport, compareImportedTables } from './import-staging.mjs'
import { readD1MigrationStatements } from './migrations.mjs'

/** SQL is confined to a new in-memory database with no extensions or attached files. */
export function restrictRestoreDatabase(db) {
  if (typeof db.setAuthorizer !== 'function') throw new Error('SQLite authorizer support is required')
  const denied = new Set(['SQLITE_ATTACH', 'SQLITE_DETACH', 'SQLITE_CREATE_VTABLE', 'SQLITE_CREATE_TRIGGER', 'SQLITE_CREATE_TEMP_TRIGGER', 'SQLITE_CREATE_VIEW', 'SQLITE_CREATE_TEMP_VIEW'].map(name => constants[name]))
  const safePragmas = new Set(['foreign_keys', 'defer_foreign_keys', 'foreign_key_check', 'quick_check', 'integrity_check', 'table_info', 'table_xinfo', 'foreign_key_list'])
  const safeFunctions = new Set(['json_valid', 'json_type', 'json_extract', 'json_array_length', 'json', 'json_quote', 'lower', 'coalesce', 'length', 'typeof', 'substr', 'like', 'glob', 'count'])
  db.setAuthorizer((action, first, second, database) => {
    if (denied.has(action) || (database && database !== 'main')) return constants.SQLITE_DENY
    if (action === constants.SQLITE_PRAGMA && (!safePragmas.has(String(first).toLowerCase()) || (second != null && !['foreign_keys', 'defer_foreign_keys', 'table_info', 'table_xinfo', 'foreign_key_list'].includes(String(first).toLowerCase())))) return constants.SQLITE_DENY
    if (action === constants.SQLITE_FUNCTION && !safeFunctions.has(String(second || first).toLowerCase())) return constants.SQLITE_DENY
    return constants.SQLITE_OK
  })
}

export async function rehearseSqlExport(exportDirectory, snapshotDirectory) {
  const directory = await realpath(exportDirectory), manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
  const bytes = await readFile(path.join(directory, 'staging.sql'))
  if (manifest.scope !== 'remote-d1-staging-sql-export' || manifest.bytes !== bytes.length || bytes.length > 64 * 1024 * 1024 || manifest.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Export checksum mismatch')
  const plan = await buildStagingImport(snapshotDirectory), db = new DatabaseSync(':memory:', { allowExtension: false, defensive: true })
  try {
    restrictRestoreDatabase(db)
    // SQLite dump order can insert a child before its parent's CREATE TABLE.
    // Disable FK enforcement only in this fresh in-memory database, then
    // re-enable it and check every relationship before reporting success.
    db.exec('PRAGMA foreign_keys=OFF')
    db.exec(bytes.toString('utf8'))
    db.exec('PRAGMA foreign_keys=ON')
    const ddl = (await readD1MigrationStatements()).filter(sql => /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) /.test(sql))
    const tables = ddl.map(sql => /^CREATE TABLE ([a-z_][a-z0-9_]*)\s*\(/.exec(sql)?.[1]).filter(Boolean)
    const normalize = sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')
    const schema = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') ORDER BY type,name").all()
    if (tables.length !== 23 || JSON.stringify(schema.map(row => normalize(row.sql)).sort()) !== JSON.stringify(ddl.map(normalize).sort())) throw new Error('Export schema mismatch')
    const verifiedRecords = await compareImportedTables(tables, plan.records, async sql => [{ results: db.prepare(sql).all(), success: true }])
    if (db.prepare('PRAGMA foreign_key_check').all().length || Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw new Error('Restored database integrity failed')
    const final = await readFile(path.join(directory, 'staging.sql'))
    if (!final.equals(bytes)) throw new Error('Export changed during restore rehearsal')
    const report = { formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'disposable-local-sqlite-restore-of-remote-d1-export', sourceManifestSha256: plan.sourceManifestSha256,
      exportSha256: manifest.sha256, verifiedTables: tables.length, verifiedRecords, comparison: 'exact-source-application-json-and-zero-revisions', foreignKeys: 'ok', quickCheck: 'ok',
      fileAttachmentsIncluded: false, remoteRestoreExecuted: false, sourceModified: false, productionCertified: false }
    await writeFile(path.join(directory, 'local-restore-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    return report
  } finally { db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv.includes('--help')) { console.log('node scripts/d1/rehearse-sql-export.mjs <private-export-directory> <source-snapshot-directory>'); process.exitCode = process.argv.includes('--help') ? 0 : 1 }
  else try { console.log(JSON.stringify(await rehearseSqlExport(process.argv[2], process.argv[3]))) }
  catch { console.error('Isolated SQL export restore stopped. No existing local or remote database was modified.'); process.exitCode = 1 }
}

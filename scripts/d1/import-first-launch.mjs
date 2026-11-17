import { randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { buildStagingImport, compareImportedTables } from './import-staging.mjs'
import { readD1MigrationStatements } from './migrations.mjs'
import { auditSnapshotFinances } from './financial-audit.mjs'

// One reviewed, empty destination. Never accepts arbitrary database IDs,
// performs a retry, clears a database, or activates the application.
const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('Use --execute for the reviewed first-launch destination')
for (const name of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(name)) throw new Error('Authentication overrides forbidden')
const snapshot = path.join(root, '.private/d1-migration/79642c29-36d5-4475-9c1b-353dbd581ae1')
const comparison = JSON.parse(await readFile(path.join(snapshot, 'source-comparison.json'), 'utf8'))
if (comparison.status !== 'identical-exports' || comparison.productionCertified !== false) throw new Error('Reviewed source comparison required')
const plan = await buildStagingImport(snapshot), finance = await auditSnapshotFinances(snapshot)
if (finance.blockerCount || finance.sourceManifestSha256 !== plan.sourceManifestSha256) throw new Error('Financial reconciliation failed')
const ddl = await readD1MigrationStatements()
const tables = ddl.map(sql => /^CREATE TABLE ([a-z_]+)\s*\(/.exec(sql)?.[1]).filter(Boolean)
if (tables.length !== 23 || plan.sourceRecords !== 2072) throw new Error('Source or schema changed; review required')
const directory = path.join(root, '.private/d1-migration/first-launch/imports', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const config = { name: 'nilelink-first-launch-import', account_id: 'f882b38e4571e0141cb6353f5a271af7', compatibility_date: '2025-04-01',
  d1_databases: [{ binding: 'DB', database_name: 'nilelink-production', database_id: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', remote: true }] }
const configPath = path.join(directory, 'wrangler.json')
await writeFile(configPath, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
const report = { scope: 'first-launch-data-import-no-application-deployment', status: 'prepared', sourceModified: false,
  productionCertified: false, applicationActivated: false, accountId: config.account_id,
  databaseId: config.d1_databases[0].database_id, databaseName: 'nilelink-production', sourceSnapshot: snapshot,
  sourceManifestSha256: plan.sourceManifestSha256,
  schemaSha256: createHash('sha256').update(JSON.stringify(ddl)).digest('hex'), completedBatches: 0 }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
let proxy
try {
  await save()
  proxy = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
  const db = proxy.env.DB
  const existing = await db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA')").all()
  if (!existing.success || existing.results.length) throw new Error('Destination is not empty; automatic retry forbidden')
  report.emptyDestinationVerified = true
  report.status = 'writing-no-automatic-retry'; await save()
  for (let offset = 0; offset < ddl.length; offset += 20) {
    const result = await db.batch(ddl.slice(offset, offset + 20).map(sql => db.prepare(sql)))
    if (result.some(row => !row.success)) throw new Error('Schema batch failed')
    report.completedBatches++; await save()
  }
  const restores = []
  for (const [table, records] of plan.records) {
    const statements = records.map(record => {
      let data = record.data
      if (table === 'customers') {
        const temporary = JSON.parse(data)
        if (Object.hasOwn(temporary, 'assignedStaffId')) {
          delete temporary.assignedStaffId; data = JSON.stringify(temporary)
          restores.push(db.prepare('UPDATE customers SET data=? WHERE id=?').bind(record.data, record.id))
        }
      }
      return db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)`).bind(record.id, data)
    })
    for (let offset = 0; offset < statements.length; offset += 30) {
      const result = await db.batch(statements.slice(offset, offset + 30))
      if (result.some(row => !row.success)) throw new Error('Data batch failed')
      report.completedBatches++; await save()
    }
  }
  for (let offset = 0; offset < restores.length; offset += 30) {
    const result = await db.batch(restores.slice(offset, offset + 30))
    if (result.some(row => !row.success)) throw new Error('Reference restoration failed')
    report.completedBatches++; await save()
  }
  report.status = 'written-awaiting-comparison'; await save()
  const fresh = await buildStagingImport(snapshot)
  if (fresh.sourceManifestSha256 !== plan.sourceManifestSha256) throw new Error('Source snapshot changed')
  const verifiedRecords = await compareImportedTables(tables, plan.records, async sql => [await db.prepare(sql).all()])
  const checks = await db.batch([db.prepare('PRAGMA foreign_key_check'), db.prepare('PRAGMA quick_check')])
  if (checks.some(row => !row.success) || checks[0].results.length || Object.values(checks[1].results[0] || {})[0] !== 'ok') throw new Error('Integrity validation failed')
  const schema = await db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA')").all()
  const normalized = items => items.map(sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')).sort()
  if (!schema.success || JSON.stringify(normalized(schema.results.map(row => row.sql))) !== JSON.stringify(normalized(ddl))) throw new Error('Schema differs')
  Object.assign(report, { status: 'all-first-launch-records-compared', verifiedRecords, verifiedTables: tables.length,
    verifiedSchemaObjects: ddl.length, foreignKeys: 'ok', quickCheck: 'ok', completedAt: new Date().toISOString() })
  await save(); console.log(JSON.stringify({ directory, ...report }))
} catch {
  report.status = 'stopped-review-required-no-automatic-retry'; await save()
  console.error(JSON.stringify({ directory, status: report.status, sourceModified: false }))
  process.exitCode = 1
} finally { if (proxy) await proxy.dispose() }

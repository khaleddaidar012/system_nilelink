import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStagingImport } from './import-staging.mjs'
import { readD1MigrationStatements } from './migrations.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const verifyOnly = process.argv.length === 3 && process.argv[2] === '--verify-only'
if (!verifyOnly && (process.argv.length !== 3 || process.argv[2] !== '--execute')) throw new Error('Use --execute or --verify-only for reviewed first-launch reconciliation')
for (const name of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(name)) throw new Error('Authentication overrides forbidden')
const target = path.join(root, '.private/d1-migration/first-launch/imports/52da8221-c761-4844-9154-28b048b52bc7')
const configPath = path.join(target, 'wrangler.json'), config = JSON.parse(await readFile(configPath, 'utf8'))
if (config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.d1_databases.length !== 1 || config.d1_databases[0].database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb') throw new Error('Unreviewed destination')
const source = path.join(root, '.private/d1-migration/79642c29-36d5-4475-9c1b-353dbd581ae1')
const plan = await buildStagingImport(source), prior = JSON.parse(await readFile(path.join(target, 'report.json'), 'utf8'))
if (prior.sourceManifestSha256 !== plan.sourceManifestSha256 || prior.status !== 'stopped-review-required-no-automatic-retry') throw new Error('Stopped import receipt does not match')
const directory = path.join(root, '.private/d1-migration/first-launch/reconciliation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'first-launch-inspected-missing-records-only', verificationOnly: verifyOnly, status: 'inspecting', sourceModified: false, productionCertified: false }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
function run(args) {
  const child = spawnSync(process.execPath, ['--use-system-ca', path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--remote', '--json', '--config', configPath, '--env-file', path.join(root, '.private/d1-migration/first-launch/empty.env'), ...args], { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 180000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  if (child.status !== 0) {
    writeFileSync(path.join(directory, 'private-cli-error.log'), String(child.stderr || '') + '\n' + String(child.stdout || ''), { mode: 0o600 })
    throw new Error('Cloudflare request failed; no automatic retry')
  }
  // Wrangler bulk imports emit progress text even with --json. Exit zero is
  // followed by an independent full readback; it is never the success proof.
  if (args.includes('--file')) return []
  const result = JSON.parse(child.stdout)
  if (!Array.isArray(result) || result.some(row => row.success !== true)) throw new Error('Incomplete Cloudflare response')
  return result
}
const literal = value => `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
try {
  await save()
  const ddl = await readD1MigrationStatements(), tables = ddl.map(sql => /^CREATE TABLE ([a-z_]+)\s*\(/.exec(sql)?.[1]).filter(Boolean)
  const normalize = items => items.map(sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')).sort()
  const schema = run(['--command', "SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations')"])[0].results
  if (JSON.stringify(normalize(schema.map(row => row.sql))) !== JSON.stringify(normalize(ddl))) throw new Error('Schema mismatch')
  const readRows = () => {
    const rows = []
    const sourceTables = tables.filter(table => plan.records.has(table))
    // Keep compound SELECTs below D1's limit, independently of table count.
    for (let offset = 0; offset < sourceTables.length; offset += 5) {
      const query = sourceTables.slice(offset, offset + 5).map(table => `SELECT '${table}' AS source_table,id,data,revision FROM ${table}`).join(' UNION ALL ')
      rows.push(...run(['--command', query])[0].results)
    }
    return rows
  }
  const internal = tables.filter(table => !plan.records.has(table))
  const internalCounts = run(['--command', internal.map(table => `SELECT COUNT(*) AS n FROM ${table}`).join(';')])
  if (internalCounts.length !== internal.length || internalCounts.some(result => result.results.length !== 1 || result.results[0].n !== 0)) throw new Error('Internal tables are not empty')
  const actual = readRows()
  const expected = new Map([...plan.records].flatMap(([table, records]) => records.map(record => [`${table}:${record.id}`, { table, ...record }])))
  const seen = new Set(), updates = [], inserts = []
  for (const row of actual) {
    const key = `${row.source_table}:${row.id}`, record = expected.get(key)
    if (!record || seen.has(key) || row.revision !== 0) throw new Error('Unexpected destination record; review required')
    seen.add(key)
    if (record.data !== row.data) {
      const temporary = JSON.parse(record.data)
      if (record.table !== 'customers' || !Object.hasOwn(temporary, 'assignedStaffId')) throw new Error('Destination differs')
      delete temporary.assignedStaffId
      if (JSON.stringify(temporary) !== row.data) throw new Error('Destination differs from documented intermediate state')
      updates.push(`UPDATE customers SET data=${literal(record.data)} WHERE id=${literal(record.id)} AND data=${literal(row.data)} AND revision=0`)
    }
  }
  for (const [key, record] of expected) if (!seen.has(key)) {
    if (record.table === 'customers' || record.table === 'users') throw new Error('Unexpected missing dependency; review required')
    inserts.push(`INSERT INTO ${record.table}(id,data) VALUES(${literal(record.id)},${literal(record.data)})`)
  }
  Object.assign(report, { inspectedRecords: actual.length, missingRecords: inserts.length, intermediateCustomers: updates.length, status: 'inspected-before-write' }); await save()
  if (verifyOnly && (inserts.length || updates.length)) throw new Error('Verification found missing or intermediate records; no writes permitted')
  const sql = [...inserts, ...updates].join(';\n') + ';\n'
  if (inserts.length || updates.length) {
    const sqlFile = path.join(directory, 'missing-only.sql')
    await writeFile(sqlFile, sql, { flag: 'wx', mode: 0o600 })
    report.status = 'writing-inspected-differences'; await save()
    run(['--file', sqlFile, '--yes'])
  }
  const final = readRows()
  if (final.length !== expected.size || new Set(final.map(row => `${row.source_table}:${row.id}`)).size !== expected.size || final.some(row => row.revision !== 0 || expected.get(`${row.source_table}:${row.id}`)?.data !== row.data)) throw new Error('Final exact comparison failed')
  const checks = run(['--command', 'PRAGMA foreign_key_check; PRAGMA quick_check;'])
  if (checks.length !== 2 || checks[0].results.length || Object.values(checks[1].results[0] || {})[0] !== 'ok') throw new Error('Integrity failed')
  Object.assign(report, { status: 'all-first-launch-records-compared', verifiedRecords: final.length, verifiedTables: tables.length, verifiedSchemaObjects: ddl.length, foreignKeys: 'ok', quickCheck: 'ok', completedAt: new Date().toISOString() })
  await save(); console.log(JSON.stringify({ directory, ...report }))
} catch (error) {
  report.status = 'stopped-review-required'
  report.failureReason = error.message
  await save(); console.error(JSON.stringify({ directory, status: report.status, reason: report.failureReason })); process.exitCode = 1
}

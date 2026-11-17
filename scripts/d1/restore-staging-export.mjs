import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rehearseSqlExport } from './rehearse-sql-export.mjs'
import { verifyStagingTarget } from './staging-target.mjs'
import { buildStagingImport, compareImportedTables } from './import-staging.mjs'
import { readD1MigrationStatements } from './migrations.mjs'
import { orderSqlExport } from './order-sql-export.mjs'

// Deliberately pinned disposable database. Never restore over an existing target.
const root = fileURLToPath(new URL('../../', import.meta.url))
const account = 'f882b38e4571e0141cb6353f5a271af7'
const targetDir = path.join(root, '.private/d1-migration/targets/b41eaa32-cabc-4167-9b58-9d0ea44eeb15')
const exportDir = path.join(root, '.private/d1-migration/targets/9cbd1b6d-6006-4935-a08f-e3f76da748dd/exports/48a9ff07-833d-4b0b-87af-51135845a540')
const snapshot = path.join(root, '.private/d1-migration/bce417f4-a391-49d0-aadf-1f34d789a529')
const directory = path.join(targetDir, 'restore-ordered-verified-empty')
const normalize = sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')
const state = { scope: 'isolated-remote-d1-sql-export-restore', accountId: account,
  databaseId: 'aa05ecd8-b430-40fa-a328-c86be744f20d', sourceModified: false,
  objectFilesIncluded: false, productionCertified: false, status: 'preflight' }
async function run(args) {
  const target = await verifyStagingTarget(targetDir, account)
  if (target.databaseId !== state.databaseId || target.databaseName !== 'nilelink-d1-staging-restore-20261019') throw new Error('Wrong restore destination')
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  for (const key of Object.keys(env)) if (/^(CLOUDFLARE_|CF_)/.test(key)) delete env[key]
  const child = spawn(process.execPath, ['--use-system-ca', path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'DB', '--remote', '--json', '--config', path.join(targetDir, 'wrangler.json'),
    '--env-file', path.join(targetDir, 'empty.env'), ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', diagnostic = '', overflow = false
  child.stdout.on('data', chunk => { output += chunk; if (output.length > 16 * 1024 * 1024) { overflow = true; child.kill() } })
  child.stderr.on('data', chunk => { if (diagnostic.length < 1024 * 1024) diagnostic += chunk })
  const timer = setTimeout(() => child.kill(), 180000)
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    if (code !== 0 || overflow) {
      await writeFile(path.join(directory, 'private-cli-diagnostic.txt'), output + '\n' + diagnostic)
      throw new Error('Restore CLI failed; do not retry writes')
    }
    return JSON.parse(output.trim())
  } finally { clearTimeout(timer) }
}
async function query(sql) {
  const results = await run(['--command', sql])
  if (!Array.isArray(results) || results.some(item => item.success !== true)) throw new Error('Incomplete query')
  return results
}
try {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('Explicit --execute required')
  // Exclusive directory is also a durable no-retry latch, even after uncertainty.
  await mkdir(directory, { mode: 0o700 })
  const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(state, null, 2) + '\n')
  await save()
  const local = await rehearseSqlExport(exportDir, snapshot)
  const plan = await buildStagingImport(snapshot)
  const sqlFile = path.join(exportDir, 'staging.sql')
  const bytes = await readFile(sqlFile)
  if (createHash('sha256').update(bytes).digest('hex') !== local.exportSha256) throw new Error('Export changed')
  const orderedSql = orderSqlExport(bytes)
  const orderedFile = path.join(directory, 'restore.sql')
  await writeFile(orderedFile, orderedSql, { flag: 'wx', mode: 0o600 })
  const existing = (await query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA')"))[0].results
  if (existing.length) throw new Error('Destination is not empty')
  Object.assign(state, { status: 'write-started-do-not-retry', exportSha256: local.exportSha256, orderedSqlSha256: createHash('sha256').update(orderedSql).digest('hex'), sourceManifestSha256: plan.sourceManifestSha256 })
  await save()
  await run(['--file', orderedFile, '--yes'])
  state.status = 'restored-awaiting-comparison'; await save()
  const ddl = (await readD1MigrationStatements()).filter(sql => /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) /.test(sql))
  const schema = (await query("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations')"))[0].results
  if (JSON.stringify(schema.map(row => normalize(row.sql)).sort()) !== JSON.stringify(ddl.map(normalize).sort())) throw new Error('Schema mismatch')
  const tables = ddl.map(sql => /^CREATE TABLE ([a-z_][a-z0-9_]*)\s*\(/.exec(sql)?.[1]).filter(Boolean)
  if (tables.length !== 23) throw new Error('Unexpected schema')
  const verifiedRecords = await compareImportedTables(tables, plan.records, query, p => console.log(JSON.stringify({ comparedTable: p.table, records: p.records })))
  const integrity = await query('PRAGMA quick_check; PRAGMA foreign_key_check')
  if (integrity.length !== 2 || Object.values(integrity[0].results[0] || {})[0] !== 'ok' || integrity[1].results.length) throw new Error('Integrity check failed')
  if (!(await readFile(sqlFile)).equals(bytes) || (await buildStagingImport(snapshot)).sourceManifestSha256 !== plan.sourceManifestSha256) throw new Error('Source changed')
  Object.assign(state, { status: 'all-restored-records-compared', verifiedRecords, verifiedTables: tables.length, schemaObjects: ddl.length,
    quickCheck: 'ok', foreignKeyViolations: 0, checkedAt: new Date().toISOString() })
  await save()
  console.log(JSON.stringify(state))
} catch {
  console.error('Restore drill stopped. Inspect private receipt; never retry this destination blindly. Source was not modified.')
  process.exitCode = 1
}

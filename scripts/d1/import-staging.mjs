import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collectionTables, validateSnapshot, readRecords } from './snapshot.mjs'
import { readD1MigrationStatements } from './migrations.mjs'
import { verifyStagingTarget } from './staging-target.mjs'
import { auditSnapshotFinances } from './financial-audit.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const normalize = sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')
const literal = value => `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`

/** Data is encoded as UTF-8 hex; table/column identifiers come only from the mapping. */
export async function buildStagingImport(directory) {
  const { manifest, files } = await validateSnapshot(directory), records = new Map(), statements = [], restores = []
  let bytes = 0, count = 0
  for (const table of Object.values(collectionTables)) {
    const entry = files.find(file => file.table === table), rows = []
    if (entry) for await (const record of readRecords(entry.file)) {
      bytes += Buffer.byteLength(record.data); count++
      if (count > 5000 || bytes > 64 * 1024 * 1024) throw new Error('Staging import exceeds laboratory limits')
      rows.push({ id: record.id, data: record.data })
      let data = record.data
      if (table === 'customers' && Object.hasOwn(record.document, 'assignedStaffId')) {
        const temporary = { ...record.document }; delete temporary.assignedStaffId
        data = JSON.stringify(temporary)
        restores.push(`UPDATE customers SET data=${literal(record.data)} WHERE id=${literal(record.id)}`)
      }
      statements.push(`INSERT INTO ${table} (id,data) VALUES (${literal(record.id)},${literal(data)})`)
    }
    records.set(table, rows)
  }
  statements.push(...restores)
  if (statements.some(statement => Buffer.byteLength(statement) > 95_000)) throw new Error('A source record requires a parameterized remote import strategy')
  const sql = statements.map(statement => statement + ';').join('\n') + '\n'
  if (Buffer.byteLength(sql) > 64 * 1024 * 1024) throw new Error('Staging SQL exceeds laboratory limits')
  const final = await validateSnapshot(directory)
  if (JSON.stringify(final.manifest) !== JSON.stringify(manifest)) throw new Error('Source manifest changed during import planning')
  return { sql, records, sourceManifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), sourceRecords: count }
}

/** No automatic write retry. A failed/uncertain import requires investigation or a fresh target. */
export async function compareImportedTables(tables, records, query, onProgress = () => {}) {
  let verified = 0
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Unexpected import table')
    const expected = records.get(table)
    if (!expected) {
      const result = await query(`SELECT count(*) AS n FROM ${table}`)
      if (result.length !== 1 || result[0].results.length !== 1 || result[0].results[0].n !== 0) throw new Error('Internal migration table is not empty')
      onProgress({ table, records: 0 }); continue
    }
    const rows = (await query(`SELECT id,data,revision FROM ${table} ORDER BY id`))[0].results
    if (rows.length !== expected.length) throw new Error('Remote count differs from source')
    const actual = new Map(rows.map(row => [row.id, row]))
    for (const record of expected) {
      const row = actual.get(record.id)
      if (!row || row.data !== record.data || row.revision !== 0) throw new Error('Remote record differs from original application JSON')
      verified++
    }
    onProgress({ table, records: rows.length })
  }
  return verified
}

export async function importStagingSnapshot(snapshot, targetDirectory, accountId, { execute = false, verifyOnlyDirectory } = {}) {
  const target = await verifyStagingTarget(targetDirectory, accountId), plan = await buildStagingImport(snapshot)
  const finance = await auditSnapshotFinances(snapshot)
  if (finance.blockerCount || finance.sourceManifestSha256 !== plan.sourceManifestSha256) throw new Error('Source financial reconciliation requires review')
  if (execute && verifyOnlyDirectory) throw new Error('Verification cannot execute import writes')
  const directory = verifyOnlyDirectory || path.join(targetDirectory, 'imports', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const sqlFile = path.resolve(directory, 'source.sql')
  let state = { formatVersion: 1, scope: 'remote-staging-data-only', accountId, databaseId: target.databaseId, databaseName: target.databaseName,
    sourceManifestSha256: plan.sourceManifestSha256, sourceRecords: plan.sourceRecords, sqlSha256: createHash('sha256').update(plan.sql).digest('hex'),
    status: 'prepared-only', sourceModified: false, filesCopied: false, workerDeployed: false, cutoverCertified: false }
  if (verifyOnlyDirectory) {
    const previous = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'))
    for (const key of ['formatVersion', 'scope', 'accountId', 'databaseId', 'databaseName', 'sourceManifestSha256', 'sourceRecords', 'sqlSha256']) if (previous[key] !== state[key]) throw new Error('Verification receipt does not match source and selected target')
    if (!['written-awaiting-exact-comparison', 'all-records-compared'].includes(previous.status) || await readFile(sqlFile, 'utf8') !== plan.sql) throw new Error('Import write receipt is incomplete or changed')
    state = previous
  } else await writeFile(sqlFile, plan.sql, { flag: 'wx', mode: 0o600 })
  const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  await save()
  if (!execute && !verifyOnlyDirectory) return { directory, report: state }
  const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_API_KEY', 'CF_EMAIL']) delete environment[key]
  const run = async args => {
    await verifyStagingTarget(targetDirectory, accountId)
    const argv = ['--use-system-ca', path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--remote', '--json', '--config', path.resolve(targetDirectory, 'wrangler.json'), '--env-file', path.resolve(targetDirectory, 'empty.env'), ...args]
    const child = spawn(process.execPath, argv, { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', overflow = false
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 16 * 1024 * 1024) { overflow = true; child.kill() } })
    child.stderr.on('data', chunk => { if (stderr.length < 1024 * 1024) stderr += chunk })
    const timer = setTimeout(() => child.kill(), 180_000)
    try {
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
      if (code !== 0 || overflow) { await writeFile(path.join(directory, 'private-cli-diagnostic.txt'), stdout + '\n' + stderr, { mode: 0o600 }); throw new Error('Remote operation failed or response was incomplete') }
      return stdout
    } finally { clearTimeout(timer) }
  }
  const query = async sql => {
    const results = JSON.parse((await run(['--command', sql])).trim())
    if (!Array.isArray(results) || results.some(result => result.success !== true)) throw new Error('Remote query failed')
    return results
  }
  const ddl = (await readD1MigrationStatements()).filter(sql => /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) /.test(sql))
  const tables = ddl.map(sql => /^CREATE TABLE ([a-z_][a-z0-9_]*)\s*\(/.exec(sql)?.[1]).filter(Boolean)
  if (tables.length !== 23) throw new Error('Unreviewed target schema')
  const schema = (await query("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') ORDER BY type,name"))[0].results
  if (JSON.stringify(schema.map(row => normalize(row.sql)).sort()) !== JSON.stringify(ddl.map(normalize).sort())) throw new Error('Remote schema differs from reviewed migrations')
  if (!verifyOnlyDirectory) {
  const initial = await query(tables.map(table => `SELECT count(*) AS n FROM ${table}`).join(';'))
  if (initial.length !== tables.length || initial.some(result => result.results.length !== 1 || result.results[0].n !== 0)) throw new Error('Remote target is not empty; refusing overwrite or blind resume')
  state.status = 'remote-write-started-do-not-retry'; await save()
  await run(['--file', sqlFile])
  state.status = 'written-awaiting-exact-comparison'; await save()
  }
  const verified = await compareImportedTables(tables, plan.records, query, progress => console.error(JSON.stringify({ progress: 'remote-table-compared', ...progress })))
  const integrity = await query('PRAGMA quick_check;PRAGMA foreign_key_check')
  if (integrity.length !== 2 || integrity[0].results.length !== 1 || Object.values(integrity[0].results[0])[0] !== 'ok' || integrity[1].results.length) throw new Error('Remote integrity verification failed')
  const finalSource = await buildStagingImport(snapshot)
  if (finalSource.sourceManifestSha256 !== plan.sourceManifestSha256 || finalSource.sql !== plan.sql) throw new Error('Source snapshot changed during remote import')
  Object.assign(state, { status: 'all-records-compared', verifiedRecords: verified, verifiedTables: tables.length, quickCheck: 'ok', foreignKeyViolations: 0, checkedAt: new Date().toISOString() })
  await save(); return { directory, report: state }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (![5, 6, 7].includes(args.length) || args[1] !== '--target' || args[3] !== '--account-id' || (args.length === 6 && args[5] !== '--execute') || (args.length === 7 && args[5] !== '--verify-only')) {
    console.log('node scripts/d1/import-staging.mjs <snapshot> --target <private-target-directory> --account-id <selected-account-id> [--execute | --verify-only <previous-import-directory>]')
    process.exitCode = args.includes('--help') ? 0 : 1
  } else try {
    const result = await importStagingSnapshot(path.resolve(args[0]), path.resolve(args[2]), args[4], { execute: args.includes('--execute'), verifyOnlyDirectory: args[5] === '--verify-only' ? path.resolve(args[6]) : undefined })
    console.log(JSON.stringify({ directory: result.directory, status: result.report.status, sourceRecords: result.report.sourceRecords, verifiedRecords: result.report.verifiedRecords ?? 0, sourceModified: false, cutoverCertified: false }))
  } catch { console.error('Staging import stopped. No source data was changed. Inspect private import status; never retry a partial target blindly.'); process.exitCode = 1 }
}

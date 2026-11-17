import { DatabaseSync } from 'node:sqlite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readD1MigrationStatements } from './migrations.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = path.join(root, '.private/d1-migration/cloud-backup/staging-v1')
await mkdir(directory, { recursive: true, mode: 0o700 })
const plan = JSON.parse(await readFile(path.join(root, '.private/d1-migration/targets/9cbd1b6d-6006-4935-a08f-e3f76da748dd/r2-transfer-plan.json'), 'utf8'))
if (plan.accountId !== 'f882b38e4571e0141cb6353f5a271af7' || plan.bucketName !== 'nilelink-d1-staging-files' || plan.objects.length !== 53) throw new Error('Wrong source file plan')
const ddl = await readD1MigrationStatements(), db = new DatabaseSync(':memory:')
let tables
try {
  db.exec(ddl.join(';\n'))
  tables = ddl.map(sql => /^CREATE TABLE ([a-z_]+)\s*\(/.exec(sql)?.[1]).filter(Boolean).map(name => ({ name, columns: db.prepare(`PRAGMA table_xinfo(${name})`).all().filter(c => c.hidden === 0).map(c => c.name) }))
} finally { db.close() }
if (tables.length !== 23) throw new Error('Unreviewed schema')
const spec = { scope: 'baseline-staging-only', source: { accountId: plan.accountId, databaseId: '5055ce01-0b2b-4ed4-a175-f325e99e9c10', bucketName: plan.bucketName }, ddl, tables,
  files: plan.objects.map(o => ({ key: o.destinationKey, size: o.size, sha256: o.sha256 })), omittedFiles: plan.omittedObjects }
await writeFile(path.join(directory, 'spec.json'), JSON.stringify(spec), { flag: 'wx', mode: 0o600 })
const modulePath = path.join(root, 'scripts/d1/cloud-backup-worker.mjs').replaceAll('\\', '/')
await writeFile(path.join(directory, 'worker.mjs'), `import { createBackupWorker } from ${JSON.stringify(modulePath)};\nimport spec from './spec.json' with {type:'json'};\nexport default createBackupWorker(spec);\n`, { flag: 'wx', mode: 0o600 })
const config = { name: 'nilelink-d1-staging-backup', account_id: plan.accountId, main: path.join(directory, 'worker.mjs'), compatibility_date: '2025-04-01', compatibility_flags: ['nodejs_compat'], workers_dev: true, preview_urls: false,
  limits: { cpu_ms: 1000 }, triggers: { crons: ['0 1 * * *'] }, vars: { BACKUP_STAGE: 'isolated-staging' },
  d1_databases: [{ binding: 'DB', database_name: 'nilelink-d1-staging', database_id: spec.source.databaseId }],
  r2_buckets: [{ binding: 'SOURCE_FILES', bucket_name: plan.bucketName }, { binding: 'BACKUPS', bucket_name: 'nilelink-d1-staging-backups' }] }
await writeFile(path.join(directory, 'wrangler.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
await writeFile(path.join(directory, 'empty.env'), '# No application environment or secrets.\n', { flag: 'wx', mode: 0o600 })
await writeFile(path.join(directory, 'secrets.json'), JSON.stringify({ BACKUP_ENCRYPTION_KEY: randomBytes(32).toString('hex'), BACKUP_TRIGGER_KEY: randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ directory, tables: tables.length, files: spec.files.length, omittedFiles: spec.omittedFiles.length, cronUtc: '01:00 daily', deployed: false }))

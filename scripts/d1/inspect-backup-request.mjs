import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy } from 'wrangler'

const root = fileURLToPath(new URL('../../', import.meta.url)), directory = await realpath(process.argv[2] || '')
if (process.argv.length !== 3 || !directory.startsWith(path.join(root, '.private/d1-migration/worker-staging') + path.sep)) throw new Error('A private create validation receipt is required')
const input = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'))
if (input.scope !== 'deployed-manual-backup-through-next-and-service-binding' || input.status !== 'all-create-checks-passed' || !/^[a-f0-9-]{36}$/.test(input.requestId) || !/^[a-f0-9-]{36}$/.test(input.createdBackupId)) throw new Error('Invalid completed validation receipt')
const parent = path.join(directory, 'inspection', randomUUID()); await mkdir(parent, { recursive: true, mode: 0o700 })
const actorId = '000000000000000000000001'
const config = { name: 'nilelink-backup-request-inspection', account_id: 'f882b38e4571e0141cb6353f5a271af7', compatibility_date: '2025-04-01', d1_databases: [{ binding: 'DB', database_name: 'nilelink-d1-staging-e2e', database_id: '7aa12b1a-5015-4f99-b028-d65de7a260bd', preview_database_id: '7aa12b1a-5015-4f99-b028-d65de7a260bd', remote: true }], r2_buckets: [{ binding: 'BACKUPS', bucket_name: 'nilelink-d1-staging-backups', remote: true }] }
const configPath = path.join(parent, 'wrangler.json'); await writeFile(configPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 })
for (const key of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(key)) throw new Error('Auth overrides forbidden')
let proxy
try {
  proxy = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
  const row = await proxy.env.DB.prepare("SELECT count(*) AS n FROM system_audit_logs WHERE json_extract(data,'$.event')=? AND json_extract(data,'$.requestId')=? AND json_extract(data,'$.actorId')=?").bind('D1_BACKUP_REQUESTED', input.requestId, actorId).first()
  assert.equal(row.n, 1)
  const key = 'staging-jobs/' + createHash('sha256').update(actorId + ':' + input.requestId).digest('hex') + '.json'
  const object = await proxy.env.BACKUPS.get(key)
  assert.ok(object && object.size < 4096)
  const job = await object.json()
  assert.equal(job.requestId, input.requestId); assert.equal(job.actorId, actorId); assert.equal(job.state, 'completed'); assert.equal(job.receipt.id, input.createdBackupId)
  const report = { scope: 'read-only-audit-and-job-outcome-verification', requestId: input.requestId, auditRows: row.n, jobState: job.state, backupId: input.createdBackupId, sourceModified: false, productionCertified: false, checkedAt: new Date().toISOString() }
  await writeFile(path.join(parent, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ directory: parent, ...report }))
} finally { await proxy?.dispose() }

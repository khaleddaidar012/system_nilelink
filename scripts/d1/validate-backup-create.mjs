import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = path.join(root, '.private/d1-migration/worker-staging/7e89ea06-ed15-4149-805a-4da1929ccb10')
const manifest = JSON.parse(await readFile(path.join(fixture, 'manifest.json'), 'utf8'))
const credentials = JSON.parse(await readFile(path.join(fixture, 'credentials.json'), 'utf8'))
const origin = 'https://nilelink-d1-staging-e2e.mohamedznaty55.workers.dev'
if (process.argv.length !== 3 || process.argv[2] !== '--execute' || manifest.scope !== 'synthetic-worker-e2e' || manifest.deployedOrigin !== origin || manifest.sourceRecordsCopied !== false || credentials.actors.some(a => !a.email.endsWith('@example.test'))) throw new Error('Explicit isolated execution required')
const directory = path.join(fixture, 'backup-create-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'deployed-manual-backup-through-next-and-service-binding', sourceRecordsModified: false, backupSource: 'fixed-staging-baseline', productionCertified: false, results: [], status: 'running', requestId: randomUUID() }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const call = (url, { cookie, body, sameOrigin = false } = {}) => fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { 'x-nilelink-staging-key': credentials.gateSecret, ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(sameOrigin ? { origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(150000) })
async function check(name, action) { await action(); report.results.push({ name, passed: true }); await save(); console.log(JSON.stringify({ name, passed: true })) }
try {
  await save()
  const cookies = []
  for (const index of [0, 1, 3]) {
    const response = await call('/api/auth/login', { body: { identifier: credentials.actors[index].email, password: credentials.password } })
    assert.equal(response.status, 200); cookies.push(response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '))
  }
  const [admin, customer, restricted] = cookies
  await check('manual backup rejects CSRF, customer and restricted staff', async () => {
    assert.equal((await call('/api/admin/system/d1-backups', { cookie: admin, body: { requestId: randomUUID() } })).status, 403)
    for (const cookie of [customer, restricted]) assert.equal((await call('/api/admin/system/d1-backups', { cookie, body: { requestId: randomUUID() }, sameOrigin: true })).status, 403)
  })
  let result
  const create = () => call('/api/admin/system/d1-backups', { cookie: admin, body: { requestId: report.requestId }, sameOrigin: true })
  await check('concurrent duplicate UI requests resolve to one completed encrypted backup', async () => {
    const responses = await Promise.all([create(), create()])
    for (const response of responses) {
      const data = await response.json()
      assert.ok([200, 202].includes(response.status), `Unexpected status ${response.status}`)
      assert.equal(data.requestId, report.requestId)
      if (data.state === 'completed') {
        if (result) assert.equal(data.backup.id, result.backup.id)
        result = data
      }
    }
    if (!result) throw new Error('No completed response; inspect saved request ID before any retry')
    assert.equal(result.backup.records, 2072); assert.equal(result.backup.files, 53)
    assert.equal(result.receipt, undefined); assert.equal(result.backup.objectKey, undefined); assert.equal(result.backup.sha256, undefined)
    report.createdBackupId = result.backup.id
  })
  await check('replaying the same request returns the original backup without creating another', async () => {
    const response = await create(), replay = await response.json()
    assert.equal(response.status, 200); assert.equal(replay.backup.id, result.backup.id)
  })
  await check('new manual backup appears in authenticated inventory', async () => {
    const response = await call('/api/admin/system/d1-backups', { cookie: admin }), inventory = await response.json()
    assert.equal(response.status, 200); assert.equal(inventory.canCreate, true)
    const item = inventory.items.find(i => i.id === result.backup.id)
    assert.ok(item); assert.equal(item.status, 'stored'); assert.equal(item.trigger, 'manual')
  })
  report.status = 'all-create-checks-passed'; report.checkedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ directory, status: report.status, passed: report.results.length, createdBackupId: report.createdBackupId }))
} catch (error) {
  report.status = 'failed-inspect-existing-request-before-retry'; await save(); await writeFile(path.join(directory, 'private-error.txt'), String(error.stack || error), { mode: 0o600 })
  console.error('Isolated manual backup validation stopped; inspect the private request receipt before retrying.'); process.exitCode = 1
}

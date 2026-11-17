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
if (manifest.scope !== 'synthetic-worker-e2e' || manifest.deployedOrigin !== origin || manifest.sourceRecordsCopied !== false || credentials.actors.some(a => !a.email.endsWith('@example.test'))) throw new Error('Synthetic origin required')
const directory = path.join(fixture, 'backup-dashboard-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'deployed-d1-backup-dashboard-http', results: [], sourceRecordsModified: false, backupObjectsModified: false, productionCertified: false, status: 'running' }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const call = (url, { cookie, method = 'GET', input, gate = true } = {}) => fetch(origin + url, { method, redirect: 'manual', headers: { ...(gate ? { 'x-nilelink-staging-key': credentials.gateSecret } : {}), ...(cookie ? { cookie } : {}), ...(input ? { 'content-type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(60000) })
async function check(name, action) { await action(); report.results.push({ name, passed: true }); await save(); console.log(JSON.stringify({ name, passed: true })) }
try {
  await save()
  await check('gate and session protect inventory before any listing', async () => {
    assert.equal((await call('/api/admin/system/d1-backups', { gate: false })).status, 404)
    assert.equal((await call('/api/admin/system/d1-backups')).status, 401)
  })
  const cookies = []
  for (const index of [0, 1, 3]) {
    const response = await call('/api/auth/login', { method: 'POST', input: { identifier: credentials.actors[index].email, password: credentials.password } })
    assert.equal(response.status, 200)
    cookies.push(response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '))
  }
  const [admin, customer, restricted] = cookies
  await check('customer and restricted staff cannot see backup metadata', async () => {
    for (const cookie of [customer, restricted]) assert.equal((await call('/api/admin/system/d1-backups', { cookie })).status, 403)
  })
  await check('admin sees actual completed R2 backup metadata with private caching', async () => {
    const response = await call('/api/admin/system/d1-backups', { cookie: admin }), body = await response.json()
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/)
    assert.equal(body.readOnly, true); assert.equal(body.scope, 'baseline-staging'); assert.equal(body.verification, 'receipt-and-object-metadata-only')
    assert.ok(body.items.length >= 1)
    for (const item of body.items) {
      assert.equal(item.status, 'stored'); assert.equal(item.files, 53); assert.equal(item.records, 2072)
      assert.equal(item.objectKey, undefined); assert.equal(item.sha256, undefined); assert.equal(item.base64, undefined)
    }
    report.displayedBackups = body.items.length
  })
  await check('Arabic backup page renders staging notice and read-only dashboard', async () => {
    const response = await call('/ar/admin/system/backups', { cookie: admin })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /نسخ D1|D1 backups/)
  })
  await check('creation without same-origin is rejected and legacy agent endpoints stay blocked', async () => {
    assert.equal((await call('/api/admin/system/d1-backups', { cookie: admin, method: 'POST' })).status, 403)
    assert.equal((await call('/api/admin/system/backups', { cookie: admin, method: 'POST' })).status, 403)
  })
  report.status = 'all-dashboard-checks-passed'; report.checkedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ directory, status: report.status, passed: report.results.length }))
} catch (error) {
  report.status = 'failed'; await save(); await writeFile(path.join(directory, 'private-error.txt'), String(error.stack || error), { mode: 0o600 })
  console.error('Isolated backup dashboard validation failed; inspect private report.'); process.exitCode = 1
}

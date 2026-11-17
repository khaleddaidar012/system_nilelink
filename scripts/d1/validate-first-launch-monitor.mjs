import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT } from 'jose'
import assert from 'node:assert/strict'
import { validateSnapshot, readRecords } from './snapshot.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const app = path.join(root, '.private/d1-migration/first-launch/application')
const config = JSON.parse(await readFile(path.join(app, 'wrangler.json'), 'utf8'))
if (config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.d1_databases[0].database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' || config.r2_buckets.find(row => row.binding === 'D1_BACKUPS')?.bucket_name !== 'nilelink-production-backups') throw Error('Wrong monitoring destination')
const secrets = JSON.parse(await readFile(path.join(app, 'secrets.json'), 'utf8'))
const { files } = await validateSnapshot(path.join(root, '.private/d1-migration/79642c29-36d5-4475-9c1b-353dbd581ae1'))
let admin, customer
for await (const row of readRecords(files.find(row => row.name === 'users').file)) {
  if (row.document.email === 'manager@nilelink.com') admin = row.document
  if (!customer && ['customer_admin', 'customer_user'].includes(row.document.role) && row.document.status === 'active') customer = row.document
}
if (!admin || !customer) throw Error('Test actors unavailable')
async function cookie(user) {
  const token = await new SignJWT({ userId: user._id, email: user.email, role: user.role, tokenType: 'access', firstName: user.firstName, lastName: user.lastName }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(secrets.JWT_SECRET))
  return `nilelink_access_token=${token}`
}
const origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const adminCookie = await cookie(admin), customerCookie = await cookie(customer)
const call = (url, session = adminCookie, gate = true, method = 'GET') => fetch(origin + url, { method, redirect: 'manual', headers: { ...(gate ? { 'x-nilelink-staging-key': secrets.D1_STAGING_GATE_SECRET } : {}), ...(session ? { cookie: session } : {}) }, signal: AbortSignal.timeout(90000) })
const directory = path.join(app, 'monitor-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'first-launch-monitoring-read-only-http', status: 'running', results: [], credentialsChanged: false, sourceRecordsModified: false, productionCertified: false }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
async function check(name, action) { await action(); report.results.push({ name, passed: true }); await save() }
try {
  await save()
  await check('overview uses actual R2 records and marks email as deferred', async () => {
    const response = await call('/api/admin/overview'), data = await response.json()
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/)
    assert.equal(data.databaseProvider, 'd1'); assert.equal(data.email.deferred, true); assert.equal(data.email.monitoring, 'deferred')
    assert.equal(data.backups.provider, 'd1'); assert.equal(data.backups.monitoring, 'connected'); assert.ok(data.backups.totalBackups >= 2)
    assert.ok(data.backups.lastCompletedAt); assert.equal(new Date(data.backups.nextScheduledRun).getUTCHours(), 1); assert.equal(new Date(data.backups.nextScheduledRun).getUTCMinutes(), 30)
    assert.equal(typeof data.backups.firstScheduledRunObserved, 'boolean')
    for (const forbidden of ['BACKUP_ENCRYPTION_KEY', '.aesgcm', 'sha256', 'Local D1 preview']) assert.ok(!JSON.stringify(data).includes(forbidden))
    report.monitor = { totalBackups: data.backups.totalBackups, lastCompletedAt: data.backups.lastCompletedAt, nextScheduledRun: data.backups.nextScheduledRun, firstScheduledRunObserved: data.backups.firstScheduledRunObserved, failedRuns: data.backups.failedBackups }
  })
  await check('backup details are from first-launch storage and agree with summary', async () => {
    const response = await call('/api/admin/system/d1-backups'), data = await response.json()
    assert.equal(response.status, 200); assert.equal(data.scope, 'first-launch'); assert.equal(data.canCreate, false)
    assert.equal(data.items.length, report.monitor.totalBackups)
    assert.ok(data.items.every(item => item.status === 'stored' && !Object.hasOwn(item, 'sha256') && !Object.hasOwn(item, 'objectKey')))
  })
  await check('authentication and permissions protect monitoring metadata', async () => {
    assert.equal((await call('/api/admin/overview', '', false)).status, 404)
    assert.equal((await call('/api/admin/system/d1-backups', '')).status, 401)
    assert.equal((await call('/api/admin/system/d1-backups', customerCookie)).status, 403)
    assert.equal((await call('/api/admin/system/d1-backups', adminCookie, true, 'POST')).status, 403)
  })
  await check('backup detail page is accessible without enabling legacy actions', async () => {
    const response = await call('/ar/admin/system/backups')
    assert.equal(response.status, 200); assert.match(await response.text(), /نسخ D1/)
    assert.equal((await call('/api/admin/system/backups')).status, 403)
  })
  report.status = 'all-monitoring-checks-passed'; report.completedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ directory, ...report }))
} catch (error) {
  report.status = 'failed-review-required'; await save(); console.error(JSON.stringify({ directory, passedGroups: report.results.length, status: report.status, reason: String(error.message).slice(0, 160) })); process.exitCode = 1
}

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../../', import.meta.url))
const app = path.join(root, '.private/d1-migration/first-launch/application')
const config = JSON.parse(await readFile(path.join(app, 'wrangler.json'), 'utf8'))
if (config.vars.D1_RUNTIME_STAGE !== 'first-launch-live' || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.d1_databases[0].database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb') throw Error('Wrong live target')
const credentials = await readFile(path.join(app, 'manager-credentials.txt'), 'utf8')
const password = credentials.match(/^Password: (.+)$/m)?.[1].trim()
if (!password) throw Error('Local authorized credential unavailable')
const origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const emailEnabled = config.vars.EMAIL_DELIVERY_ENABLED === 'true'
const directory = path.join(root, '.private/d1-migration/first-launch/activation/validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'public-first-launch-real-login-and-authenticated-api', status: 'running', results: [], financialTransactionsCreated: false, passwordsChanged: false, reviewGateNeeded: false }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
const call = (pathname, { cookie, method = 'GET', input } = {}) => fetch(origin + pathname, { method, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(input ? { 'content-type': 'application/json', origin } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(90000) })
async function check(name, action) { await action(); report.results.push({ name, passed: true }); await save() }
try {
  await save()
  await check('normal browser login page is reachable without the review key', async () => {
    const response = await call('/ar/login'); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/)
    assert.equal((await call('/api/admin/invoices')).status, 401)
  })
  let cookie
  await check('current manager password logs in and issues a normal account session', async () => {
    const response = await call('/api/auth/login', { method: 'POST', input: { identifier: 'admin@nilelinklogistics.com', password, rememberMe: false } })
    assert.equal(response.status, 200); assert.equal((await response.json()).success, true)
    cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    assert.ok(cookie.includes('nilelink_access_token='))
    assert.equal((await call('/api/auth/me', { cookie })).status, 200)
  })
  await check('authorized reads use live D1 and the existing backup monitor', async () => {
    for (const pathname of ['/api/admin/customers', '/api/admin/invoices', '/api/admin/requests']) assert.equal((await call(pathname, { cookie })).status, 200)
    const response = await call('/api/admin/overview', { cookie }), data = await response.json()
    assert.equal(response.status, 200); assert.equal(data.previewOnly, false); assert.equal(data.databaseProvider, 'd1')
    assert.equal(data.email.deferred, !emailEnabled); if (emailEnabled) assert.equal(data.email.configured, true)
    assert.equal(data.backups.monitoring, 'connected')
    report.backupsObserved = data.backups.totalBackups
  })
  await check('business writes reach validation while anonymous writes remain forbidden', async () => {
    assert.equal((await call('/api/admin/invoices', { method: 'POST', input: {} })).status, 401)
    const response = await call('/api/admin/invoices', { cookie, method: 'POST', input: {} })
    assert.ok([400, 422].includes(response.status), `Expected input validation, got ${response.status}`)
  })
  await check('email routes reflect configured mode while seed and legacy agents remain unavailable', async () => {
    assert.equal((await call('/api/contact', { method: 'POST', input: {} })).status, emailEnabled ? 400 : 503)
    if (emailEnabled) {
      assert.equal((await call('/api/auth/send-otp', { method: 'POST', input: { channel: 'email' } })).status, 401)
      assert.equal((await call('/api/auth/verify-email?token=invalid')).status, 400)
    }
    assert.equal((await call('/api/seed')).status, 404)
    assert.equal((await call('/api/admin/system/backups', { cookie })).status, 404)
    assert.equal((await call('/api/admin/system/d1-backups', { cookie })).status, 200)
  })
  report.status = 'all-live-activation-checks-passed'; report.completedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ directory, ...report }))
} catch (error) {
  report.status = 'activation-needs-review'; await save(); console.error(JSON.stringify({ directory, status: report.status, passedGroups: report.results.length, reason: String(error.message).slice(0, 120) })); process.exitCode = 1
}

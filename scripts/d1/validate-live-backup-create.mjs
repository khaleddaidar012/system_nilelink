import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

if (process.argv[2] !== '--execute') throw Error('Use --execute to create one real encrypted backup')
const root = fileURLToPath(new URL('../../', import.meta.url)), origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const app = path.join(root, '.private/d1-migration/first-launch/application')
const config = JSON.parse(await readFile(path.join(app, 'wrangler.json'), 'utf8'))
assert.equal(config.vars.D1_RUNTIME_STAGE, 'first-launch-live')
assert.equal(config.services?.find(row => row.binding === 'D1_BACKUP_RUNNER')?.service, 'nilelink-first-launch-backup')
const password = (await readFile(path.join(app, 'manager-credentials.txt'), 'utf8')).match(/^Password: (.+)$/m)?.[1].trim()
assert.ok(password)
const directory = path.join(root, '.private/d1-migration/first-launch/manual-backup-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'live-native-manual-backup-through-application-service-binding', requestId: randomUUID(), status: 'running', financialRecordsModified: false, expectedAuditWrite: true, checks: [] }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
const call = (url, { cookie, body, withOrigin = true } = {}) => fetch(origin + url, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json', ...(withOrigin ? { origin } : {}) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(150000) })
try {
  await save()
  const login = await call('/api/auth/login', { body: { identifier: 'admin@nilelinklogistics.com', password, rememberMe: false } }); assert.equal(login.status, 200)
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); await login.arrayBuffer()
  const endpoint = '/api/admin/system/d1-backups', body = { requestId: report.requestId }
  assert.equal((await call(endpoint, { body })).status, 401)
  assert.equal((await call(endpoint, { body, cookie, withOrigin: false })).status, 403)
  report.checks.push('anonymous and missing-origin requests rejected before backup creation'); await save()
  const inventory = await (await call(endpoint, { cookie })).json(); assert.equal(inventory.scope, 'first-launch'); assert.equal(inventory.canCreate, true)
  const response = await call(endpoint, { cookie, body }), created = await response.json()
  report.outcomeHttpStatus = response.status; report.outcome = created; await save()
  assert.equal(response.status, 200); assert.equal(created.state, 'completed'); assert.equal(created.requestId, report.requestId)
  report.backupId = created.backup.id
  const replay = await call(endpoint, { cookie, body }), repeated = await replay.json()
  assert.equal(replay.status, 200); assert.equal(repeated.backup.id, report.backupId)
  report.checks.push('same request ID returns the same completed backup')
  const after = await (await call(endpoint, { cookie })).json()
  assert.ok(after.items.some(item => item.id === report.backupId && item.trigger === 'manual' && item.status === 'stored'))
  report.checks.push('new manual backup appears in live inventory')
  report.status = 'live-manual-backup-created-and-replay-verified'; report.completedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ directory, status: report.status, backupId: report.backupId, checks: report.checks }))
} catch (error) {
  report.status = 'needs-review-do-not-submit-a-new-request-id'; report.reason = String(error.message).slice(0, 150); await save()
  console.error(JSON.stringify({ directory, requestId: report.requestId, status: report.status, reason: report.reason })); process.exitCode = 1
}

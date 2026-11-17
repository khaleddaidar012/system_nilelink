import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { handleD1BackupCreate } from '../../lib/backup/d1-create.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'

let instance, db, admin, staff
const oldJwt = process.env.JWT_SECRET, key = 'cd'.repeat(32)
before(async () => {
  process.env.JWT_SECRET = 'create-backup-fixture'
  instance = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2025-04-01', d1Databases: { DB: 'create-backup-fixture' } })
  db = await instance.getD1Database('DB'); await db.batch((await readD1MigrationStatements()).map(s => db.prepare(s)))
  const cookies = []
  for (const [n, role] of [[1, 'super_admin'], [2, 'staff']]) {
    const userId = String(n).padStart(24, '0'), email = `create${n}@example.test`
    await db.prepare('INSERT INTO users(id,data) VALUES(?,?)').bind(userId, JSON.stringify({ _id: userId, email, role, status: 'active', staffPermissions: { canManageBackups: false } })).run()
    cookies.push(`${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId, email, firstName: 'Fixture', lastName: 'User', role: 'super_admin' })}`)
  }
  ;[admin, staff] = cookies
})
after(async () => { await instance?.dispose(); if (oldJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwt })
const request = (cookie, body, origin = 'https://fixture') => new Request('https://fixture/api/admin/system/d1-backups', { method: 'POST', headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) })
function options() {
  let calls = 0
  return { get calls() { return calls }, scope: 'baseline-staging', enabled: 'true', triggerKey: key, runner: { async fetch(req) {
    calls++; assert.equal(req.url, 'https://backup.internal/run'); assert.equal(req.headers.get('authorization'), 'Bearer ' + key)
    return Response.json({ requestId: req.headers.get('idempotency-key'), state: 'completed', receipt: { id: crypto.randomUUID(), records: 2072, files: 53, objectKey: 'private-path', sha256: key } })
  } } }
}
test('create requires current database permission and exact same-origin before service call', async () => {
  for (const [cookie, origin, status] of [[null, 'https://fixture', 401], [staff, 'https://fixture', 403], [admin, 'https://other', 403], [admin, null, 403]]) {
    const o = options(); assert.equal((await handleD1BackupCreate(request(cookie, { requestId: crypto.randomUUID() }, origin), db, o)).status, status); assert.equal(o.calls, 0)
  }
})
test('audit persists once for concurrent duplicate requests and sensitive runner fields are filtered', async () => {
  const o = options(), requestId = crypto.randomUUID()
  const replies = await Promise.all([handleD1BackupCreate(request(admin, { requestId }), db, o), handleD1BackupCreate(request(admin, { requestId }), db, o)])
  for (const reply of replies) { assert.equal(reply.status, 200); const text = await reply.text(); assert.ok(!text.includes(key)); assert.ok(!text.includes('private-path')) }
  const count = await db.prepare("SELECT count(*) AS n FROM system_audit_logs WHERE json_extract(data,'$.requestId')=?").bind(requestId).first()
  assert.equal(count.n, 1)
})
test('invalid payload and disabled configuration do not invoke runner', async () => {
  for (const body of [{ requestId: 'bad' }, { requestId: crypto.randomUUID(), source: 'other' }]) {
    const o = options(); assert.equal((await handleD1BackupCreate(request(admin, body), db, o)).status, 400); assert.equal(o.calls, 0)
  }
  const o = options(); assert.equal((await handleD1BackupCreate(request(admin, { requestId: crypto.randomUUID() }), db, { ...o, enabled: 'false' })).status, 503)
})
test('lost service response is not retried and audit failure prevents external side effect', async () => {
  const o = options(); let attempts = 0
  o.runner.fetch = async () => { attempts++; throw new Error('uncertain') }
  assert.equal((await handleD1BackupCreate(request(admin, { requestId: crypto.randomUUID() }), db, o)).status, 503); assert.equal(attempts, 1)
  const failing = { prepare(sql) { if (sql.startsWith('INSERT INTO system_audit_logs')) throw new Error('audit unavailable'); return db.prepare(sql) }, batch: s => db.batch(s) }
  const safe = options(); assert.equal((await handleD1BackupCreate(request(admin, { requestId: crypto.randomUUID() }), failing, safe)).status, 503); assert.equal(safe.calls, 0)
})

test('live backup uses the fixed service and records first-launch scope; unknown scopes fail closed', async () => {
  const requestId = crypto.randomUUID(), live = { ...options(), scope: 'first-launch' }
  const response = await handleD1BackupCreate(request(admin, { requestId }), db, live)
  assert.equal(response.status, 200)
  const audit = await db.prepare("SELECT json_extract(data,'$.scope') AS scope FROM system_audit_logs WHERE json_extract(data,'$.requestId')=?").bind(requestId).first()
  assert.equal(audit.scope, 'first-launch')
  const unknown = options()
  assert.equal((await handleD1BackupCreate(request(admin, { requestId: crypto.randomUUID() }), db, { ...unknown, scope: 'arbitrary-production' })).status, 503)
  assert.equal(unknown.calls, 0)
})

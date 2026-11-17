import { readFile, writeFile } from 'node:fs/promises'
import { getPlatformProxy } from 'wrangler'
import { hashPassword, verifyPassword } from '../../lib/auth/password.ts'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = process.cwd(), base = path.join(root, '.private/d1-migration/first-launch')
const app = path.join(base, 'application'), directory = path.join(base, 'customer-purge-2026-10-22')
const plan = JSON.parse(await readFile(path.join(directory, 'plan.json'), 'utf8'))
assert.ok(['database-deleted-files-pending', 'complete'].includes(plan.status))
const credentials = JSON.parse(await readFile(path.join(app, 'requested-admin-credentials.json'), 'utf8'))
assert.equal(credentials.email, 'admin@nilelinklogistics.com')
const admin = plan.preservedUsers.find(r => JSON.parse(r.data).email === 'manager@nilelink.com')
assert.equal(JSON.parse(admin.data).role, 'super_admin')
const proxy = await getPlatformProxy({ configPath: path.join(directory, 'proxy.json'), envFiles: [] })
try {
  const db = proxy.env.DB, current = await db.prepare('SELECT id,data,revision FROM users WHERE id=?').bind(admin.id).first()
  const user = JSON.parse(current.data)
  assert.equal(user.role, 'super_admin'); assert.ok(['manager@nilelink.com', credentials.email].includes(user.email))
  if (user.email !== credentials.email) {
    const conflict = await db.prepare('SELECT id FROM users WHERE email=?').bind(credentials.email).first(); assert.equal(conflict, null)
    const patch = { ...user, email: credentials.email, passwordHash: await hashPassword(credentials.password), updatedAt: new Date().toISOString() }
    for (const key of ['passwordResetToken', 'passwordResetExpires', 'passwordResetOtp', 'passwordResetOtpExpires', 'passwordResetChannel']) delete patch[key]
    const results = await db.batch([
      db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=? AND revision=? AND data=?').bind(JSON.stringify(patch), admin.id, current.revision, current.data),
      db.prepare("INSERT INTO _nilelink_write_guards(id,valid) VALUES('authorized-admin-login-change',changes())"),
      db.prepare("DELETE FROM _nilelink_write_guards WHERE id='authorized-admin-login-change'")
    ]); assert.ok(results.every(r => r.success))
  }
  const updated = JSON.parse((await db.prepare('SELECT data FROM users WHERE id=?').bind(admin.id).first()).data)
  assert.equal(updated.email, credentials.email); assert.equal(updated.role, 'super_admin'); assert.ok(await verifyPassword(credentials.password, updated.passwordHash))
} finally { await proxy.dispose() }
const origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials.email, password: credentials.password, rememberMe: false }), signal: AbortSignal.timeout(60000) })
assert.equal(login.status, 200)
const cookies = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
const me = await fetch(origin + '/api/auth/me', { headers: { cookie: cookies }, signal: AbortSignal.timeout(60000) }); assert.equal(me.status, 200)
const data = await me.json(); assert.equal(data.user.email, credentials.email); assert.equal(data.user.role, 'super_admin')
const previous = await readFile(path.join(app, 'manager-credentials.txt'), 'utf8')
await writeFile(path.join(directory, 'previous-admin-credentials.txt'), previous, { flag: 'wx', mode: 0o600 })
await writeFile(path.join(app, 'manager-credentials.txt'), `URL: ${origin}/ar/login\nEmail: ${credentials.email}\nPassword: ${credentials.password}\n`, { mode: 0o600 })
await writeFile(path.join(directory, 'admin-change.json'), JSON.stringify({ status: 'login-verified', email: credentials.email, sameAdminId: admin.id, role: 'super_admin', credentialsFileUpdated: true, checkedAt: new Date().toISOString() }, null, 2))
console.log(JSON.stringify({ status: 'login-verified', email: credentials.email, role: 'super_admin', credentialsFileUpdated: true }))

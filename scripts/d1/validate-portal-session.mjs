import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SignJWT } from 'jose'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = path.join(root, '.private/d1-migration/first-launch/portal-verification')
const config = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/application/wrangler.json'), 'utf8'))
assert.equal(config.account_id, 'f882b38e4571e0141cb6353f5a271af7')
assert.equal(config.d1_databases[0].database_id, '515ee420-9ccb-4bbc-ba98-53ecb391bbeb')
const source = JSON.parse(await readFile(path.join(directory, 'account-state-direct.json'), 'utf8'))
const user = source[0].results[0]
assert.equal(source[0].meta.rows_written, 0)
assert.equal(user.email, 'khaled@nilelinklogistics.com'); assert.equal(user.status, 'active'); assert.equal(user.emailVerified, 1)
assert.ok(['customer', 'customer_admin'].includes(user.role))
const secrets = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/application/secrets.json'), 'utf8'))
const key = new TextEncoder().encode(secrets.JWT_SECRET)
// Five-minute test tokens for this exact affected account. Never persisted or
// displayed; no passwords, verification flags or company statuses are changed.
const sign = payload => new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(key)
const access = await sign({ userId: user.id, email: user.email, role: user.role, customerId: user.customerId, firstName: '', lastName: '', emailVerified: false, whatsappVerified: false, tokenType: 'access' })
const refresh = await sign({ userId: user.id, email: user.email, role: user.role, customerId: user.customerId, tokenType: 'refresh' })
const origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const call = (url, cookie, method = 'GET') => fetch(origin + url, { method, redirect: 'manual', headers: { cookie, origin }, signal: AbortSignal.timeout(60000) })
const report = { scope: 'affected-customer-stale-session-recovery', passwordChanged: false, companyStatusChanged: false, databaseVerificationChanged: false, testTokensPersisted: false, checks: [], status: 'running' }
await mkdir(directory, { recursive: true, mode: 0o700 })
try {
  const old = `nilelink_access_token=${access}; nilelink_refresh_token=${refresh}`
  const blocked = await call('/ar/portal', old)
  assert.ok([307, 308].includes(blocked.status)); assert.ok(blocked.headers.get('location')?.endsWith('/ar/portal/verification'))
  report.checks.push('old signed email=false cookie reproduces the verification redirect despite verified database state')
  const response = await call('/api/auth/refresh', old, 'POST'); assert.equal(response.status, 200)
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie.includes('nilelink_access_token='))
  const me = await call('/api/auth/me', cookie); assert.equal(me.status, 200)
  const data = await me.json(); assert.equal(data.user.id, user.id); assert.equal(data.user.emailVerified, true)
  assert.equal(data.customer.accountStatus, user.companyStatus)
  report.checks.push('refresh reloads the real email verification flag without activating the company or requiring WhatsApp')
  const portal = await call('/ar/portal', cookie)
  assert.equal(portal.status, 200); assert.match(portal.headers.get('content-type'), /text\/html/); await portal.arrayBuffer()
  report.checks.push('fresh session opens the actual portal instead of redirecting to verification')
  report.status = 'stale-session-recovery-verified'; report.checkedAt = new Date().toISOString()
} catch (error) { report.status = 'needs-review'; report.error = String(error.message).slice(0, 150); process.exitCode = 1 }
const file = path.join(directory, 'session-validation.json')
await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 }); console.log(JSON.stringify({ file, ...report }))

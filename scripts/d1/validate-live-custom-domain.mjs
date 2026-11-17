import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { canonicalPublicOrigin, legacyWorkerOrigin } from '../../lib/deployment/public-origin.mjs'
const base = '.private/d1-migration/first-launch'
const credentials = JSON.parse(await readFile(base + '/application/requested-admin-credentials.json', 'utf8'))
const config = JSON.parse(await readFile(base + '/application/wrangler.json', 'utf8'))
assert.equal(config.vars.NEXT_PUBLIC_APP_URL, canonicalPublicOrigin)
const report = { status: 'started', origin: canonicalPublicOrigin, checks: [], emailsSent: false, businessRecordsModified: false }
for (const origin of [canonicalPublicOrigin, legacyWorkerOrigin]) {
  const response = await fetch(origin + '/ar/login', { signal: AbortSignal.timeout(60000) })
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/)
  assert.notEqual((await response.text()).trim(), 'Service unavailable')
  report.checks.push(origin + ': login page HTTP 200')
}
const login = await fetch(canonicalPublicOrigin + '/api/auth/login', { method: 'POST', headers: { origin: canonicalPublicOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials.email, password: credentials.password, rememberMe: false }), signal: AbortSignal.timeout(60000) })
assert.equal(login.status, 200)
const setCookies = login.headers.getSetCookie(); assert.ok(setCookies.some(c => c.startsWith('nilelink_access_token=')))
assert.ok(setCookies.every(c => !/domain=/i.test(c) && /secure/i.test(c)))
const cookie = setCookies.map(c => c.split(';')[0]).join('; ')
const call = url => fetch(canonicalPublicOrigin + url, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(60000) })
const me = await call('/api/auth/me'); assert.equal(me.status, 200)
const data = await me.json(); assert.equal(data.authenticated, true); assert.equal(data.user.email, credentials.email); assert.equal(data.user.role, 'super_admin')
report.checks.push('existing admin authenticates on custom domain with secure host-only cookies')
const dashboard = await call('/ar/admin'); assert.equal(dashboard.status, 200); await dashboard.arrayBuffer()
report.checks.push('authenticated admin dashboard HTTP 200')
const rejected = await fetch(canonicalPublicOrigin + '/api/auth/login', { method: 'POST', headers: { origin: 'https://unapproved.example' }, signal: AbortSignal.timeout(60000) }); assert.equal(rejected.status, 403)
assert.equal((await call('/api/seed')).status, 404)
report.checks.push('cross-origin mutation rejected; seed remains disabled')
report.status = 'passed'; report.checkedAt = new Date().toISOString()
await writeFile(base + '/custom-domain-live-validation.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

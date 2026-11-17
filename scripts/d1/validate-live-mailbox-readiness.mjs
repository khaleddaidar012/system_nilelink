import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin = 'https://nilelinklogistics.com', base = '.private/d1-migration/first-launch'
const credentials = JSON.parse(await readFile(base + '/application/requested-admin-credentials.json', 'utf8'))
const endpoint = origin + '/api/admin/mailbox'
assert.equal((await fetch(endpoint, { signal: AbortSignal.timeout(30000) })).status, 401)
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials.email, password: credentials.password, rememberMe: false }), signal: AbortSignal.timeout(60000) }); assert.equal(login.status, 200)
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const statusResponse = await fetch(endpoint + '?action=status', { headers: { cookie }, signal: AbortSignal.timeout(30000) }); assert.equal(statusResponse.status, 200)
const status = await statusResponse.json(); assert.equal(status.available, false); assert.equal(status.needsServerSetup, true)
assert.equal(status.connected, false); assert.equal(status.unread, 0)
assert.ok(!JSON.stringify(status).match(/password|ciphertext|HMAC|ENCRYPTION/))
assert.equal((await fetch(endpoint, { method: 'POST', headers: { cookie, origin: 'https://unapproved.example', 'content-type': 'application/json' }, body: '{"action":"connect"}', signal: AbortSignal.timeout(30000) })).status, 403)
assert.equal((await fetch(endpoint, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{"action":"connect"}', signal: AbortSignal.timeout(30000) })).status, 503)
const page = await fetch(origin + '/ar/admin/mailbox', { headers: { cookie }, signal: AbortSignal.timeout(60000) }); assert.equal(page.status, 200); await page.arrayBuffer()
const report = { status: 'published-awaiting-windows-connector', checkedAt: new Date().toISOString(), authenticatedPage: 200, unauthenticatedDenied: true, crossOriginDenied: true, unconfiguredConnectionExplicitlyUnavailable: true, credentialsStored: false, messagesSent: false, mailboxReadOrSendLiveTested: false, needsServerSetup: true }
await writeFile(base + '/mailbox/live-readiness.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPrelaunchGate } from '../../scripts/d1/prelaunch-gate.mjs'
import { isIsolatedStagingRequest } from '../../lib/db/staging-context.mjs'
test('prelaunch review requires gate, blocks writes and external delivery, and preserves provider guard context', async () => {
  const secret = '12'.repeat(32), env = { D1_RUNTIME_STAGE: 'isolated-staging', D1_STAGING_GATE_SECRET: secret }
  let called = 0
  const worker = createPrelaunchGate({ async fetch(request) {
    called++; assert.equal(isIsolatedStagingRequest(), true)
    assert.equal(request.headers.has('x-nilelink-staging-key'), false)
    return new Response('review')
  } })
  const request = (url, method = 'GET', auth = true) => new Request(`https://review.test${url}`, { method, headers: auth ? { 'x-nilelink-staging-key': secret } : {} })
  assert.equal((await worker.fetch(request('/ar/admin', 'GET', false), env)).status, 404)
  for (const [url, method] of [['/api/admin/payments', 'POST'], ['/api/admin/customers/a', 'DELETE'], ['/api/admin/system/d1-backups', 'POST'], ['/api/admin/system/backups', 'GET'], ['/api/cron/check-expiries', 'GET'], ['/api/auth/register', 'POST'], ['/api/admin/invoices/a/send', 'POST']]) {
    assert.equal((await worker.fetch(request(url, method), env)).status, 403)
  }
  assert.equal(called, 0)
  assert.equal((await worker.fetch(request('/api/auth/login', 'POST'), env)).status, 200)
  assert.equal((await worker.fetch(request('/ar/admin'), env)).status, 200)
  assert.equal(called, 2)
  assert.equal(isIsolatedStagingRequest(), false)
})
test('browser setup uses a bounded POST body and a signed expiring host-bound cookie without bypassing account login', async () => {
  const secret = '34'.repeat(32), env = { D1_RUNTIME_STAGE: 'isolated-staging', D1_STAGING_GATE_SECRET: secret }
  let calls = 0
  const worker = createPrelaunchGate({ async fetch(request) { calls++; assert.equal(request.headers.has('x-nilelink-staging-key'), false); return new Response('login page') } })
  const setup = (key, origin = 'null') => new Request('https://review.test/__prelaunch/access', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin }, body: new URLSearchParams({ review_key: key }) })
  assert.equal((await worker.fetch(setup('wrong'), env)).status, 404)
  assert.equal((await worker.fetch(setup(secret, 'https://other.test'), env)).status, 404)
  assert.equal((await worker.fetch(setup('x'.repeat(513)), env)).status, 404)
  const response = await worker.fetch(setup(secret), env)
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/ar/login')
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /Max-Age=7200/)
  assert.ok(!cookie.includes(secret)); assert.ok(!cookie.includes('nilelink_access_token'))
  const header = cookie.split(';')[0]
  assert.equal((await worker.fetch(new Request('https://review.test/ar/login', { headers: { cookie: header } }), env)).status, 200)
  assert.equal((await worker.fetch(new Request('https://other.test/ar/login', { headers: { cookie: header } }), env)).status, 404)
  assert.equal((await worker.fetch(new Request('https://review.test/ar/login', { headers: { cookie: header.slice(0, -1) + (header.endsWith('0') ? '1' : '0') } }), env)).status, 404)
  assert.equal((await worker.fetch(new Request('https://review.test/ar/login', { headers: { cookie: header.replace(/v1\.\d+\./, 'v1.1000000000.') } }), env)).status, 404)
  assert.equal((await worker.fetch(new Request('https://review.test/api/admin/payments', { method: 'POST', headers: { cookie: header } }), env)).status, 403)
  assert.equal(calls, 1)
})

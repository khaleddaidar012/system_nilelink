import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFirstLaunchLiveGate } from '../../scripts/d1/first-launch-live-gate.mjs'
import { isApprovedFirstLaunchRequest, isIsolatedStagingRequest } from '../../lib/db/staging-context.mjs'
const env = { JWT_SECRET: 'ab'.repeat(32), D1_RUNTIME_STAGE: 'first-launch-live', D1_ACTIVATION_CONFIRMED: 'true', DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', D1_RESOURCE_ACCOUNT: 'f882b38e4571e0141cb6353f5a271af7', D1_RESOURCE_DATABASE: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', D1_RESOURCE_FILES: 'nilelink-production-files', D1_BACKUP_SCOPE: 'first-launch', NEXT_PUBLIC_APP_URL: 'https://nilelink-system.mohamedznaty55.workers.dev', DB: { prepare() {} }, D1_PREVIEW_FILES: { get() {} }, D1_BACKUPS: { get() {} } }
test('approved custom domain and legacy host work while spoofed hosts and cross-origin mutations stay blocked', async () => {
  const worker = createFirstLaunchLiveGate({ fetch() { return new Response('application') } })
  const canonical = 'https://nilelinklogistics.com'
  for (const publicOrigin of [canonical, env.NEXT_PUBLIC_APP_URL]) {
    const configured = { ...env, NEXT_PUBLIC_APP_URL: publicOrigin }
    for (const host of [canonical, env.NEXT_PUBLIC_APP_URL]) assert.equal((await worker.fetch(new Request(host), configured)).status, 200)
    assert.equal((await worker.fetch(new Request('https://nilelinklogistics.com.evil.test'), configured)).status, 503)
    assert.equal((await worker.fetch(new Request(canonical + '/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.test' } }), configured)).status, 403)
    assert.equal((await worker.fetch(new Request(canonical + '/api/auth/login', { method: 'POST', headers: { origin: canonical } }), configured)).status, 200)
  }
  assert.equal((await worker.fetch(new Request(canonical), { ...env, NEXT_PUBLIC_APP_URL: 'https://evil.test' })).status, 503)
})
test('activation requires every pinned resource and explicit confirmation; request headers cannot activate it', async () => {
  const worker = createFirstLaunchLiveGate({ fetch() { throw Error('Must not run') } })
  for (const key of ['JWT_SECRET', 'D1_RUNTIME_STAGE', 'D1_ACTIVATION_CONFIRMED', 'DATABASE_PROVIDER', 'D1_MIGRATION_PREVIEW', 'D1_RESOURCE_ACCOUNT', 'D1_RESOURCE_DATABASE', 'D1_RESOURCE_FILES', 'D1_BACKUP_SCOPE', 'NEXT_PUBLIC_APP_URL', 'DB', 'D1_PREVIEW_FILES', 'D1_BACKUPS']) {
    assert.equal((await worker.fetch(new Request(env.NEXT_PUBLIC_APP_URL), { ...env, [key]: undefined })).status, 503)
  }
  assert.equal((await worker.fetch(new Request('https://another.test'), env)).status, 503)
})
test('live gate enables application dispatch, retains app authorization and blocks deferred delivery and legacy agents', async () => {
  let calls = 0
  const worker = createFirstLaunchLiveGate({ async fetch(request) {
    calls++; assert.equal(isApprovedFirstLaunchRequest(), true); assert.equal(isIsolatedStagingRequest(), false)
    return new Response(request.headers.get('cookie') ? 'authorized by app' : 'Authentication required', { status: request.headers.get('cookie') ? 200 : 401 })
  } })
  const req = (pathname, method = 'GET', headers = {}) => new Request(env.NEXT_PUBLIC_APP_URL + pathname, { method, headers })
  assert.equal((await worker.fetch(req('/api/admin/invoices', 'POST'), env)).status, 401)
  const result = await worker.fetch(req('/api/admin/invoices', 'POST', { cookie: 'account-session', origin: env.NEXT_PUBLIC_APP_URL }), env)
  assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/)
  assert.equal((await worker.fetch(req('/api/admin/payments', 'POST', { origin: 'https://evil.test' }), env)).status, 403)
  assert.equal((await worker.fetch(req('/api/admin/invoices/a/send', 'POST'), env)).status, 503)
  assert.equal((await worker.fetch(req('/api/admin/system/backups'), env)).status, 404)
  assert.equal((await worker.fetch(req('/api/seed'), env)).status, 404)
  assert.equal(calls, 2); assert.equal(isApprovedFirstLaunchRequest(), false)
})
test('retired demo credential is refused without changing the account, and new password hash releases it', async () => {
  const storedHash = 'salt:old-demo-derived-hash'
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(storedHash))), byte => byte.toString(16).padStart(2, '0')).join('')
  let currentHash = storedHash, calls = 0
  const settings = { ...env, DB: { prepare() { return { bind() { return this }, async first() { return { passwordHash: currentHash } } } } } }
  const worker = createFirstLaunchLiveGate({ fetch() { calls++; return new Response('Normal login handler') } }, { retiredFingerprints: [fingerprint] })
  const request = () => new Request(env.NEXT_PUBLIC_APP_URL + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'demo@example.test', password: 'some password' }) })
  assert.equal((await worker.fetch(request(), settings)).status, 403); assert.equal(calls, 0)
  currentHash = 'salt:new-user-authorized-password-hash'
  assert.equal((await worker.fetch(request(), settings)).status, 200); assert.equal(calls, 1)
})

test('explicit email activation dispatches validation to handlers without allowing seed or legacy agents', async () => {
  const worker = createFirstLaunchLiveGate({ fetch() { return Response.json({ validatedByApplication: true }, { status: 400 }) } })
  const enabled = { ...env, EMAIL_DELIVERY_ENABLED: 'true' }
  for (const pathname of ['/api/contact', '/api/quote', '/api/auth/forgot-password', '/api/auth/send-otp', '/api/admin/invoices/a/send']) {
    assert.equal((await worker.fetch(new Request(env.NEXT_PUBLIC_APP_URL + pathname, { method: 'POST' }), enabled)).status, 400)
  }
  assert.equal((await worker.fetch(new Request(env.NEXT_PUBLIC_APP_URL + '/api/seed'), enabled)).status, 404)
})

test('empty notification acknowledgement is normalized to JSON while specific and malformed bodies stay intact', async () => {
  const worker = createFirstLaunchLiveGate({ async fetch(request) { return Response.json({ body: await request.text(), contentType: request.headers.get('content-type') }) } })
  const url = env.NEXT_PUBLIC_APP_URL + '/api/portal/notifications/mark-read'
  for (const input of [undefined, new ReadableStream({ start(controller) { controller.close() } })]) {
    const request = new Request(url, { method: 'POST', ...(input ? { body: input, duplex: 'half' } : {}) })
    const result = await (await worker.fetch(request, env)).json()
    assert.equal(result.body, '{}'); assert.equal(result.contentType, 'application/json')
  }
  for (const body of ['{"notificationId":"specific"}', 'not-json']) {
    const result = await (await worker.fetch(new Request(url, { method: 'POST', body }), env)).json()
    assert.equal(result.body, body)
  }
})

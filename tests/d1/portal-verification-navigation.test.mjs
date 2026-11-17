import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refreshVerifiedPortalSession } from '../../lib/auth/portal-verification-navigation.ts'

test('portal entry refreshes cookies before checking authoritative verification and does not require WhatsApp', async () => {
  const calls = []
  await refreshVerifiedPortalSession(async (url, options) => {
    calls.push({ url, ...options })
    if (url === '/api/auth/refresh') return Response.json({ success: true })
    return Response.json({ authenticated: true, user: { emailVerified: true, whatsappVerified: false }, customer: { accountStatus: 'unverified' } })
  })
  assert.deepEqual(calls.map(call => call.url), ['/api/auth/refresh', '/api/auth/me'])
  assert.equal(calls[0].method, 'POST')
  for (const call of calls) { assert.equal(call.cache, 'no-store'); assert.equal(call.credentials, 'same-origin') }
})

test('failed refresh, unverified or unavailable account cannot continue to the portal', async () => {
  let calls = 0
  await assert.rejects(() => refreshVerifiedPortalSession(async () => { calls++; return new Response(null, { status: 401 }) }), /SESSION_REFRESH_FAILED/)
  assert.equal(calls, 1)
  for (const data of [{ authenticated: false }, { authenticated: true, user: { emailVerified: false } }]) {
    await assert.rejects(() => refreshVerifiedPortalSession(async url => Response.json(url === '/api/auth/refresh' ? { success: true } : data)), /EMAIL_VERIFICATION_REQUIRED/)
  }
})

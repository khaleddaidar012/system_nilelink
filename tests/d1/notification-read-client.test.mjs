import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markPortalNotificationsRead } from '../../lib/notifications/mark-read.ts'
test('notification read acknowledgement persists through the authenticated API without cached requests', async () => {
  let call
  await markPortalNotificationsRead(async (url, options) => { call = { url, ...options }; return Response.json({ success: true }) })
  assert.equal(call.url, '/api/portal/notifications/mark-read'); assert.equal(call.method, 'POST')
  assert.equal(call.credentials, 'same-origin'); assert.equal(call.cache, 'no-store')
})
test('unavailable, unauthorized or unsuccessful read acknowledgement cannot silently clear the badge', async () => {
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 503 }), Response.json({ success: false })]) {
    await assert.rejects(() => markPortalNotificationsRead(async () => response), /NOTIFICATIONS_NOT_MARKED_READ/)
  }
  await assert.rejects(() => markPortalNotificationsRead(async () => { throw new Error('connection lost') }), /connection lost/)
})

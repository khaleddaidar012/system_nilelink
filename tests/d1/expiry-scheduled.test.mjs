import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runScheduledExpiry } from '../../scripts/expiry-scheduled.mjs'
import { expiryNotification } from '../../lib/cron/expiry-notification.ts'

test('scheduler invokes authenticated internal scan and surfaces failures', async () => {
  let called = false
  const worker = { async fetch(request, env, ctx) {
    called = true
    assert.equal(new URL(request.url).pathname, '/api/cron/check-expiries')
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.get('authorization'), 'Bearer fixture')
    return Response.json({ success: true, results: { conflicts: 0, requiresReview: 0 } })
  } }
  await runScheduledExpiry(worker, { CRON_SECRET: 'fixture' }, {})
  assert.equal(called, true)
  await assert.rejects(runScheduledExpiry(worker, {}, {}), /CRON_SECRET/)
  await assert.rejects(runScheduledExpiry({ fetch: async () => new Response('', { status: 500 }) }, { CRON_SECRET: 'fixture' }, {}), /HTTP 500/)
})

test('alert contains company, document, category, date, actual remaining days and renewal action', () => {
  const note = expiryNotification('License', 'import_card', 'Example Co', '2030-05-01', 7)
  for (const value of ['License', 'import_card', 'Example Co', '2030-05-01', '7', 'رفع نسخة مجددة']) assert.ok(note.message.includes(value))
  assert.ok(expiryNotification('License', 'import_card', 'Example Co', '2030-05-01', -2).message.includes('منتهي منذ 2'))
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStagingGate } from '../../scripts/d1/staging-gate.mjs'
import { isIsolatedStagingRequest } from '../../lib/db/staging-context.mjs'
import { getDatabaseProvider } from '../../lib/db/provider.ts'

test('staging entry rejects unauthenticated requests before application or bindings, including assets', async () => {
  let calls = 0
  const gate = createStagingGate({ fetch() { calls++; return new Response('private') } })
  const env = { D1_RUNTIME_STAGE: 'isolated-staging', D1_STAGING_GATE_SECRET: 'a'.repeat(64) }
  for (const path of ['/', '/api/auth/me', '/_next/static/chunk.js', '/fonts/font.ttf']) {
    assert.equal((await gate.fetch(new Request('https://test.invalid' + path), env, {})).status, 404)
  }
  assert.equal((await gate.fetch(new Request('https://test.invalid'), {}, {})).status, 503)
  assert.equal(calls, 0)
})

test('staging context reaches the built application only within the authenticated request', async () => {
  const keys = ['DATABASE_PROVIDER', 'NODE_ENV', 'D1_MIGRATION_PREVIEW']
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    Object.assign(process.env, { DATABASE_PROVIDER: 'd1', NODE_ENV: 'production', D1_MIGRATION_PREVIEW: 'true' })
    assert.throws(getDatabaseProvider, /local preview/)
    const gate = createStagingGate({ async fetch(request) {
      await new Promise(resolve => setTimeout(resolve, 5))
      assert.equal(getDatabaseProvider(), 'd1')
      assert.equal(request.headers.has('x-nilelink-staging-key'), false)
      return new Response('authenticated')
    } })
    const env = { D1_RUNTIME_STAGE: 'isolated-staging', D1_STAGING_GATE_SECRET: 'a'.repeat(64) }
    const authenticated = () => new Request('https://test.invalid/api/auth/me', { headers: { 'x-nilelink-staging-key': env.D1_STAGING_GATE_SECRET } })
    const work = gate.fetch(authenticated(), env, {})
    assert.equal(isIsolatedStagingRequest(), false)
    assert.throws(getDatabaseProvider, /local preview/)
    assert.equal((await gate.fetch(new Request('https://test.invalid/api/auth/me'), env, {})).status, 404)
    const response = await work
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(isIsolatedStagingRequest(), false)
    assert.throws(getDatabaseProvider, /local preview/)
    for (const path of ['/api/seed', '/api/cron/check-expiries', '/api/auth/send-otp', '/api/admin/invoices/id/send', '/api/admin/system/backups']) {
      assert.equal((await gate.fetch(new Request('https://test.invalid' + path, { headers: authenticated().headers }), env, {})).status, 403)
    }
    assert.equal((await gate.fetch(new Request('https://test.invalid/ar/admin/system/backups', { headers: authenticated().headers }), env, {})).status, 200)
    assert.equal((await gate.fetch(new Request('https://test.invalid/ar/admin/system/backups', { method: 'POST', headers: authenticated().headers }), env, {})).status, 403)
  } finally { for (const key of keys) if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key] }
})

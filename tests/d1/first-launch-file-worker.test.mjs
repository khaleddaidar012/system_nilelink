import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFirstLaunchFileWorker } from '../../scripts/d1/first-launch-file-worker.mjs'
import { digest } from '../../scripts/d1/cloud-backup-core.mjs'

test('first-launch transfer authenticates, pins objects and verifies idempotent bytes without overwrites', async () => {
  const bytes = new TextEncoder().encode('original file'), key = '12'.repeat(32)
  const object = { destinationKey: '_nilelink_d1_preview/file', size: bytes.length, sha256: await digest(bytes) }
  let stored, puts = 0
  const body = (value, metadata = {}) => ({ size: value.length, customMetadata: metadata, arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) })
  const env = { TRANSFER_KEY: key, SOURCE: { get: async () => body(bytes) }, DESTINATION: {
    get: async () => stored || null,
    put: async (name, data, options) => {
      assert.equal(name, object.destinationKey)
      assert.equal(options.onlyIf.etagDoesNotMatch, '*')
      assert.ok(!stored); puts++; stored = body(data, options.customMetadata); return {}
    },
  } }
  const worker = createFirstLaunchFileWorker([object])
  const request = (url, authorized = true) => new Request(`https://transfer.test${url}`, { method: 'POST', headers: authorized ? { authorization: `Bearer ${key}` } : {} })
  assert.equal((await worker.fetch(request('/copy/0', false), env)).status, 404)
  assert.equal((await worker.fetch(request('/copy/1'), env)).status, 404)
  assert.equal((await worker.fetch(request('/copy/0'), env)).status, 200)
  assert.equal((await worker.fetch(request('/copy/0'), env)).status, 200)
  assert.equal(puts, 1)
  stored = body(new Uint8Array(bytes.length), { sha256: object.sha256 })
  assert.equal((await worker.fetch(request('/copy/0'), env)).status, 409)
  assert.equal(puts, 1)
})

test('corrupt source bytes cannot create a destination object', async () => {
  const bytes = new TextEncoder().encode('good'), key = '34'.repeat(32)
  const worker = createFirstLaunchFileWorker([{ destinationKey: 'fixed', size: bytes.length, sha256: await digest(bytes) }])
  let puts = 0
  const env = { TRANSFER_KEY: key, SOURCE: { get: async () => ({ size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes.length).buffer }) }, DESTINATION: { get: async () => null, put: async () => { puts++ } } }
  const result = await worker.fetch(new Request('https://transfer.test/copy/0', { method: 'POST', headers: { authorization: `Bearer ${key}` } }), env)
  assert.equal(result.status, 409); assert.equal(puts, 0)
})

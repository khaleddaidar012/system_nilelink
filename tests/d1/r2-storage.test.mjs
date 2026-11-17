import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createR2PreviewStorage } from '../../lib/storage/r2-preview-storage.ts'
import { putPreviewFile, readPreviewOrSourceFile, removePreviewFile } from '../../lib/storage/d1-preview-storage.ts'

const bundle = await build({ entryPoints: ['tests/d1/fixtures/storage-worker.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*', '@opennextjs/cloudflare'] })
const script = bundle.outputFiles[0].text
const options = { modules: true, script, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'], r2Buckets: { D1_PREVIEW_FILES: 'preview-fixture', D1_SOURCE_FILES: 'source-fixture' }, outboundService() { throw new Error('External network forbidden in storage fixture') } }
const url = key => `http://fixture.local/?key=${encodeURIComponent(key)}`
const put = (instance, key, body) => instance.dispatchFetch(url(key), { method: 'PUT', body, headers: { 'Content-Type': 'application/pdf' } })

test('real Worker R2 upload survives restart, matches hash and never overwrites a concurrent winner', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-r2-preview-test-'))
  let instance
  try {
    instance = new Miniflare({ ...options, r2Persist: directory })
    const key = 'clients/fixture/documents/persistent.pdf', bytes = '%PDF fixture Arabic file'
    const responses = await Promise.all([put(instance, key, bytes), put(instance, key, 'losing bytes')])
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
    const winner = responses[0].status === 200 ? bytes : 'losing bytes'
    const data = await responses.find(response => response.status === 200).json()
    assert.equal(data.fileHash, createHash('sha256').update(winner).digest('hex'))
    await instance.dispose(); instance = new Miniflare({ ...options, r2Persist: directory })
    const download = await instance.dispatchFetch(url(key))
    assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/pdf'); assert.equal(await download.text(), winner)
    assert.equal((await put(instance, key, 'overwrite after restart')).status, 409)
    assert.equal(await (await instance.dispatchFetch(url(key))).text(), winner)
  } finally {
    await instance?.dispose()
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('nilelink-r2-preview-test-'))
    await rm(directory, { recursive: true, force: true })
  }
})

test('source files remain byte-identical after preview upload and cleanup; corrupt preview never falls back', async () => {
  const instance = new Miniflare({ ...options, r2Persist: false })
  try {
    const source = await instance.getR2Bucket('D1_SOURCE_FILES'), preview = await instance.getR2Bucket('D1_PREVIEW_FILES')
    const key = 'clients/source/documents/original.pdf'
    await source.put(key, 'source bytes', { httpMetadata: { contentType: 'application/pdf' } })
    assert.equal(await (await instance.dispatchFetch(url(key))).text(), 'source bytes')
    assert.equal((await put(instance, key, 'preview bytes')).status, 200)
    assert.equal(await (await instance.dispatchFetch(url(key))).text(), 'preview bytes')
    await preview.put('_nilelink_d1_preview/' + key, 'corrupt bytes', { customMetadata: { sha256: 'wrong' } })
    const failed = await instance.dispatchFetch(url(key)); assert.equal(failed.status, 409); assert.match((await failed.json()).error, /integrity/)
    assert.equal((await instance.dispatchFetch(url(key), { method: 'DELETE' })).status, 200)
    assert.equal(await (await source.get(key)).text(), 'source bytes')
    assert.equal(await preview.get('_nilelink_d1_preview/' + key), null)
    assert.equal(await (await instance.dispatchFetch(url(key))).text(), 'source bytes')
    for (const bad of ['../outside', 'a/../b', '/absolute', 'file:stream', 'a\\b', 'a//b']) assert.equal((await put(instance, bad, 'invalid')).status, 409)
    assert.equal((await source.list()).objects.length, 1)
  } finally { await instance.dispose() }
})

test('missing or shared bucket binding fails closed; bucket failure never reads the source', async () => {
  assert.throws(() => createR2PreviewStorage({}), /binding is required/)
  const bucket = { async get() { throw new Error('preview unavailable') }, async put() {}, async delete() {} }
  assert.throws(() => createR2PreviewStorage({ D1_PREVIEW_FILES: bucket, D1_SOURCE_FILES: bucket }), /distinct/)
  let reads = 0
  const storage = createR2PreviewStorage({ D1_PREVIEW_FILES: bucket, D1_SOURCE_FILES: { async get() { reads++; return null } } })
  await assert.rejects(storage.get('valid/key'), /preview unavailable/)
  assert.equal(reads, 0)
})

test('application storage gateway selects request bindings explicitly and refuses missing or invalid modes', async () => {
  const instance = new Miniflare({ ...options, r2Persist: false })
  const key = Symbol.for('__cloudflare-context__'), previousContext = globalThis[key], previousMode = process.env.D1_STORAGE_MODE
  try {
    const preview = await instance.getR2Bucket('D1_PREVIEW_FILES')
    globalThis[key] = { env: { D1_PREVIEW_FILES: preview }, cf: {}, ctx: {} }
    process.env.D1_STORAGE_MODE = 'r2-preview'
    await putPreviewFile(Buffer.from('gateway fixture'), 'clients/gateway/file', 'application/pdf')
    assert.deepEqual((await readPreviewOrSourceFile('clients/gateway/file')).body, Buffer.from('gateway fixture'))
    assert.equal((await preview.get('_nilelink_d1_preview/clients/gateway/file')).httpMetadata.contentType, 'application/pdf')
    assert.equal(await removePreviewFile('clients/gateway/file'), true)
    globalThis[key] = { env: {}, cf: {}, ctx: {} }
    await assert.rejects(putPreviewFile(Buffer.from('no disk fallback'), 'clients/gateway/missing'), /binding is required/)
    process.env.D1_STORAGE_MODE = 'typo'
    await assert.rejects(readPreviewOrSourceFile('clients/gateway/file'), /Invalid D1_STORAGE_MODE/)
  } finally {
    if (previousMode === undefined) delete process.env.D1_STORAGE_MODE; else process.env.D1_STORAGE_MODE = previousMode
    if (previousContext === undefined) delete globalThis[key]; else globalThis[key] = previousContext
    await instance.dispose()
  }
})

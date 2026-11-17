import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { putPreviewFile, readPreviewOrSourceFile, removePreviewFile } from '../../lib/storage/d1-preview-storage.ts'

const originalCwd = process.cwd()
let directory
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nilelink-d1-preview-test-'))
  process.chdir(directory)
})
after(async () => {
  process.chdir(originalCwd)
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('nilelink-d1-preview-test-'))
  await rm(directory, { recursive: true, force: true })
})

test('default preview writes and reads its private local object without touching source storage', async () => {
  const bytes = Buffer.from('%PDF fixture bytes')
  const result = await putPreviewFile(bytes, 'clients/fixture/documents/file.pdf')
  assert.equal(result.fileHash, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(result.fileSize, bytes.length)
  const actual = await readPreviewOrSourceFile('clients/fixture/documents/file.pdf')
  assert.deepEqual(actual.body, bytes)
})

test('a repeated preview key cannot overwrite bytes already stored', async () => {
  await assert.rejects(putPreviewFile(Buffer.from('overwrite'), 'clients/fixture/documents/file.pdf'), /EEXIST/)
  assert.deepEqual((await readPreviewOrSourceFile('clients/fixture/documents/file.pdf')).body, Buffer.from('%PDF fixture bytes'))
})

test('preview storage rejects traversal, absolute paths and Windows alternate streams', async () => {
  for (const key of ['../outside', '/absolute', 'C:\\outside', 'file:stream', 'clients/../outside', 'null\0file']) {
    await assert.rejects(putPreviewFile(Buffer.from('invalid'), key))
    assert.equal(await removePreviewFile(key), false)
  }
})

test('preview cleanup only deletes its local object and treats missing local keys idempotently', async () => {
  await putPreviewFile(Buffer.from('keep'), 'clients/fixture/documents/keep.pdf')
  assert.equal(await removePreviewFile('clients/fixture/documents/file.pdf'), true)
  assert.equal(await removePreviewFile('clients/fixture/documents/file.pdf'), true)
  assert.deepEqual((await readPreviewOrSourceFile('clients/fixture/documents/keep.pdf')).body, Buffer.from('keep'))
})

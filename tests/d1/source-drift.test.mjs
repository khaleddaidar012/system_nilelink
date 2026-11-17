import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BSON } from 'mongodb'
import { sha256 } from '../../scripts/d1/snapshot.mjs'
import { compareSourceSnapshots } from '../../scripts/d1/compare-source-snapshots.mjs'

async function fixture(t, collections, database = 'fixture') {
  const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-source-drift-'))
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('nilelink-source-drift-'))
    await rm(directory, { recursive: true, force: true })
  })
  const manifest = { formatVersion: 1, status: 'complete', database, collections: [] }
  for (const [index, [name, documents]] of Object.entries(collections).entries()) {
    const file = `collection-${index}.jsonl`
    const content = documents.map(document => {
      const bytes = BSON.serialize(document)
      return JSON.stringify({ bson: bytes.toString('base64'), sha256: sha256(bytes) }) + '\n'
    }).join('')
    await writeFile(path.join(directory, file), content)
    manifest.collections.push({ name, file, count: documents.length, type: 'collection', sha256: sha256(content) })
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
  return directory
}

test('matching raw exports never certify write freeze or production', async t => {
  const left = await fixture(t, { users: [{ _id: 'a', privateValue: 'never-output' }] })
  const right = await fixture(t, { users: [{ _id: 'a', privateValue: 'never-output' }] })
  const result = await compareSourceSnapshots(left, right)
  assert.equal(result.status, 'identical-exports')
  assert.equal(result.writeFreezeProven, false)
  assert.equal(result.productionCertified, false)
  assert.ok(!JSON.stringify(result).includes('never-output'))
})

test('detects edits with unchanged counts and added or removed empty collections', async t => {
  const left = await fixture(t, { users: [{ _id: 'a', value: 1 }], customers: [] })
  const right = await fixture(t, { users: [{ _id: 'a', value: 2 }], payments: [] })
  const result = await compareSourceSnapshots(left, right)
  assert.equal(result.status, 'source-drift-detected')
  assert.deepEqual(result.collections.map(row => [row.name, row.status]), [
    ['customers', 'removed-collection'], ['payments', 'added-collection'], ['users', 'changed'],
  ])
})

test('rejects different source databases and corrupted snapshot bytes', async t => {
  const left = await fixture(t, { users: [{ _id: 'a' }] })
  const right = await fixture(t, { users: [{ _id: 'a' }] }, 'other')
  await assert.rejects(compareSourceSnapshots(left, right), /same source database/)
  await writeFile(path.join(left, 'collection-0.jsonl'), 'corrupted\n')
  await assert.rejects(compareSourceSnapshots(left, left), /checksum/)
})

import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { BSON } from 'mongodb'
import { sha256 } from '../../scripts/d1/snapshot.mjs'
import { inventorySnapshotFiles } from '../../scripts/d1/file-inventory.mjs'
import { stagingConfig, prepareStagingTarget, verifyStagingTarget } from '../../scripts/d1/staging-target.mjs'

const directories = []
async function temporary() { const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-preflight-test-')); directories.push(directory); return directory }
async function snapshot(collections) {
  const directory = await temporary(), manifest = { formatVersion: 1, status: 'complete', collections: [] }
  for (const [index, [name, documents]] of Object.entries(collections).entries()) {
    const content = documents.map(document => { const bytes = BSON.serialize(document); return JSON.stringify({ bson: bytes.toString('base64'), sha256: sha256(bytes) }) + '\n' }).join('')
    const file = `collection-${index}.jsonl`; await writeFile(path.join(directory, file), content)
    manifest.collections.push({ name, type: 'collection', file, count: documents.length, sha256: sha256(content) })
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest)); return directory
}
after(async () => { for (const directory of directories) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('nilelink-preflight-test-'))
  await rm(directory, { recursive: true, force: true })
} })

test('file inventory includes archives and shared objects, preserves literal URLs and never modifies source', async () => {
  const key = 'clients/fixture/documents/original.pdf', url = 'https://old-account.example.test/file?private=fixture'
  const directory = await snapshot({ documents: [{ _id: 'active', storageKey: key, fileSize: 7, fileHash: sha256('fixture'), fileUrl: url }, { _id: 'archived', storageKey: key, fileSize: 7, isArchived: true }], customerrequests: [{ _id: 'request', attachments: [{ fileUrl: '/legacy-attachment' }] }], invoices: [{ _id: 'invoice', pdfUrl: '/old-pdf' }], users: [{ _id: 'user', avatarUrl: '/old-avatar' }] })
  const before = await readFile(path.join(directory, 'collection-0.jsonl'))
  const result = await inventorySnapshotFiles(directory)
  assert.equal(result.documentRecords, 2); assert.equal(result.uniqueObjects, 1); assert.equal(result.issues.length, 0)
  assert.deepEqual(result.objects[0].documentIds, ['active', 'archived'])
  assert.deepEqual(result.objects[0].archivedDocumentIds, ['archived'])
  assert.equal(result.objects[0].byteVerification, 'pending-source-read')
  assert.equal(result.additionalReferences.length, 4); assert.equal(result.additionalReferences[0].value, url)
  assert.equal(result.cutoverCertified, false); assert.equal(result.destinationModified, false)
  assert.deepEqual(await readFile(path.join(directory, 'collection-0.jsonl')), before)
})

test('local file verification checks every distinct key, size and hash without copying or rewriting bytes', async () => {
  const root = await temporary(); await mkdir(path.join(root, 'clients'), { recursive: true })
  await writeFile(path.join(root, 'clients/a'), 'fixture'); await writeFile(path.join(root, 'clients/b'), 'no hash')
  const directory = await snapshot({ documents: [{ _id: 'a', storageKey: 'clients/a', fileSize: 7, fileHash: sha256('fixture') }, { _id: 'b', storageKey: 'clients/b', fileSize: 7 }] })
  const result = await inventorySnapshotFiles(directory, { localRoot: root })
  assert.equal(result.issues.length, 0)
  assert.equal(result.objects[0].byteVerification, 'matches-recorded-size-and-sha256')
  assert.equal(result.objects[1].byteVerification, 'matches-size-no-source-hash-recorded')
  assert.equal(result.objects[1].observedSha256, sha256('no hash'))
  assert.equal(await readFile(path.join(root, 'clients/a'), 'utf8'), 'fixture')
})

test('conflicting file metadata, missing bytes and unsafe local paths require review without hiding documents', async () => {
  const root = await temporary(); await writeFile(path.join(root, 'corrupt'), 'changed')
  const directory = await snapshot({ documents: [{ _id: 'a', storageKey: 'corrupt', fileSize: 7, fileHash: sha256('fixture') }, { _id: 'b', storageKey: 'corrupt', fileSize: 8 }, { _id: 'c', storageKey: 'missing', fileSize: 4 }, { _id: 'd', storageKey: '../outside', fileSize: 4 }, { _id: 'e', fileSize: -1 }, { _id: 'f', storageKey: 'bad-hash', fileSize: 1, fileHash: 'malformed' }] })
  const result = await inventorySnapshotFiles(directory, { localRoot: root })
  assert.equal(result.documentRecords, 6)
  for (const code of ['CONFLICTING_FILE_METADATA', 'FILE_BYTES_MISMATCH', 'FILE_UNAVAILABLE_OR_UNSAFE', 'INVALID_DOCUMENT_KEY', 'INVALID_DOCUMENT_HASH']) assert.ok(result.issues.some(issue => issue.code === code), code)
  assert.equal(result.cutoverCertified, false)
  assert.equal(await readFile(path.join(root, 'corrupt'), 'utf8'), 'changed')
})

const target = { accountId: '1234567890abcdef1234567890abcdef', databaseId: '12345678-1234-1234-1234-1234567890ab', databaseName: 'nilelink-d1-staging-fixture' }
test('staging configuration requires an explicit destination account and real staging identity', () => {
  const config = stagingConfig(target)
  assert.equal(config.account_id, target.accountId); assert.equal(config.d1_databases[0].database_id, target.databaseId)
  assert.equal(config.main, undefined); assert.equal(config.vars, undefined); assert.equal(config.r2_buckets, undefined)
  for (const patch of [{ accountId: undefined }, { accountId: '0'.repeat(32) }, { databaseId: '00000000-0000-0000-0000-000000000000' }, { databaseName: 'nilelink-production' }, { accountId: 'https://other' }]) assert.throws(() => stagingConfig({ ...target, ...patch }))
})

test('prepared target cannot silently use another account or an edited database binding', async () => {
  const parent = await temporary(), directory = await prepareStagingTarget(target, parent)
  assert.equal((await verifyStagingTarget(directory, target.accountId)).remoteWritesExecuted, false)
  await assert.rejects(verifyStagingTarget(directory, 'abcdef1234567890abcdef1234567890'), /account mismatch/)
  const filename = path.join(directory, 'wrangler.json'), config = JSON.parse(await readFile(filename, 'utf8'))
  config.d1_databases[0].database_id = 'abcdef12-1234-1234-1234-1234567890ab'
  await writeFile(filename, JSON.stringify(config))
  await assert.rejects(verifyStagingTarget(directory, target.accountId), /configuration changed/)
  assert.match(await readFile(path.join(directory, 'empty.env'), 'utf8'), /Intentionally empty/)
})

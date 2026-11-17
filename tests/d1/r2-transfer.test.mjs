import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { Miniflare } from 'miniflare'
import { readTransferPlan, copyVerifiedFiles, transferR2Plan } from '../../scripts/d1/transfer-r2.mjs'

const accountId = '1234567890abcdef1234567890abcdef', directories = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'nilelink-r2-transfer-test-')); directories.push(workspace)
  const relative = '.private/d1-migration/source/file-backups/fixture', source = path.join(workspace, relative), objects = []
  await mkdir(path.join(source, 'objects/clients'), { recursive: true })
  for (const name of ['first', 'second']) {
    const bytes = Buffer.from('fixture bytes ' + name), key = 'clients/' + name
    await writeFile(path.join(source, 'objects', key), bytes)
    objects.push({ key, size: bytes.length, sha256: hash(bytes), documentIds: [name] })
  }
  const manifest = { formatVersion: 1, scope: 'available-local-source-files-only', sourceManifestSha256: 'fixture-source-hash', objects, omittedObjects: [{ key: 'unavailable', verification: 'missing' }], restoreDrill: { verifiedObjects: 2 } }
  await writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest)); await writeFile(path.join(source, 'BACKUP_STATUS'), 'verified-available-files-only\n')
  const filename = path.join(workspace, '.private/d1-migration/plan.json')
  const plan = { formatVersion: 1, scope: 'staging-files-only', accountId, bucketName: 'nilelink-d1-staging-files', sourceBackupDirectory: relative, sourceManifestSha256: manifest.sourceManifestSha256,
    objects: objects.map(object => ({ ...object, destinationKey: '_nilelink_d1_preview/' + object.key })), omittedObjects: manifest.omittedObjects, overwriteAllowed: false }
  await writeFile(filename, JSON.stringify(plan))
  return { workspace, filename, source, plan, prepared: await readTransferPlan(filename, accountId, workspace) }
}
async function simulator() { return new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2025-04-01', r2Buckets: { FILES: 'r2-transfer-fixture' }, r2Persist: false }) }
after(async () => { for (const directory of directories) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith('nilelink-r2-transfer-test-'))
  await rm(directory, { recursive: true, force: true })
} })

test('R2 copy reads bytes back, preserves source and reruns without another put', async () => {
  const fixtureData = await fixture(), instance = await simulator()
  try {
    const raw = await instance.getR2Bucket('FILES'); let puts = 0
    const bucket = { get: key => raw.get(key), put: (...args) => { puts++; return raw.put(...args) } }
    const first = await copyVerifiedFiles(fixtureData.prepared, bucket)
    assert.equal(first.length, 2); assert.equal(puts, 2)
    const replay = await copyVerifiedFiles(fixtureData.prepared, bucket)
    assert.equal(puts, 2); assert.ok(replay.every(object => object.status === 'already-identical'))
    for (const object of fixtureData.plan.objects) assert.equal(hash(await readFile(path.join(fixtureData.source, 'objects', object.key))), object.sha256)
  } finally { await instance.dispose() }
})

test('conflicting destination objects are never overwritten or deleted', async () => {
  const { prepared, plan } = await fixture(), instance = await simulator()
  try {
    const bucket = await instance.getR2Bucket('FILES'), key = plan.objects[0].destinationKey
    await bucket.put(key, 'other bytes', { customMetadata: { sha256: hash('other bytes') } })
    await assert.rejects(copyVerifiedFiles(prepared, bucket), /conflicts/)
    assert.equal(await (await bucket.get(key)).text(), 'other bytes')
    assert.equal((await bucket.list()).objects.length, 1)
  } finally { await instance.dispose() }
})

test('uncertain put responses and concurrent identical copies never replace the stored winner', async () => {
  const { prepared } = await fixture(), instance = await simulator()
  try {
    const raw = await instance.getR2Bucket('FILES'); let puts = 0
    const uncertain = { get: key => raw.get(key), async put(...args) { puts++; await raw.put(...args); throw new Error('lost response') } }
    const result = await copyVerifiedFiles(prepared, uncertain)
    assert.ok(result.every(object => object.status === 'verified-after-uncertain-response')); assert.equal(puts, 2)
    await copyVerifiedFiles(prepared, uncertain); assert.equal(puts, 2)
  } finally { await instance.dispose() }
  const concurrent = await simulator()
  try {
    const bucket = await concurrent.getR2Bucket('FILES')
    const results = await Promise.all([copyVerifiedFiles(prepared, bucket), copyVerifiedFiles(prepared, bucket)])
    assert.ok(results.every(rows => rows.length === 2)); assert.equal((await bucket.list()).objects.length, 2)
  } finally { await concurrent.dispose() }
})

test('changed backup bytes stop before the first destination write', async () => {
  const { prepared, source, plan } = await fixture(), instance = await simulator()
  try {
    await writeFile(path.join(source, 'objects', plan.objects[1].key), 'corrupt')
    const bucket = await instance.getR2Bucket('FILES')
    await assert.rejects(copyVerifiedFiles(prepared, bucket), /Source backup object/)
    assert.equal((await bucket.list()).objects.length, 0)
  } finally { await instance.dispose() }
})

test('account, bucket and object changes cannot redirect the transfer; default mode only prepares', async () => {
  const { workspace, filename, plan } = await fixture()
  const result = await transferR2Plan(filename, accountId, { workspace })
  assert.equal(result.report.status, 'prepared-only'); assert.equal(result.report.verifiedObjects.length, 0)
  await assert.rejects(readTransferPlan(filename, 'abcdef1234567890abcdef1234567890', workspace), /destination/)
  for (const changed of [{ ...plan, bucketName: 'production-files' }, { ...plan, objects: [{ ...plan.objects[0], destinationKey: 'unprefixed' }, plan.objects[1]] }, { ...plan, sourceBackupDirectory: '../../outside' }]) {
    await writeFile(filename, JSON.stringify(changed)); await assert.rejects(readTransferPlan(filename, accountId, workspace))
  }
})

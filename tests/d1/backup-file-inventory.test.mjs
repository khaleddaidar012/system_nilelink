import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupFileInventory } from '../../scripts/d1/backup-file-inventory.mjs'

const spec = { scope: 'first-launch-snapshot-only', inventoryMode: 'database-documents-and-pending-v1', omittedFiles: [] }
const document = (id, key, extra = {}) => ({ id, data: JSON.stringify({ _id: id, storageKey: key, fileSize: 12, fileHash: 'ab'.repeat(32), ...extra }) })
const db = (rows, pending = []) => ({ tables: [{ name: 'documents', rows }, { name: '_nilelink_storage_pending', rows: pending }] })
test('discovers new and archived documents from captured rows instead of a static list', () => {
  const inventory = backupFileInventory(db([document('a', 'old'), document('b', 'new', { isArchived: true })]), { ...spec, files: [] })
  assert.deepEqual(inventory.files.map(row => row.key), ['_nilelink_d1_preview/new', '_nilelink_d1_preview/old'])
})
test('deduplicates identical references and preserves pending uploads without pretending to know their bytes', () => {
  const inventory = backupFileInventory(db([document('a', 'same'), document('b', 'same')], [{ storageKey: 'same' }, { storageKey: 'pending' }]), spec)
  assert.equal(inventory.files.length, 2)
  assert.equal(inventory.files.find(row => row.key.endsWith('/pending')).pendingUpload, true)
  assert.equal(inventory.files.find(row => row.key.endsWith('/pending')).sha256, null)
  assert.equal(inventory.files.find(row => row.key.endsWith('/same')).sha256, 'ab'.repeat(32))
})
test('rejects conflicting, unsafe, identity-mismatched or unverified references', () => {
  for (const rows of [[document('a', '../unsafe')], [document('a', 'same'), document('b', 'same', { fileSize: 13 })], [document('a', 'ok', { fileHash: null })], [document('a', 'ok', { _id: 'other' })]]) assert.throws(() => backupFileInventory(db(rows), spec))
  assert.throws(() => backupFileInventory(db([], [{ storageKey: '../unsafe' }]), spec))
  assert.throws(() => backupFileInventory({ tables: [] }, spec))
})
test('only the exact authorized demo record may be omitted; changing its hash requires backup', () => {
  const id = '6a8c9593de654054f48051af', key = 'clients/6a8c9593de654054f48051ad/documents/cr_alex_2026.pdf'
  const omitted = { key, documentIds: [id], verification: 'unavailable-or-unsafe' }
  const reviewed = { ...spec, omittedFiles: [omitted] }
  const rows = [document(id, key, { fileSize: 2097152, fileHash: null })]
  assert.deepEqual(backupFileInventory(db(rows), reviewed).omittedFiles, [omitted])
  assert.throws(() => backupFileInventory(db(rows), spec))
  const changed = backupFileInventory(db([document(id, key, { fileSize: 2097152 })]), reviewed)
  assert.equal(changed.files.length, 1); assert.equal(changed.omittedFiles.length, 0)
  assert.equal(backupFileInventory(db([]), reviewed).omittedFiles.length, 0)
})

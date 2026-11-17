import { documentStorageKey } from '../../lib/storage/document-key.mjs'
import { PREVIEW_OBJECT_PREFIX } from '../../lib/storage/preview-object-prefix.mjs'

const mode = 'database-documents-and-pending-v1'
function safeKey(key) {
  if (typeof key !== 'string' || !key || key.startsWith('/') || /[\\:\x00-\x1f]/.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe backup file key')
  return key
}
/** Derive the complete referenced inventory from the captured database, including
 * archived documents and uploads whose metadata has not committed yet. */
export function backupFileInventory(database, spec) {
  if (spec.inventoryMode !== mode) return { files: spec.files, omittedFiles: spec.omittedFiles }
  if (spec.scope !== 'first-launch-snapshot-only') throw new Error('Dynamic inventory scope is not approved')
  const documents = database.tables.find(table => table.name === 'documents')
  const pending = database.tables.find(table => table.name === '_nilelink_storage_pending')
  if (!documents || !pending) throw new Error('Document or pending-upload inventory unavailable')
  const files = new Map(), omittedFiles = []
  for (const row of documents.rows) {
    const doc = JSON.parse(row.data), key = safeKey(documentStorageKey(doc))
    if (doc._id !== row.id) throw new Error('Document identity differs from row')
    // This is the single original demo exception authorized by the user. A
    // changed/reuploaded record cannot inherit the exception merely by name.
    if (row.id === '6a8c9593de654054f48051af' && key === 'clients/6a8c9593de654054f48051ad/documents/cr_alex_2026.pdf' && doc.fileSize === 2097152 && !doc.fileHash) {
      const exception = spec.omittedFiles.find(item => item.key === key && item.documentIds?.includes(row.id))
      if (!exception) throw new Error('Demo exception is not recorded')
      omittedFiles.push(exception); continue
    }
    if (!Number.isSafeInteger(doc.fileSize) || doc.fileSize < 0 || doc.fileSize > 10 * 1024 * 1024 || typeof doc.fileHash !== 'string' || !/^[a-f0-9]{64}$/i.test(doc.fileHash)) throw new Error('Document file metadata requires review')
    const object = { key: PREVIEW_OBJECT_PREFIX + key, size: doc.fileSize, sha256: doc.fileHash.toLowerCase() }
    const prior = files.get(object.key)
    if (prior && (prior.size !== object.size || prior.sha256 !== object.sha256)) throw new Error('Conflicting file references')
    files.set(object.key, object)
  }
  for (const row of pending.rows) {
    const key = PREVIEW_OBJECT_PREFIX + safeKey(row.storageKey)
    if (!files.has(key)) files.set(key, { key, size: null, sha256: null, pendingUpload: true })
  }
  if (files.size > 5000) throw new Error('File inventory limit exceeded')
  return { files: [...files.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0), omittedFiles }
}

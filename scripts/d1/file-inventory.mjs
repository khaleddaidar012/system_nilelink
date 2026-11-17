import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateSnapshot, readRecords } from './snapshot.mjs'
import { documentStorageKey } from '../../lib/storage/document-key.mjs'

/** Read-only source inventory. Preserves keys/URLs and includes archived documents. */
export async function inventorySnapshotFiles(directory, { localRoot } = {}) {
  const { manifest, files } = await validateSnapshot(directory)
  const objects = new Map(), references = [], issues = []
  let documents = 0
  const fileFields = /^(?:storageKey|fileUrl|pdfUrl|avatarUrl|filePath|attachmentUrl|imageUrl|logoUrl)$/i
  function inspect(value, collection, id, pointer = '') {
    if (!value || typeof value !== 'object') return
    for (const [name, item] of Object.entries(value)) {
      const location = pointer + '/' + name.replaceAll('~', '~0').replaceAll('/', '~1')
      // Document keys have an explicit mapping below; its fileUrl is still
      // inventoried because a literal old-account URL can break after cutover.
      if (fileFields.test(name) && item !== null && item !== '') {
        if (!(collection === 'documents' && pointer === '' && name === 'storageKey')) references.push({ collection, id, pointer: location, value: item, resolution: 'requires-explicit-file-or-url-mapping' })
      }
      inspect(item, collection, id, location)
    }
  }
  for (const entry of files) for await (const record of readRecords(entry.file)) {
    inspect(record.document, entry.name, record.id)
    if (entry.name !== 'documents') continue
    documents++
    const doc = record.document, key = documentStorageKey(doc)
    if (typeof key !== 'string' || !key || key.includes('\0')) { issues.push({ code: 'INVALID_DOCUMENT_KEY', id: record.id }); continue }
    const size = doc.fileSize, hash = doc.fileHash
    if (!Number.isSafeInteger(size) || size < 0) issues.push({ code: 'INVALID_DOCUMENT_SIZE', id: record.id })
    if (hash != null && hash !== '' && (typeof hash !== 'string' || !/^[a-f\d]{64}$/i.test(hash))) issues.push({ code: 'INVALID_DOCUMENT_HASH', id: record.id })
    const expectedHash = typeof hash === 'string' && /^[a-f\d]{64}$/i.test(hash) ? hash.toLowerCase() : null
    let object = objects.get(key)
    if (!object) { object = { key, expectedSize: Number.isSafeInteger(size) && size >= 0 ? size : null, expectedSha256: expectedHash, documentIds: [], legacyKeyDocumentIds: [], archivedDocumentIds: [], byteVerification: 'pending-source-read' }; objects.set(key, object) }
    else {
      if (object.expectedSize !== size || (expectedHash && object.expectedSha256 && expectedHash !== object.expectedSha256)) issues.push({ code: 'CONFLICTING_FILE_METADATA', id: record.id, key })
      if (!object.expectedSha256 && expectedHash) object.expectedSha256 = expectedHash
    }
    object.documentIds.push(record.id)
    if (!doc.storageKey) object.legacyKeyDocumentIds.push(record.id)
    if (doc.isArchived === true) object.archivedDocumentIds.push(record.id)
  }
  if (localRoot) {
    const root = await realpath(localRoot)
    for (const object of objects.values()) {
      try {
        // Local verification is explicit; no R2/S3 or URL fallback, no writes.
        if (/[\\:\x00-\x1f]/.test(object.key) || object.key.startsWith('/') || object.key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe local file key')
        const candidate = await realpath(path.resolve(root, object.key))
        const relative = path.relative(root, candidate)
        if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('File escapes local source root')
        const metadata = await stat(candidate)
        if (!metadata.isFile() || !Number.isSafeInteger(metadata.size)) throw new Error('Not an ordinary source file')
        const hash = createHash('sha256'); let bytes = 0
        for await (const chunk of createReadStream(candidate)) { hash.update(chunk); bytes += chunk.length }
        const actual = hash.digest('hex')
        object.observedSize = bytes; object.observedSha256 = actual
        if (bytes !== object.expectedSize || (object.expectedSha256 && actual !== object.expectedSha256)) { object.byteVerification = 'mismatch'; issues.push({ code: 'FILE_BYTES_MISMATCH', key: object.key }) }
        else object.byteVerification = object.expectedSha256 ? 'matches-recorded-size-and-sha256' : 'matches-size-no-source-hash-recorded'
      } catch { object.byteVerification = 'unavailable-or-unsafe'; issues.push({ code: 'FILE_UNAVAILABLE_OR_UNSAFE', key: object.key }) }
    }
  }
  const final = await validateSnapshot(directory)
  if (JSON.stringify(final.manifest) !== JSON.stringify(manifest)) throw new Error('Source manifest changed during file inventory')
  return { formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'read-only-source-file-inventory', sourceDatabase: manifest.database ?? null,
    sourceManifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    documentRecords: documents, uniqueObjects: objects.size, objects: [...objects.values()], additionalReferences: references, issues,
    pending: ['copy files to explicitly selected target account', 'compare every target object with source bytes', 'resolve legacy URLs and non-document references', 'independent file backup and restore drill'],
    sourceModified: false, destinationModified: false, cutoverCertified: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || ![1, 3].includes(args.length) || (args.length === 3 && args[1] !== '--local-root')) {
    console.log('node scripts/d1/file-inventory.mjs <snapshot-directory> [--local-root <source-files-directory>]')
    process.exitCode = args.includes('--help') ? 0 : 1
  } else try {
    const directory = await realpath(args[0]), report = await inventorySnapshotFiles(directory, { localRoot: args[2] })
    const output = path.join(directory, `file-inventory-${randomUUID()}.json`)
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    // Paths, URLs, customer IDs and checksums stay in the private report.
    console.log(JSON.stringify({ report: output, documents: report.documentRecords, uniqueObjects: report.uniqueObjects, additionalReferences: report.additionalReferences.length, issues: report.issues.length, cutoverCertified: false }))
    if (report.issues.length) process.exitCode = 1
  } catch { console.error('File inventory failed. Source files and database were not modified.'); process.exitCode = 1 }
}

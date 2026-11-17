import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, constants } from 'node:fs'
import { mkdir, realpath, copyFile, chmod, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inventorySnapshotFiles } from './file-inventory.mjs'

function relativeFile(root, key) {
  if (!key || /[\\:\x00-\x1f]/.test(key) || key.startsWith('/') || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe backup object key')
  const filename = path.resolve(root, key), relative = path.relative(root, filename)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Backup object escapes root')
  return filename
}
async function digest(filename) {
  const hash = createHash('sha256'); let bytes = 0
  for await (const chunk of createReadStream(filename)) { bytes += chunk.length; hash.update(chunk); if (bytes > 64 * 1024 * 1024) throw new Error('File exceeds backup audit limit') }
  return { bytes, sha256: hash.digest('hex') }
}

/** An additional private byte copy and disposable restore drill; never changes source files. */
export async function backupAvailableSourceFiles(snapshotDirectory, sourceRoot) {
  const directory = await realpath(snapshotDirectory), root = await realpath(sourceRoot)
  const inventory = await inventorySnapshotFiles(directory, { localRoot: root })
  const objects = inventory.objects.filter(object => object.byteVerification === 'matches-recorded-size-and-sha256')
  const total = objects.reduce((sum, object) => sum + object.observedSize, 0)
  if (objects.length > 5000 || !Number.isSafeInteger(total) || total > 64 * 1024 * 1024) throw new Error('Available file backup exceeds laboratory limit')
  const backup = path.join(directory, 'file-backups', randomUUID()), destination = path.join(backup, 'objects')
  await mkdir(destination, { recursive: true, mode: 0o700 })
  await writeFile(path.join(backup, 'BACKUP_STATUS'), 'incomplete\n', { flag: 'wx', mode: 0o600 })
  const copied = []
  for (const object of objects) {
    const source = await realpath(relativeFile(root, object.key)), relative = path.relative(root, source)
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !(await stat(source)).isFile()) throw new Error('Unsafe source file')
    const output = relativeFile(destination, object.key)
    await mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
    await copyFile(source, output, constants.COPYFILE_EXCL); await chmod(output, 0o600)
    const actual = await digest(output)
    if (actual.bytes !== object.expectedSize || actual.sha256 !== object.expectedSha256) throw new Error('Backup bytes differ from source snapshot metadata')
    copied.push({ key: object.key, size: actual.bytes, sha256: actual.sha256, documentIds: object.documentIds })
  }
  const restore = path.join(backup, 'restore-drill', randomUUID(), 'objects')
  await mkdir(restore, { recursive: true, mode: 0o700 })
  for (const object of copied) {
    const output = relativeFile(restore, object.key)
    await mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
    await copyFile(relativeFile(destination, object.key), output, constants.COPYFILE_EXCL); await chmod(output, 0o600)
    const actual = await digest(output)
    if (actual.bytes !== object.size || actual.sha256 !== object.sha256) throw new Error('Disposable file restore verification failed')
  }
  const final = await inventorySnapshotFiles(directory, { localRoot: root })
  if (final.sourceManifestSha256 !== inventory.sourceManifestSha256 || JSON.stringify(final.objects) !== JSON.stringify(inventory.objects)) throw new Error('Source files changed during backup')
  const report = { formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'available-local-source-files-only', sourceManifestSha256: inventory.sourceManifestSha256,
    documentRecords: inventory.documentRecords, inventoriedObjects: inventory.uniqueObjects, copiedObjects: copied.length, copiedBytes: total, objects: copied,
    omittedObjects: inventory.objects.filter(object => object.byteVerification !== 'matches-recorded-size-and-sha256').map(object => ({ key: object.key, verification: object.byteVerification, documentIds: object.documentIds })),
    sourceIssues: inventory.issues, allSourceFilesBackedUp: copied.length === inventory.uniqueObjects && inventory.issues.length === 0,
    restoreDrill: { scope: 'new-private-disposable-directory', verifiedObjects: copied.length, path: restore },
    encrypted: false, offDeviceCopy: false, sourceModified: false, cutoverCertified: false }
  await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(path.join(backup, 'BACKUP_STATUS'), 'verified-available-files-only\n', { mode: 0o600 })
  return { directory: backup, report }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv.includes('--help')) { console.log('node scripts/d1/file-backup.mjs <snapshot-directory> <local-source-root>'); process.exitCode = process.argv.includes('--help') ? 0 : 1 }
  else try {
    const { directory, report } = await backupAvailableSourceFiles(process.argv[2], process.argv[3])
    console.log(JSON.stringify({ directory, copiedObjects: report.copiedObjects, restoredObjects: report.restoreDrill.verifiedObjects, omittedObjects: report.omittedObjects.length, allSourceFilesBackedUp: report.allSourceFilesBackedUp, sourceModified: false }))
    if (!report.allSourceFilesBackedUp) process.exitCode = 1
  } catch { console.error('File backup/drill failed. Original files were not modified. Incomplete output must not be trusted.'); process.exitCode = 1 }
}

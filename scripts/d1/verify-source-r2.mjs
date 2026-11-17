import { createHash, randomUUID } from 'node:crypto'
import { realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { S3Client, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { inventorySnapshotFiles } from './file-inventory.mjs'

/** Reads bytes only. The injected capability has no put/delete/list operation. */
export async function verifySourceFileBytes(directory, { readObject, onProgress = () => {} }) {
  const inventory = await inventorySnapshotFiles(directory)
  const results = [], issues = [...inventory.issues]
  for (const object of inventory.objects) {
    const result = { key: object.key, documentIds: object.documentIds, expectedSize: object.expectedSize, expectedSha256: object.expectedSha256 }
    try {
      const source = await readObject(object.key)
      if (!source) { result.verification = 'missing'; issues.push({ code: 'SOURCE_R2_OBJECT_MISSING', key: object.key }) }
      else {
        if (!source.body || typeof source.body[Symbol.asyncIterator] !== 'function') throw new Error('Source body is not readable')
        const digest = createHash('sha256'); let bytes = 0
        for await (const chunk of source.body) {
          bytes += chunk.length
          if (bytes > 64 * 1024 * 1024) { source.body.destroy?.(); throw new Error('Source file exceeds audit limit') }
          digest.update(chunk)
        }
        const sha256 = digest.digest('hex')
        result.observedSize = bytes; result.observedSha256 = sha256
        if (bytes !== object.expectedSize || (source.size != null && bytes !== source.size) || (object.expectedSha256 && sha256 !== object.expectedSha256)) { result.verification = 'mismatch'; issues.push({ code: 'SOURCE_R2_BYTES_MISMATCH', key: object.key }) }
        else result.verification = object.expectedSha256 ? 'matches-recorded-size-and-sha256' : 'matches-size-no-source-hash-recorded'
      }
    } catch { result.verification = 'unreadable-or-over-limit'; issues.push({ code: 'SOURCE_R2_READ_FAILED', key: object.key }) }
    results.push(result); onProgress({ checkedObjects: results.length, totalObjects: inventory.objects.length })
  }
  const final = await inventorySnapshotFiles(directory)
  if (final.sourceManifestSha256 !== inventory.sourceManifestSha256) throw new Error('Source manifest changed during verification')
  return { formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'read-only-source-r2-byte-verification', sourceManifestSha256: inventory.sourceManifestSha256,
    documentRecords: inventory.documentRecords, uniqueObjects: inventory.uniqueObjects, results, issues,
    verifiedWithHistoricalHash: results.filter(result => result.verification === 'matches-recorded-size-and-sha256').length,
    sourceModified: false, destinationModified: false, cutoverCertified: false,
    pending: ['copy and verify every target object', 'resolve additional file URLs', 'independent file backup and restore', 'source freeze consistency'] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv.includes('--help')) { console.log('node --use-system-ca --env-file=.env.local scripts/d1/verify-source-r2.mjs <snapshot-directory>'); process.exitCode = process.argv.includes('--help') ? 0 : 1 }
  else {
    let client
    try {
      const account = process.env.R2_ACCOUNT_ID, bucket = process.env.R2_BUCKET_NAME
      if (!/^[a-f\d]{32}$/i.test(account || '') || !bucket || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('Missing source R2 configuration')
      const expectedEndpoint = `https://${account}.r2.cloudflarestorage.com`
      const endpoint = new URL(process.env.R2_ENDPOINT || expectedEndpoint)
      if (endpoint.origin !== expectedEndpoint || !['', '/'].includes(endpoint.pathname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Unexpected source endpoint')
      client = new S3Client({ region: 'auto', endpoint: expectedEndpoint, maxAttempts: 2, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } })
      // A missing/inaccessible bucket must never be reported as missing files.
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
      const directory = await realpath(process.argv[2])
      const report = await verifySourceFileBytes(directory, { readObject: async key => {
        try { const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return { body: result.Body, size: result.ContentLength } }
        catch (error) { if (error?.name === 'NoSuchKey' && error?.$metadata?.httpStatusCode === 404) return null; throw new Error('Source object read failed') }
      }, onProgress: progress => { if (progress.checkedObjects % 10 === 0 || progress.checkedObjects === progress.totalObjects) console.error(JSON.stringify({ progress })) } })
      const output = path.join(directory, `source-r2-verification-${randomUUID()}.json`)
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      console.log(JSON.stringify({ report: output, objects: report.uniqueObjects, verifiedWithHistoricalHash: report.verifiedWithHistoricalHash, issues: report.issues.length, sourceModified: false }))
      if (report.issues.length) process.exitCode = 1
    } catch { console.error('Read-only R2 verification failed. No source or destination objects were modified.'); process.exitCode = 1 }
    finally { client?.destroy() }
  }
}

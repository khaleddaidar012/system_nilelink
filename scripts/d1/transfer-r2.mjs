import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PREVIEW_OBJECT_PREFIX } from '../../lib/storage/preview-object-prefix.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function inside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Transfer path escapes private root')
  return candidate
}
function validateKey(key) {
  if (typeof key !== 'string' || !key || key.startsWith('/') || /[\\:\x00-\x1f]/.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe transfer object key')
}

/** The plan and immutable backup must agree before any remote capability is used. */
export async function readTransferPlan(filename, expectedAccountId, workspace = root) {
  const privateRoot = await realpath(path.join(workspace, '.private/d1-migration'))
  const planFile = inside(privateRoot, await realpath(filename)), plan = JSON.parse(await readFile(planFile, 'utf8'))
  if (plan.formatVersion !== 1 || plan.scope !== 'staging-files-only' || !/^[a-f\d]{32}$/i.test(expectedAccountId || '') || plan.accountId !== expectedAccountId || plan.overwriteAllowed !== false || !/^nilelink-d1-staging-files(?:-[a-z0-9]+)*$/.test(plan.bucketName || '')) throw new Error('Unreviewed staging file destination')
  if (typeof plan.sourceBackupDirectory !== 'string' || path.isAbsolute(plan.sourceBackupDirectory)) throw new Error('Invalid backup directory')
  const source = inside(privateRoot, await realpath(path.resolve(workspace, plan.sourceBackupDirectory)))
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'))
  if (manifest.formatVersion !== 1 || manifest.scope !== 'available-local-source-files-only' || manifest.sourceManifestSha256 !== plan.sourceManifestSha256 || manifest.restoreDrill?.verifiedObjects !== manifest.objects?.length || (await readFile(path.join(source, 'BACKUP_STATUS'), 'utf8')).trim() !== 'verified-available-files-only') throw new Error('Source backup is incomplete or changed')
  if (!Array.isArray(plan.objects) || plan.objects.length !== manifest.objects.length || plan.objects.length > 5000 || JSON.stringify(plan.omittedObjects) !== JSON.stringify(manifest.omittedObjects)) throw new Error('Transfer plan object inventory changed')
  const originals = new Map(manifest.objects.map(object => [object.key, object])), seen = new Set()
  let totalBytes = 0
  for (const object of plan.objects) {
    validateKey(object.key)
    if (seen.has(object.key)) throw new Error('Duplicate transfer object')
    seen.add(object.key)
    const original = originals.get(object.key)
    if (!original || original.size !== object.size || original.sha256 !== object.sha256 || JSON.stringify(original.documentIds) !== JSON.stringify(object.documentIds) || object.destinationKey !== PREVIEW_OBJECT_PREFIX + object.key || !/^[a-f\d]{64}$/.test(object.sha256) || !Number.isSafeInteger(object.size) || object.size < 0 || object.size > 10 * 1024 * 1024) throw new Error('Transfer object differs from verified backup')
    totalBytes += object.size
  }
  if (seen.size !== originals.size || totalBytes > 64 * 1024 * 1024) throw new Error('Transfer inventory exceeds reviewed limits')
  return { plan, planFile, source, totalBytes, planSha256: hash(await readFile(planFile)) }
}

async function sourceBytes(source, object) {
  const objectRoot = await realpath(path.join(source, 'objects'))
  const filename = inside(objectRoot, await realpath(path.resolve(objectRoot, object.key)))
  const info = await stat(filename)
  if (!info.isFile() || info.size !== object.size) throw new Error('Source backup object size changed')
  const bytes = await readFile(filename)
  if (bytes.length !== object.size || hash(bytes) !== object.sha256) throw new Error('Source backup object hash changed')
  return bytes
}
async function matchingObject(bucket, object) {
  const remote = await bucket.get(object.destinationKey)
  if (!remote) return false
  if (remote.size !== object.size || remote.customMetadata?.sha256 !== object.sha256) throw new Error('Destination object metadata conflicts; overwrite forbidden')
  const bytes = Buffer.from(await remote.arrayBuffer())
  if (bytes.length !== object.size || hash(bytes) !== object.sha256) throw new Error('Destination object bytes conflict; overwrite forbidden')
  return true
}

/** No delete capability; every write is atomic put-if-absent and is read back. */
export async function copyVerifiedFiles(prepared, bucket, { onVerified = () => {} } = {}) {
  const { plan, source } = prepared
  // Fail before writing the first object if any backup object has changed.
  for (const object of plan.objects) await sourceBytes(source, object)
  const results = []
  for (const object of plan.objects) {
    let status = 'already-identical'
    if (!await matchingObject(bucket, object)) {
      const bytes = await sourceBytes(source, object)
      let uncertain = false
      try {
        const result = await bucket.put(object.destinationKey, bytes, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256: object.sha256 }, httpMetadata: { contentType: 'application/octet-stream' } })
        status = result === null ? 'identical-concurrent-winner' : 'copied-and-verified'
      } catch { uncertain = true; status = 'verified-after-uncertain-response' }
      if (!await matchingObject(bucket, object)) throw new Error(uncertain ? 'Uncertain upload: destination unavailable; inspect before resuming' : 'Destination object missing after conditional upload')
    }
    const result = { key: object.key, destinationKey: object.destinationKey, size: object.size, sha256: object.sha256, status }
    results.push(result); await onVerified(result, results.length, plan.objects.length)
  }
  return results
}

export async function transferR2Plan(filename, accountId, { execute = false, workspace = root } = {}) {
  const prepared = await readTransferPlan(filename, accountId, workspace), { plan, planFile } = prepared
  for (const object of plan.objects) await sourceBytes(prepared.source, object)
  const directory = path.join(path.dirname(planFile), 'r2-transfers', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const configFile = path.join(directory, 'wrangler.json')
  const config = { name: 'nilelink-r2-staging-transfer', account_id: accountId, compatibility_date: '2025-04-01', compatibility_flags: ['nodejs_compat'], r2_buckets: [{ binding: 'D1_PREVIEW_FILES', bucket_name: plan.bucketName, remote: true }] }
  await writeFile(configFile, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
  const report = { formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'staging-r2-files-only', accountId, bucketName: plan.bucketName, sourceManifestSha256: plan.sourceManifestSha256,
    planSha256: prepared.planSha256, plannedObjects: plan.objects.length, plannedBytes: prepared.totalBytes, omittedObjects: plan.omittedObjects,
    status: 'prepared-only', verifiedObjects: [], sourceModified: false, productionCertified: false }
  const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  await save()
  if (!execute) return { directory, report }
  for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID']) if (process.env[name] && process.env[name] !== accountId) throw new Error('Environment account differs from selected destination')
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'CF_API_KEY']) if (process.env[name]) throw new Error('Unexpected auth override; use the reviewed OAuth profile')
  let proxy
  try {
    const { getPlatformProxy } = await import('wrangler')
    proxy = await getPlatformProxy({ configPath: configFile, envFiles: [], persist: false, remoteBindings: true })
    if (!proxy.env.D1_PREVIEW_FILES) throw new Error('Destination R2 binding is missing')
    report.status = 'copying-with-put-if-absent'; await save()
    await copyVerifiedFiles(prepared, proxy.env.D1_PREVIEW_FILES, { onVerified: async (object, checked, total) => {
      report.verifiedObjects.push(object); await save()
      console.error(JSON.stringify({ progress: 'r2-object-verified', checked, total }))
    } })
    const final = await readTransferPlan(filename, accountId, workspace)
    if (final.planSha256 !== prepared.planSha256) throw new Error('Transfer plan changed during copy')
    for (const object of plan.objects) {
      await sourceBytes(prepared.source, object)
      if (!await matchingObject(proxy.env.D1_PREVIEW_FILES, object)) throw new Error('Destination changed after verification')
    }
    report.status = 'all-planned-objects-compared'; report.completedAt = new Date().toISOString(); await save()
    return { directory, report }
  } catch (error) { report.status = 'stopped-needs-review'; await save(); throw error }
  finally { await proxy?.dispose() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (![3, 4].includes(args.length) || args[1] !== '--account-id' || (args.length === 4 && args[3] !== '--execute')) {
    console.log('node --use-system-ca scripts/d1/transfer-r2.mjs <private-plan.json> --account-id <selected-account-id> [--execute]'); process.exitCode = args.includes('--help') ? 0 : 1
  } else try {
    const { directory, report } = await transferR2Plan(path.resolve(args[0]), args[2], { execute: args.includes('--execute') })
    console.log(JSON.stringify({ directory, status: report.status, plannedObjects: report.plannedObjects, verifiedObjects: report.verifiedObjects.length, omittedObjects: report.omittedObjects.length, sourceModified: false }))
  } catch { console.error('R2 transfer stopped. No source files were modified. Inspect private transfer status; conflicting destination objects are never overwritten.'); process.exitCode = 1 }
}

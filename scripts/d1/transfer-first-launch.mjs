import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { readTransferPlan, copyVerifiedFiles } from './transfer-r2.mjs'
import { compareSourceSnapshots } from './compare-source-snapshots.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('Use --execute for the reviewed first-launch file destination')
for (const name of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(name)) throw new Error('Authentication overrides forbidden')
const compared = await compareSourceSnapshots(path.join(root, '.private/d1-migration/bce417f4-a391-49d0-aadf-1f34d789a529'), path.join(root, '.private/d1-migration/79642c29-36d5-4475-9c1b-353dbd581ae1'))
if (compared.status !== 'identical-exports') throw new Error('Source records changed; review file inventory again')
const prepared = await readTransferPlan(path.join(root, '.private/d1-migration/targets/9cbd1b6d-6006-4935-a08f-e3f76da748dd/r2-transfer-plan.json'), 'f882b38e4571e0141cb6353f5a271af7')
const directory = path.join(root, '.private/d1-migration/first-launch/file-transfers', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const configPath = path.join(directory, 'wrangler.json')
await writeFile(configPath, JSON.stringify({ name: 'nilelink-first-launch-file-transfer', account_id: 'f882b38e4571e0141cb6353f5a271af7', compatibility_date: '2025-04-01',
  r2_buckets: [{ binding: 'FILES', bucket_name: 'nilelink-production-files', remote: true }] }), { flag: 'wx', mode: 0o600 })
const report = { scope: 'first-launch-private-files-only', status: 'prepared', accountId: 'f882b38e4571e0141cb6353f5a271af7',
  bucketName: 'nilelink-production-files', sourceModified: false, overwriteAllowed: false, productionCertified: false,
  sourcePlanSha256: prepared.planSha256, omittedObjects: prepared.plan.omittedObjects, verifiedObjects: [] }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
let proxy
try {
  await save()
  proxy = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
  // The source plan remains unchanged. Its verified bytes are copied only to
  // the pinned new bucket binding above with conditional puts and readback.
  const result = await copyVerifiedFiles(prepared, proxy.env.FILES, { onVerified: async object => {
    report.verifiedObjects.push(object); await save()
  } })
  Object.assign(report, { status: 'all-first-launch-file-bytes-verified', result, completedAt: new Date().toISOString() })
  await save(); console.log(JSON.stringify({ directory, status: report.status, bucketName: report.bucketName, sourceModified: false,
    verifiedObjects: result.length, verifiedBytes: result.reduce((total, object) => total + object.size, 0) }))
} catch {
  report.status = 'stopped-review-required'; await save()
  console.error(JSON.stringify({ directory, status: report.status, sourceModified: false })); process.exitCode = 1
} finally { if (proxy) await proxy.dispose() }

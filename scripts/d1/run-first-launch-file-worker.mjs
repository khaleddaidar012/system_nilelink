import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTransferPlan } from './transfer-r2.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('Use --execute')
const directory = path.join(root, '.private/d1-migration/first-launch/file-worker')
const { TRANSFER_KEY } = JSON.parse(await readFile(path.join(directory, 'secrets.json'), 'utf8'))
if (!/^[a-f0-9]{64}$/.test(TRANSFER_KEY)) throw new Error('Transfer key unavailable')
const prepared = await readTransferPlan(path.join(root, '.private/d1-migration/targets/9cbd1b6d-6006-4935-a08f-e3f76da748dd/r2-transfer-plan.json'), 'f882b38e4571e0141cb6353f5a271af7')
const origin = 'https://nilelink-first-launch-file-transfer.mohamedznaty55.workers.dev'
const report = { scope: 'first-launch-file-transfer-through-authenticated-worker', status: 'running', sourceModified: false,
  productionCertified: false, verifiedObjects: 0, verifiedBytes: 0, omittedObjects: prepared.plan.omittedObjects.length }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
try {
  await save()
  if ((await fetch(`${origin}/copy/0`, { method: 'POST', signal: AbortSignal.timeout(30000) })).status !== 404) throw new Error('Authentication guard failed')
  for (let index = 0; index < prepared.plan.objects.length; index++) {
    const response = await fetch(`${origin}/copy/${index}`, { method: 'POST', headers: { authorization: `Bearer ${TRANSFER_KEY}` }, signal: AbortSignal.timeout(120000) })
    if (response.status !== 200) throw new Error('File copy not verified; review before retry')
    const result = await response.json()
    if (result.verified !== true || result.index !== index || result.bytes !== prepared.plan.objects[index].size) throw new Error('Unexpected transfer receipt')
    report.verifiedObjects++; report.verifiedBytes += result.bytes; await save()
  }
  report.status = 'all-first-launch-file-bytes-verified'; report.completedAt = new Date().toISOString()
  await save(); console.log(JSON.stringify(report))
} catch {
  report.status = 'stopped-review-required'; await save(); console.error(JSON.stringify(report)); process.exitCode = 1
}

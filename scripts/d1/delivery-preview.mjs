import { Miniflare } from 'miniflare'
import { fileURLToPath } from 'node:url'
import { WorkflowStore } from '../../lib/workflows/runtime.ts'
import { processDeliveryJob } from '../../lib/workflows/delivery-worker.ts'

const id = process.argv[2]
if (!id || !/^[a-f0-9]{24}$/.test(id) || process.argv.length !== 3) {
  console.log('node --import ./tests/d1/register-typescript.mjs scripts/d1/delivery-preview.mjs <job-id>\nLocal PDF/email artifact only. Never sends email or connects to remote D1.')
} else {
  const instance = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local delivery preview") } }', compatibilityDate: '2025-04-01', d1Databases: { DB: '00000000-0000-0000-0000-000000000000' }, d1Persist: fileURLToPath(new URL('../../.wrangler/state/v3/d1', import.meta.url)) })
  try { console.log(JSON.stringify(await processDeliveryJob(new WorkflowStore(await instance.getD1Database('DB')), id))) }
  catch { console.error('Local delivery preview failed or requires reconciliation. No live email transport is configured.'); process.exitCode = 1 }
  finally { await instance.dispose() }
}

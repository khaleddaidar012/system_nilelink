import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = path.join(root, '.private/d1-migration/pdf-worker-fixtures')
await mkdir(directory, { recursive: true, mode: 0o700 })
const bundle = await build({ absWorkingDir: root, entryPoints: ['tests/d1/fixtures/pdf-worker.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'], define: { 'import.meta.url': '"file:///bundle/pdf-audit.mjs"' }, banner: { js: 'import { createRequire as __pdfAuditRequire } from "node:module"; const require = __pdfAuditRequire("file:///bundle/pdf-audit.mjs");' }, plugins: [{ name: 'isolated-pdf-assets', setup(plugin) {
  // The fixture supplies assets explicitly. Do not pull in Next/dev-context code.
  plugin.onResolve({ filter: /^@opennextjs\/cloudflare$/ }, () => ({ path: 'context-not-used', namespace: 'pdf-fixture' }))
  plugin.onLoad({ filter: /.*/, namespace: 'pdf-fixture' }, () => ({ contents: 'export function getCloudflareContext() { throw new Error("Fixture must supply PDF assets explicitly") }' }))
} }] })
const instance = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat', 'enable_nodejs_fs_module'], assets: { directory: path.join(root, 'public'), binding: 'ASSETS', routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } }, outboundService() { throw new Error('External network forbidden in PDF fixture') } })
const results = []
try {
  for (const kind of ['invoice', 'statement']) {
    const response = await instance.dispatchFetch(`http://fixture.local/${kind}`)
    if (!response.ok) { results.push({ kind, status: response.status, error: await response.text() }); continue }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid PDF response')
    await writeFile(path.join(directory, kind + '.pdf'), bytes, { mode: 0o600 })
    results.push({ kind, status: response.status, bytes: bytes.length })
  }
} finally { await instance.dispose() }
await writeFile(path.join(directory, 'report.json'), JSON.stringify({ runtime: 'local-workerd', scope: 'isolated-real-pdf-generators-with-assets-binding', externalNetworkAllowed: false, fullAppRoutingExercised: false, deployed: false, productionCertified: false, results }, null, 2), { mode: 0o600 })
console.log(JSON.stringify(results, null, 2))
if (results.some(result => result.status !== 200)) process.exitCode = 1



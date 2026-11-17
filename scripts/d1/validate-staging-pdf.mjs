import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const target = await realpath(process.argv[2] ?? '')
if (!target.startsWith(path.join(root, '.private/d1-migration/worker-staging') + path.sep)) throw new Error('A private fixture target is required')
const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'))
const origin = manifest.deployedOrigin
if (manifest.scope !== 'synthetic-worker-e2e' || manifest.sourceRecordsCopied !== false || manifest.accountId !== 'f882b38e4571e0141cb6353f5a271af7' || manifest.databaseId !== '7aa12b1a-5015-4f99-b028-d65de7a260bd' || origin !== 'https://nilelink-d1-staging-e2e.mohamedznaty55.workers.dev') throw new Error('Verified isolated deployment identity is required')
const credentials = JSON.parse(await readFile(path.join(target, 'credentials.json'), 'utf8'))
if (credentials.actors.some(actor => !actor.email.endsWith('@example.test'))) throw new Error('Synthetic accounts only')
const directory = path.join(target, 'pdf-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'deployed-cloudflare-worker-pdf-regression', origin, startedAt: new Date().toISOString(), repetitions: 5, results: [], status: 'running', sourceDataModified: false, externalMessagesSent: false, productionCertified: false }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
async function fetchPath(url, { cookie, input, gate = true } = {}) {
  return fetch(origin + url, { redirect: 'manual', method: input === undefined ? 'GET' : 'POST', headers: { ...(gate ? { 'x-nilelink-staging-key': credentials.gateSecret } : {}), ...(cookie ? { cookie } : {}), ...(input === undefined ? {} : { 'content-type': 'application/json' }) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(120000) })
}
async function login(actor) {
  const response = await fetchPath('/api/auth/login', { input: { identifier: actor.email, password: credentials.password } })
  assert.equal(response.status, 200, 'Synthetic login failed')
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.match(cookie, /nilelink_access_token=/)
  await response.arrayBuffer()
  return cookie
}
try {
  await save()
  const invoicePath = `/api/admin/invoices/${credentials.invoiceId}/pdf`
  const statementPath = `/api/admin/customers/${credentials.actors[1].customerId}/statement/pdf?currency=EGP`
  for (const url of [invoicePath, statementPath]) {
    const response = await fetchPath(url, { gate: false }); assert.equal(response.status, 404); await response.arrayBuffer()
  }
  const admin = await login(credentials.actors[0]), other = await login(credentials.actors[2])
  const foreign = await fetchPath(`/api/portal/invoices/${credentials.invoiceId}/pdf`, { cookie: other })
  assert.equal(foreign.status, 404); await foreign.arrayBuffer()
  const forbidden = await fetchPath(statementPath, { cookie: other })
  assert.equal(forbidden.status, 403); await forbidden.arrayBuffer()
  report.authorizationChecksPassed = 4
  for (let iteration = 1; iteration <= report.repetitions; iteration++) {
    for (const [kind, url] of [['invoice', invoicePath], ['statement', statementPath]]) {
      const started = performance.now()
      const response = await fetchPath(url, { cookie: admin })
      if (response.status !== 200) throw new Error(`${kind} iteration ${iteration} returned HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`)
      assert.match(response.headers.get('content-type') ?? '', /^application\/pdf/)
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
      assert.ok(bytes.subarray(-64).includes(Buffer.from('%%EOF')))
      assert.ok(bytes.length > 1000 && bytes.length < 5 * 1024 * 1024)
      if (iteration === 1) await writeFile(path.join(directory, kind + '.pdf'), bytes, { mode: 0o600 })
      report.results.push({ kind, iteration, status: response.status, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), elapsedMs: Math.round(performance.now() - started) })
      await save(); console.log(JSON.stringify({ kind, iteration, status: response.status, bytes: bytes.length }))
    }
  }
  report.status = 'all-pdf-requests-passed'
} catch (error) { report.status = 'stopped-on-failure'; report.error = String(error.message).slice(0, 1500); process.exitCode = 1 }
finally { report.completedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ directory, status: report.status, successfulPdfRequests: report.results.length, authorizationChecksPassed: report.authorizationChecksPassed ?? 0 })) }

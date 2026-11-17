import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateSnapshot, readRecords } from './snapshot.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const target = path.join(root, '.private/d1-migration/first-launch/application')
const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'))
const secrets = JSON.parse(await readFile(path.join(target, 'secrets.json'), 'utf8'))
const origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
if (manifest.scope !== 'first-launch-protected-review' || manifest.origin !== origin || manifest.databaseId !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb') throw new Error('Wrong protected first-launch target')
const { files } = await validateSnapshot(path.join(root, '.private/d1-migration/79642c29-36d5-4475-9c1b-353dbd581ae1'))
let admin, invoice
for await (const row of readRecords(files.find(file => file.name === 'users').file)) if (!admin && row.document.role === 'super_admin' && row.document.status === 'active') admin = row.document
for await (const row of readRecords(files.find(file => file.name === 'invoices').file)) if (!invoice && row.document.customerId && !row.document.archivedAt) invoice = row.document
if (!admin || !invoice) throw new Error('Reviewed fixture identities not available')
// Short-lived operator test token only; never changes a password, logs into a
// third-party service, stores the token, or prints customer/admin identities.
const token = await new SignJWT({ userId: admin._id, email: admin.email, firstName: admin.firstName, lastName: admin.lastName, role: admin.role, tokenType: 'access' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(secrets.JWT_SECRET))
const directory = path.join(target, 'validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'first-launch-protected-review-http', results: [], status: 'running', businessWritesIntended: false, invalidWriteAttemptsExpectedRejected: true, passwordsChanged: false, authenticationMethod: 'short-lived-local-operator-test-token', passwordLoginTested: false, productionCertified: false }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
const call = (url, { gate = true, session = true, method = 'GET' } = {}) => fetch(origin + url, { method, redirect: 'manual', headers: { ...(gate ? { 'x-nilelink-staging-key': secrets.D1_STAGING_GATE_SECRET } : {}), ...(session ? { cookie: `nilelink_access_token=${token}` } : {}) }, signal: AbortSignal.timeout(90000) })
async function check(name, action) { await action(); report.results.push({ name, passed: true }); await save(); console.log(JSON.stringify({ name, passed: true })) }
try {
  await save()
  await check('public requests and unauthenticated sessions cannot expose records', async () => {
    assert.equal((await call('/ar/login', { gate: false, session: false })).status, 404)
    assert.equal((await call('/api/admin/invoices', { gate: false })).status, 404)
    assert.equal((await call('/api/admin/invoices', { session: false })).status, 401)
  })
  await check('authorized administrative APIs read the new D1 destination', async () => {
    for (const url of ['/api/auth/me', '/api/admin/customers', '/api/admin/requests', '/api/admin/invoices']) {
      const response = await call(url)
      assert.equal(response.status, 200)
      assert.match(response.headers.get('cache-control'), /no-store/)
      assert.ok(await response.json())
    }
  })
  await check('Arabic administrative page renders behind the review gate', async () => {
    const response = await call('/ar/admin')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/html/)
    assert.ok((await response.text()).length > 1000)
  })
  await check('source-data invoice and statement PDFs render without write requests', async () => {
    for (const [name, url] of [['invoice', `/api/admin/invoices/${invoice._id}/pdf`], ['statement', `/api/admin/customers/${invoice.customerId}/statement/pdf?currency=EGP`]]) {
      const response = await call(url)
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/pdf/)
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(bytes.length > 1000)
      assert.match(bytes.subarray(-1024).toString(), /%%EOF/)
      await writeFile(path.join(directory, `${name}.pdf`), bytes, { mode: 0o600 })
    }
  })
  await check('review gate rejects invalid write attempts, mail, cron and backup controls', async () => {
    for (const [url, method] of [['/api/admin/payments', 'POST'], ['/api/admin/customers/not-a-record', 'DELETE'], ['/api/cron/check-expiries', 'GET'], ['/api/admin/system/d1-backups', 'GET'], [`/api/admin/invoices/${invoice._id}/send`, 'POST']]) assert.equal((await call(url, { method })).status, 403)
  })
  report.status = 'all-first-launch-review-checks-passed'; report.completedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ directory, ...report }))
} catch {
  report.status = 'failed-review-required'; await save(); console.error(JSON.stringify({ directory, status: report.status, passedGroups: report.results.length })); process.exitCode = 1
}

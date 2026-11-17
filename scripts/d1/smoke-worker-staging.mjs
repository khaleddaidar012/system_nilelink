import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(process.argv[2] ?? '')
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
if (manifest.scope !== 'synthetic-worker-e2e' || manifest.databaseName !== 'nilelink-d1-staging-e2e') throw new Error('An isolated fixture target is required')
const credentials = JSON.parse(await readFile(path.join(directory, 'credentials.json'), 'utf8'))
const base = process.argv[3] ?? 'http://127.0.0.1:8791'
if (base !== 'http://127.0.0.1:8791' && (base !== manifest.deployedOrigin || !/^https:\/\/nilelink-d1-staging-e2e\.[a-z0-9-]+\.workers\.dev$/.test(base))) throw new Error('Origin must be loopback or the verified staging deployment recorded in the private manifest')
const results = [], runId = randomUUID()
const report = { scope: 'synthetic-next-worker-http', origin: base, runId, startedAt: new Date().toISOString(), status: 'running', results, productionCertified: false }
const save = () => writeFile(path.join(directory, 'smoke-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
async function check(name, callback) {
  try { await callback(); results.push({ name, passed: true }); console.log(JSON.stringify({ check: name, passed: true })); await save() }
  catch (error) { results.push({ name, passed: false, error: String(error.message).slice(0, 1200) }); throw error }
}
async function call(url, { cookie, body, method, gate = true, headers = {} } = {}) {
  return fetch(base + url, { redirect: 'manual', method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { ...(gate ? { 'x-nilelink-staging-key': credentials.gateSecret } : {}), ...(cookie ? { cookie } : {}), ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) })
}
async function json(response, expected = 200) {
  const text = await response.text()
  assert.equal(response.status, expected, `HTTP ${response.status}: ${text.slice(0, 600)}`)
  return JSON.parse(text)
}
const cookies = []
try {
  await check('gate blocks HTML, API and assets without the private key', async () => {
    for (const url of ['/ar/login', '/api/auth/me', '/fonts/Cairo-Regular.ttf']) assert.equal((await call(url, { gate: false })).status, 404)
  })
  await check('Next renders login and denies an unauthenticated API session', async () => {
    const page = await call('/ar/login')
    assert.equal(page.status, 200)
    const html = await page.text(); assert.match(html, /<html/)
    const asset = html.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/)?.[1]
    assert.ok(asset, 'A Next script must be present in the rendered page')
    assert.equal((await call(asset.replaceAll('&amp;', '&'))).status, 200)
    assert.equal((await call('/api/auth/me')).status, 401)
  })
  await check('four synthetic users can log in through the actual Next route', async () => {
    for (const actor of credentials.actors) {
      const response = await call('/api/auth/login', { body: { identifier: actor.email, password: credentials.password } })
      await json(response)
      const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      assert.match(cookie, /nilelink_access_token=/); cookies.push(cookie)
    }
  })
  const [admin, a, b, restricted] = cookies, customerId = credentials.actors[1].customerId
  await check('sessions and admin/customer permissions use the D1 fixture users', async () => {
    await json(await call('/api/auth/me', { cookie: a }))
    await json(await call('/api/admin/customers', { cookie: admin }))
    assert.equal((await call('/api/admin/customers', { cookie: a })).status, 403)
  })
  let inquiry, quote
  await check('customer creates a request and the other tenant cannot read it', async () => {
    inquiry = (await json(await call('/api/portal/requests', { cookie: a, body: { services: [{ serviceKey: 'sea_freight', details: { origin: 'Cairo', destination: 'Rome' } }], operationType: 'none', subject: 'Synthetic E2E ' + runId, description: 'Synthetic shipment', priority: 'medium' } }), 201)).request
    assert.ok(inquiry._id)
    const other = await json(await call('/api/portal/requests', { cookie: b }))
    assert.equal(JSON.stringify(other).includes(inquiry._id), false)
  })
  await check('admin creates a quote; tenant B is denied and tenant A accepts', async () => {
    quote = (await json(await call('/api/admin/quotes', { cookie: admin, body: { requestId: inquiry._id, customerId, currency: 'EUR', items: inquiry.services.map(id => ({ requestServiceId: id, serviceKey: 'sea_freight', basePrice: 100, additionalCharges: 10, discount: 5, finalPrice: 105, breakdown: [{ description: 'Synthetic shipping', basePrice: 100, additionalCharges: 10 }] })) } }), 201)).quote
    assert.ok(quote._id)
    assert.ok([403, 404].includes((await call(`/api/portal/quotes/${quote._id}`, { cookie: b })).status))
    await json(await call(`/api/portal/quotes/${quote._id}/accept`, { cookie: a, body: {} }))
  })
  let document
  const bytes = Buffer.from('%PDF-1.7\nSynthetic E2E ' + runId)
  await check('multipart upload stores bytes in R2 and tenant-scoped download matches SHA256', async () => {
    const form = new FormData(); form.append('files', new File([bytes], 'synthetic.pdf', { type: 'application/pdf' })); form.append('categories', 'commercial_register'); form.append('titles', 'Synthetic E2E')
    document = (await json(await call('/api/portal/documents/upload', { cookie: a, body: form }), 201)).documents[0]
    assert.ok(document.id)
    assert.ok([403, 404].includes((await call(`/api/portal/documents/${document.id}/download`, { cookie: b })).status))
    const response = await call(`/api/portal/documents/${document.id}/download`, { cookie: a })
    assert.equal(response.status, 200)
    const actual = Buffer.from(await response.arrayBuffer())
    assert.equal(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(bytes).digest('hex'))
  })
  await check('restricted staff cannot approve documents; admin approval succeeds', async () => {
    const body = { status: 'approved', title: 'Synthetic E2E approved', expiryDate: '2035-01-01T00:00:00.000Z' }
    assert.equal((await call(`/api/admin/documents/${document.id}/verify`, { cookie: restricted, body })).status, 403)
    await json(await call(`/api/admin/documents/${document.id}/verify`, { cookie: admin, body }))
  })
  await check('payment is atomic and a repeated key does not charge twice', async () => {
    const options = { cookie: admin, headers: { 'Idempotency-Key': 'e2e-' + runId }, body: { customerId, invoiceId: credentials.invoiceId, amount: 1, currency: 'EGP', paymentMethod: 'bank_transfer' } }
    await json(await call('/api/admin/payments', options), 201)
    assert.equal((await json(await call('/api/admin/payments', options))).replayed, true)
  })
  await check('invoice and customer statement PDFs render through Next and Worker ASSETS', async () => {
    for (const [name, url] of [['invoice', `/api/admin/invoices/${credentials.invoiceId}/pdf`], ['statement', `/api/admin/customers/${customerId}/statement/pdf?currency=EGP`]]) {
      const response = await call(url, { cookie: admin })
      assert.equal(response.status, 200, response.status === 200 ? undefined : `${name} PDF HTTP ${response.status}: ${(await response.text()).slice(0, 800)}`)
      const pdf = Buffer.from(await response.arrayBuffer()); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 1000)
      await writeFile(path.join(directory, name + '-smoke.pdf'), pdf, { mode: 0o600 })
    }
    assert.ok([403, 404].includes((await call(`/api/portal/invoices/${credentials.invoiceId}/pdf`, { cookie: b })).status))
  })
  await check('seed, cron and external message routes remain disabled in this environment', async () => {
    for (const url of ['/api/seed', '/api/cron/check-expiries', `/api/admin/invoices/${credentials.invoiceId}/send`]) assert.equal((await call(url, { cookie: admin, method: 'POST' })).status, 403)
  })
  report.status = 'all-checks-passed'
} catch { report.status = 'stopped-on-failure'; process.exitCode = 1 }
finally { report.completedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ status: report.status, passed: results.filter(result => result.passed).length, total: results.length, directory })) }

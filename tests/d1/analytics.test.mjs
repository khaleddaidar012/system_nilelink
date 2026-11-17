import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { SignJWT } from 'jose'
import { createHash } from 'node:crypto'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { WorkflowStore, timestamped } from '../../lib/workflows/runtime.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { GET as dashboard } from '../../app/api/analytics/dashboard/route.ts'
import { POST as track } from '../../app/api/analytics/track/route.ts'
import { GET as accountOverview } from '../../app/api/admin/analytics/overview/route.ts'
import { GET as overview } from '../../app/api/admin/overview/route.ts'
import { GET as seed } from '../../app/api/seed/route.ts'

let instance, db, store, staffCookie, customerCookie
const id = n => n.toString(16).padStart(24, '0')
const keys = ['DATABASE_PROVIDER', 'D1_MIGRATION_PREVIEW', 'NODE_ENV', 'JWT_SECRET', 'ANALYTICS_ENABLED', 'ANALYTICS_SECRET', 'ANALYTICS_PASSWORD']
const env = Object.fromEntries(keys.map(key => [key, process.env[key]])), contextKey = Symbol.for('__cloudflare-context__'), oldContext = globalThis[contextKey]
const today = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'), day = 86400000
async function insert(table, data) { await db.prepare(`INSERT INTO ${table} (id,data) VALUES (?,?)`).bind(data._id, JSON.stringify(data)).run() }
async function count() { return (await db.prepare('SELECT count(*) AS n FROM analytics_events').first()).n }
const request = (cookie, body, headers = {}) => new Request('http://localhost/api/analytics', { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
before(async () => {
  Object.assign(process.env, { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', NODE_ENV: 'test', JWT_SECRET: 'analytics-local-fixture-key' })
  delete process.env.ANALYTICS_ENABLED; delete process.env.ANALYTICS_SECRET; delete process.env.ANALYTICS_PASSWORD
  instance = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'analytics-fixture' }, d1Persist: false })
  db = await instance.getD1Database('DB'); await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  store = new WorkflowStore(db); globalThis[contextKey] = { env: { DB: db }, cf: {}, ctx: {} }
  await insert('customers', timestamped({ _id: id(1), companyName: 'Fixture', contactEmail: 'fixture@example.test', commercialRegisterNumber: 'CR-1', accountStatus: 'active' }))
  for (const [n, role] of [[2, 'staff'], [3, 'customer_admin']]) {
    const data = timestamped({ _id: id(n), email: `${n}@example.test`, firstName: 'Test', lastName: 'User', role, status: 'active', passwordHash: 'private-fixture-hash', ...(n === 3 ? { customerId: id(1) } : {}) })
    await insert('users', data)
    const cookie = `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: data._id, email: data.email, firstName: data.firstName, lastName: data.lastName, role, customerId: data.customerId })}`
    if (n === 2) staffCookie = cookie; else customerCookie = cookie
  }
  const events = [
    { page: '/en/', ipHash: 'a', device: 'desktop', country: 'EG', createdAt: new Date(today - day).toISOString() },
    { page: '/en/services', ipHash: 'a', device: 'desktop', country: 'EG', createdAt: new Date(today).toISOString() },
    { page: '/en/services', ipHash: 'b', device: 'mobile', country: 'GB', createdAt: new Date(today).toISOString() },
    { page: '/en/contact', ipHash: 'a', device: 'tablet', country: 'EG', createdAt: new Date(today - 6 * day).toISOString() },
    { page: '/future', ipHash: 'future', device: 'desktop', createdAt: new Date(Date.now() + day).toISOString() },
    { page: '/invalid', ipHash: 'invalid', device: 'desktop', createdAt: 'invalid-date' },
  ]
  for (const event of events) await insert('analytics_events', timestamped({ type: 'page_view', ...event }))
  await insert('analytics_events', timestamped({ type: 'contact_submit', page: '/en/contact', ipHash: 'c', device: 'mobile' }))
})
after(async () => {
  await instance?.dispose()
  if (oldContext === undefined) delete globalThis[contextKey]; else globalThis[contextKey] = oldContext
  for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
})
test('website analytics aggregate distinct visitors, UTC days, pages and devices without exposing raw events', async () => {
  const result = await dashboard(request(staffCookie))
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
  const json = await result.json(), data = json.data
  assert.equal(data.totalVisitors, 2); assert.equal(data.totalPageViews, 4); assert.equal(data.todayVisitors, 2)
  assert.equal(data.last7Days.length, 7); assert.equal(data.last7Days.at(-1).value, 2)
  assert.equal(data.topPages[0].path, '/en/services'); assert.equal(data.topPages[0].views, 2)
  assert.equal(data.devices.length, 3); assert.equal(data.requiresReview, 1); assert.equal(data.timezone, 'UTC')
  assert.equal(data.countries.find(country => country.country === 'EG').percentage, 50)
  assert.equal('events' in data, false); assert.equal(JSON.stringify(json).includes('private-fixture-hash'), false)
  assert.equal(result.headers.get('cache-control'), 'no-store')
})
test('analytics require a current staff user or an explicitly configured analytics session', async () => {
  assert.equal((await dashboard(request())).status, 401)
  assert.equal((await dashboard(request(customerCookie))).status, 403)
  const user = await store.read('users', id(2))
  await store.commit({ updates: [{ before: user, patch: { status: 'inactive' } }] })
  try { assert.equal((await dashboard(request(staffCookie))).status, 401) }
  finally { await store.commit({ updates: [{ before: await store.read('users', id(2)), patch: { status: 'active' } }] }) }
  const token = await new SignJWT({ authenticated: true }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode('fallback'))
  assert.equal((await dashboard(request(`analytics_session=${token}`))).status, 401)
  process.env.ANALYTICS_SECRET = 'configured-local-analytics-secret'
  const valid = await new SignJWT({ authenticated: true }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.ANALYTICS_SECRET))
  assert.equal((await dashboard(request(`analytics_session=${valid}`))).status, 200)
})
test('tracking hashes addresses, derives device/country and preserves no caller-supplied identity', async () => {
  const result = await track(request(null, { type: 'page_view', page: '/en/new', ipHash: 'forged', country: 'US' }, { 'cf-connecting-ip': '192.0.2.8', 'cf-ipcountry': 'EG', 'user-agent': 'Mozilla iPad' }))
  assert.equal(result.status, 200); assert.equal((await result.json()).message, 'Tracked')
  const rows = await store.list('analytics_events', 'page = ?', ['/en/new']), event = rows[0].data
  assert.equal(event.ipHash, createHash('sha256').update('192.0.2.8').digest('hex').slice(0, 16)); assert.equal(event.device, 'tablet'); assert.equal(event.country, 'EG')
  assert.equal(JSON.stringify(event).includes('192.0.2.8'), false)
})
test('simultaneous tracking requests create one event within a sliding 30-second window', async () => {
  const before = await count()
  const results = await Promise.all(Array.from({ length: 5 }, () => track(request(null, { type: 'page_view', page: '/en/concurrent' }, { 'cf-connecting-ip': '192.0.2.9' }))))
  const messages = await Promise.all(results.map(result => result.json()))
  assert.equal(messages.filter(message => message.message === 'Tracked').length, 1); assert.equal(await count(), before + 1)
})
test('tracking masks invoice capability tokens and query strings before storing new events', async () => {
  const token = 'private-invoice-capability-token'
  await track(request(null, { type: 'page_view', page: `/en/invoice/${token}?reset_token=private-query` }))
  const rows = await store.list('analytics_events', 'page = ?', ['/en/invoice/[token]'])
  assert.equal(rows.length, 1); assert.ok(!JSON.stringify(rows).includes(token)); assert.ok(!JSON.stringify(rows).includes('private-query'))
})
test('disabled or invalid tracking never writes partial events', async () => {
  const before = await count()
  for (const body of [{ type: 'invalid', page: '/en/' }, { type: 'page_view', page: 'https://external.test' }, { type: 'page_view', page: '//external.test' }, { type: 'page_view', page: '/' + 'x'.repeat(501) }]) assert.equal((await track(request(null, body))).status, 400)
  process.env.ANALYTICS_ENABLED = 'false'
  try { assert.equal((await track(request(null, { type: 'page_view', page: '/disabled' }))).status, 200) }
  finally { delete process.env.ANALYTICS_ENABLED }
  assert.equal(await count(), before)
})
test('account overview counts only confirmed notification delivery, active documents and pending workflows', async () => {
  for (const [n, patch] of [[10, { status: 'pending_review' }], [11, { status: 'expired' }], [12, { status: 'approved', expiryDate: new Date(Date.now() + 2 * day).toISOString() }], [13, { status: 'expired', isArchived: true }]]) await insert('documents', timestamped({ _id: id(n), customerId: id(1), isArchived: false, ...patch }))
  await insert('notifications', timestamped({ channel: 'email', emailStatus: 'pending' }))
  await insert('notifications', timestamped({ channel: 'multi', emailStatus: 'sent', whatsappStatus: 'sent' }))
  await insert('customer_requests', timestamped({ customerId: id(1), trackingNumber: 'TRACK-PENDING', status: 'processing' }))
  const result = await accountOverview(request(staffCookie)), json = await result.json()
  assert.equal(result.status, 200); assert.equal(json.metrics.totalCustomers, 1); assert.equal(json.metrics.pendingReviewDocs, 1); assert.equal(json.metrics.expiredDocs, 1)
  assert.equal(json.metrics.totalNotificationsSent, 1); assert.equal(json.metrics.pendingServiceRequests, 1); assert.equal(json.urgentCount, 1)
  assert.equal((await accountOverview(request(customerCookie))).status, 403)
})
test('system overview reads D1 only, does not call Mongo agent and keeps credentials out of the response', async () => {
  await insert('system_audit_logs', timestamped({ event: 'BACKUP_CREATED', details: { secret: 'private-audit-secret' }, actor: { name: 'Operator' } }))
  const result = await overview(request(staffCookie)), json = await result.json()
  assert.equal(result.status, 200); assert.equal(json.databaseProvider, 'd1'); assert.equal(json.previewOnly, true)
  assert.equal(json.employees.total, 1); assert.equal(json.employees.active, 1); assert.equal(json.recentActivity.length, 1)
  assert.equal(json.backups.agentStatus, 'unknown'); assert.equal(json.email.status, 'unknown')
  for (const value of ['private-audit-secret', 'private-fixture-hash']) assert.ok(!JSON.stringify(json).includes(value))
  assert.equal((await overview(request(customerCookie))).status, 403)
})
test('overview uses readable localized titles for unified activity rather than internal event IDs', async () => {
  await insert('system_audit_logs', timestamped({event:'ACTIVITY_READABLE_FIX',activityVersion:1,action:'document-upload',result:'success',actor:{name:'Customer',role:'customer_admin'},target:{label:'Commercial register'}}))
  const response=await overview(request(staffCookie)),json=await response.json()
  assert.equal(response.status,200)
  const event=json.recentActivity.find(item=>item.event==='ACTIVITY_READABLE_FIX')
  assert.equal(event.titleAr,'رفع مستند')
  assert.equal(event.titleEn,'Uploaded a document')
  assert.equal(event.summaryAr,'Commercial register')
  assert.equal(event.actionUrl,'/admin/activity')
})

test('legacy demo seed route is disabled in D1 and cannot create predictable accounts', async () => {
  const before = (await db.prepare('SELECT count(*) AS n FROM users').first()).n
  const result = await seed(request())
  assert.equal(result.status, 409); assert.equal((await result.json()).code, 'D1_SEED_DISABLED')
  assert.equal((await db.prepare('SELECT count(*) AS n FROM users').first()).n, before)
})

import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { D1AccountsRepository, AccountConflictError } from '../../lib/db/repositories/accounts.ts'
import { createD1AccountsHandler, handleD1AccountAction } from '../../lib/accounts/d1-handlers.ts'
import { hashPassword, verifyPassword } from '../../lib/auth/password.ts'
import { createAccessToken, createRefreshToken, verifyAuthToken, ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { getDatabaseProvider } from '../../lib/db/provider.ts'
import { connectDB } from '../../lib/mongodb.ts'
import { POST as registerRoute } from '../../app/api/auth/register/route.ts'
import { POST as loginRoute } from '../../app/api/auth/login/route.ts'
import { POST as createStaffRoute } from '../../app/api/admin/staff/route.ts'
import { GET as meRoute } from '../../app/api/auth/me/route.ts'
import { PUT as profileRoute } from '../../app/api/portal/profile/route.ts'
import { GET as customerRoute } from '../../app/api/admin/customers/[id]/route.ts'
import {GET as avatarGet,POST as avatarPost} from '../../app/api/portal/profile/avatar/route.ts'
import {removePreviewFile} from '../../lib/storage/d1-preview-storage.ts'
import {portalLiveSnapshot} from '../../lib/notifications/live-snapshot.ts'
import {WorkflowStore} from '../../lib/workflows/runtime.ts'
import {GET as eventsRoute} from '../../app/api/portal/events/route.ts'

let simulator, db, repository, dispatch
let companyA, companyB, manager, managerCookie
let ipIndex = 0
const sent = []

test('avatar upload validates origin, size and bytes and only serves the current owner',async()=>{
 const cookie=companyA.cookie, url='http://localhost/api/portal/profile/avatar'
 const upload=(type,bytes,origin='http://localhost')=>{const form=new FormData();form.append('file',new Blob([bytes],{type}),'avatar.png');return new Request(url,{method:'POST',headers:{cookie,origin},body:form})}
 assert.equal((await avatarPost(upload('image/png',new Uint8Array([1,2,3])))).status,400)
 assert.equal((await avatarPost(upload('image/png',new Uint8Array(2*1024*1024+1)))).status,400)
 assert.equal((await avatarPost(upload('image/png',new Uint8Array([137,80,78,71,13,10,26,10]),'https://other.example'))).status,403)
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=','base64')
 const result=await avatarPost(upload('image/png',bytes));assert.equal(result.status,200)
 const saved=await raw('users',companyA.id)
 try{
  assert.match((await result.json()).avatarUrl,/^\/api\/portal\/profile\/avatar\?v=/)
  const response=await avatarGet(new Request(url,{headers:{cookie}}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes)
  assert.equal((await avatarGet(new Request(url,{headers:{cookie:companyB.cookie}}))).status,404)
  assert.equal((await avatarGet(new Request(url))).status,401)
 }finally{if(saved?.value.avatarKey)await removePreviewFile(saved.value.avatarKey)}
})

test('live snapshots detect own request and service changes, exclude other tenants and enforce active sessions',async()=>{
 const store=new WorkflowStore(db), req=request('/api/portal/events',undefined,companyA.cookie)
 const a=(await raw('users',companyA.id)).value.customerId,b=(await raw('users',companyB.id)).value.customerId
 await insert('customer_requests',{_id:'live-own-request',customerId:a,trackingNumber:'LIVE-A',status:'submitted'})
 await insert('customer_requests',{_id:'live-other-request',customerId:b,trackingNumber:'LIVE-B',status:'submitted'})
 const before=await portalLiveSnapshot(store,req)
 await db.prepare('UPDATE customer_requests SET revision=revision+1 WHERE id=?').bind('live-other-request').run()
 assert.deepEqual(await portalLiveSnapshot(store,req),before)
 await insert('request_services',{_id:'live-service',requestId:'live-own-request',serviceKey:'sea_freight',status:'pending'})
 const changed=await portalLiveSnapshot(store,req);assert.notEqual(changed.request_updated,before.request_updated)
 await db.prepare('UPDATE request_services SET revision=revision+1 WHERE id=?').bind('live-service').run()
 assert.notEqual((await portalLiveSnapshot(store,req)).request_updated,changed.request_updated)
 assert.equal((await eventsRoute(request('/api/portal/events'))).status,401)
 const controller=new AbortController(),stream=await eventsRoute(new Request('http://localhost/api/portal/events',{headers:{cookie:companyA.cookie},signal:controller.signal}))
 assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/)
 const reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: ready/);controller.abort();await reader.cancel()
})

test('new customers have a scoped onboarding flag that can only be completed by their own profile',async()=>{
 assert.equal((await raw('users',companyA.id)).value.hasCompletedOnboarding,false)
 const response=await profileRoute(new Request('http://localhost/api/portal/profile',{method:'PUT',headers:{cookie:companyA.cookie,'content-type':'application/json'},body:JSON.stringify({hasCompletedOnboarding:true})}))
 assert.equal(response.status,200);assert.equal((await raw('users',companyA.id)).value.hasCompletedOnboarding,true)
 assert.equal((await raw('users',companyB.id)).value.hasCompletedOnboarding,false)
 const invalid=await profileRoute(new Request('http://localhost/api/portal/profile',{method:'PUT',headers:{cookie:companyA.cookie,'content-type':'application/json'},body:JSON.stringify({hasCompletedOnboarding:false})}))
 assert.equal(invalid.status,400)
})
const originalEnv = Object.fromEntries(['DATABASE_PROVIDER', 'D1_ACCOUNTS_PREVIEW', 'D1_MIGRATION_PREVIEW', 'NODE_ENV', 'JWT_SECRET'].map(key => [key, process.env[key]]))
const contextSymbol = Symbol.for('__cloudflare-context__')
const originalContext = globalThis[contextSymbol]

function request(path = '/', body, cookie) {
  return new Request('http://localhost' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `d1-fixture-${++ipIndex}`, ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
function operation(action, cookie, input = {}, id, url = '/') {
  return dispatch({ action, request: request(url, undefined, cookie), input, id })
}
async function raw(table, id) {
  const row = await db.prepare(`SELECT data, revision FROM ${table} WHERE id = ?`).bind(id).first()
  return row ? { value: JSON.parse(row.data), revision: row.revision } : null
}
async function insert(table, data) {
  return db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).bind(data._id, JSON.stringify(data)).run()
}
async function cookieFor(user, overrides = {}) {
  const token = await createAccessToken({ userId: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, customerId: user.customerId, staffPermissions: user.staffPermissions, ...overrides })
  return `${ACCESS_COOKIE_NAME}=${token}`
}
function registration(label, overrides = {}) {
  return { firstName: 'Test', lastName: 'Account', username: label, email: `${label}@example.test`, phone: '+201000000123', password: 'Migrate2026!', confirmPassword: 'Migrate2026!', companyName: `Company ${label}`, commercialRegisterNumber: `CR-${label}`, taxCardNumber: `TAX-${label}`, ...overrides }
}
async function register(label, overrides = {}) {
  const response = await registerRoute(request('/api/auth/register', registration(label, overrides)))
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()))
  const data = await response.json()
  return { ...data.user, cookie: `${ACCESS_COOKIE_NAME}=${response.cookies.get(ACCESS_COOKIE_NAME).value}` }
}

before(async () => {
  delete process.env.D1_MIGRATION_PREVIEW
  Object.assign(process.env, { DATABASE_PROVIDER: 'd1', D1_ACCOUNTS_PREVIEW: 'true', NODE_ENV: 'test', JWT_SECRET: 'local-d1-fixture-secret-for-tests-only' })
  simulator = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture"); } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'accounts-tests' }, d1Persist: false })
  db = await simulator.getD1Database('DB')
  await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  globalThis[contextSymbol] = { env: { DB: db }, cf: {}, ctx: {} }
  repository = new D1AccountsRepository(db)
  dispatch = createD1AccountsHandler(db, { sendOtp: async input => {
    sent.push(input)
    return { success: true, channel: input.channel, recipient: input.to, code: input.code, previewCode: input.code, dispatchedAt: new Date() }
  } })
  companyA = await register('tenant_alpha')
  companyB = await register('tenant_beta')
  manager = { _id: 'manager-fixture', email: 'manager@example.test', firstName: 'Test', lastName: 'Manager', passwordHash: await hashPassword('Migrate2026!'), role: 'super_admin', status: 'active', customerId: null, emailVerified: true, staffPermissions: { canManageCustomers: true } }
  await insert('users', manager)
  managerCookie = await cookieFor(manager)
})
after(async () => {
  await simulator?.dispose()
  if (originalContext === undefined) delete globalThis[contextSymbol]
  else globalThis[contextSymbol] = originalContext
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('email link updates the current account session while preserving company review status', async () => {
  const account = await register('portal_link_self')
  const loaded = await repository.findUser('id', account.id)
  const token = 'portal-self-link-token'
  await repository.patchUser(loaded, { emailVerificationToken: token, emailVerificationExpires: new Date(Date.now() + 600000).toISOString() })
  const staleCookie = await cookieFor((await raw('users', account.id)).value, { emailVerified: false })
  const response = await operation('verify-email', staleCookie, { token })
  assert.equal(response.status, 200)
  const fresh = await verifyAuthToken(response.cookies.get(ACCESS_COOKIE_NAME).value)
  assert.equal(fresh.userId, account.id); assert.equal(fresh.emailVerified, true)
  assert.equal(fresh.whatsappVerified, false); assert.equal(fresh.accountStatus, 'unverified')
  assert.equal((await raw('customers', fresh.customerId)).value.accountStatus, 'unverified')
})

test('verification link cannot sign an anonymous visitor or a different account into its owner', async () => {
  for (const [label, cookie] of [['portal_link_anonymous', undefined], ['portal_link_other', managerCookie]]) {
    const account = await register(label), token = label + '-token'
    await repository.patchUser(await repository.findUser('id', account.id), { emailVerificationToken: token, emailVerificationExpires: new Date(Date.now() + 600000).toISOString() })
    const response = await operation('verify-email', cookie, { token })
    assert.equal(response.status, 200); assert.equal(response.cookies.get(ACCESS_COOKIE_NAME), undefined)
    assert.equal((await raw('users', account.id)).value.emailVerified, true)
  }
})

test('refresh recovers an old unverified session after email was verified in another tab', async () => {
  const account = await register('portal_stale_session'), user = (await raw('users', account.id)).value
  const staleCookie = await cookieFor(user, { emailVerified: false })
  const refresh = await createRefreshToken({ userId: user._id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, customerId: user.customerId })
  await repository.patchUser(await repository.findUser('id', user._id), { emailVerified: true })
  const response = await operation('refresh', `${staleCookie}; ${REFRESH_COOKIE_NAME}=${refresh}`)
  assert.equal(response.status, 200)
  const fresh = await verifyAuthToken(response.cookies.get(ACCESS_COOKIE_NAME).value)
  assert.equal(fresh.emailVerified, true); assert.equal(fresh.accountStatus, 'unverified')
})

test('real registration route validates input, hashes the password and atomically creates the account', async () => {
  const invalid = await registerRoute(request('/api/auth/register', registration('invalid', { password: 'weak', confirmPassword: 'weak' })))
  assert.equal(invalid.status, 400)
  const stored = (await raw('users', companyA.id)).value
  assert.ok(await verifyPassword('Migrate2026!', stored.passwordHash))
  assert.equal(Object.hasOwn(stored, 'password'), false)
  assert.match(stored._id, /^[a-f0-9]{24}$/)
  assert.equal(stored.customerId, companyA.customerId)
  const company = (await raw('customers', stored.customerId)).value
  assert.equal(company.customerCode, company.taxCardNumber)
  assert.equal((await raw('customers', stored.customerId)).value.accountStatus, 'unverified')
  assert.equal((await db.prepare('SELECT count(*) AS count FROM _nilelink_write_guards').first()).count, 0)
})

test('concurrent duplicate-email registration leaves no orphan company or extra user', async () => {
  const inputs = [registration('race_email_one', { email: 'same-race@example.test' }), registration('race_email_two', { email: 'same-race@example.test' })]
  const responses = await Promise.all(inputs.map(input => registerRoute(request('/api/auth/register', input))))
  assert.deepEqual(responses.map(value => value.status).sort(), [201, 409])
  assert.equal((await db.prepare("SELECT count(*) AS count FROM customers WHERE commercialRegisterNumber IN ('CR-race_email_one', 'CR-race_email_two')").first()).count, 1)
  assert.equal((await db.prepare("SELECT count(*) AS count FROM users WHERE email = 'same-race@example.test'").first()).count, 1)
})

test('concurrent duplicate company registration also rolls back the losing user', async () => {
  const inputs = [registration('race_cr_one', { commercialRegisterNumber: 'SAME-COMPANY' }), registration('race_cr_two', { commercialRegisterNumber: 'SAME-COMPANY' })]
  const responses = await Promise.all(inputs.map(input => registerRoute(request('/api/auth/register', input))))
  assert.deepEqual(responses.map(value => value.status).sort(), [201, 409])
  assert.equal((await db.prepare("SELECT count(*) AS count FROM customers WHERE commercialRegisterNumber = 'SAME-COMPANY'").first()).count, 1)
  assert.equal((await db.prepare("SELECT count(*) AS count FROM users WHERE email IN ('race_cr_one@example.test','race_cr_two@example.test')").first()).count, 1)
})

test('duplicate tax registration is atomic across separators and Arabic digits',async()=>{
 const inputs=[registration('race_tax_one',{taxCardNumber:'012-345-678'}),registration('race_tax_two',{taxCardNumber:'٠١٢٣٤٥٦٧٨'})]
 const responses=await Promise.all(inputs.map(input=>registerRoute(request('/api/auth/register',input))))
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409])
 assert.equal((await db.prepare("SELECT count(*) AS count FROM users WHERE email IN ('race_tax_one@example.test','race_tax_two@example.test')").first()).count,1)
})

test('real login accepts username or email, preserves the hash and never seeds default accounts', async () => {
  const hash = (await raw('users', companyA.id)).value.passwordHash
  for (const identifier of ['TENANT_ALPHA', 'tenant_alpha@example.test']) {
    const response = await loginRoute(request('/api/auth/login', { identifier, password: 'Migrate2026!', rememberMe: false }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.user.customerId, companyA.customerId)
    assert.equal(JSON.stringify(body).includes(hash), false)
    const payload = await verifyAuthToken(response.cookies.get(ACCESS_COOKIE_NAME).value)
    assert.equal(payload.userId, companyA.id)
    assert.equal(payload.emailVerified, false)
  }
  assert.equal((await raw('users', companyA.id)).value.passwordHash, hash)
  assert.equal((await db.prepare("SELECT count(*) AS count FROM users WHERE email IN ('manager@nilelink.com','staff@nilelink.com')").first()).count, 0)
  assert.equal((await loginRoute(request('/api/auth/login', { identifier: "' OR 1=1 --", password: 'wrong' }))).status, 401)
})

test('real profile route ignores stale customer/role claims and preserves unknown fields and password hashes', async () => {
  await db.prepare("UPDATE users SET data = json_set(data, '$.migrationExtra', json(?)) WHERE id = ?").bind('{"keep":true}', companyA.id).run()
  const before = (await raw('users', companyA.id)).value
  const maliciousCookie = await cookieFor(before, { customerId: companyB.customerId, role: 'super_admin' })
  const response = await profileRoute(request('/api/portal/profile', { firstName: 'Updated', companyName: 'Alpha Updated', role: 'super_admin', customerId: companyB.customerId }, maliciousCookie))
  assert.equal(response.status, 200)
  const after = (await raw('users', companyA.id)).value
  assert.equal(after.role, 'customer_admin')
  assert.equal(after.customerId, companyA.customerId)
  assert.equal(after.passwordHash, before.passwordHash)
  assert.deepEqual(after.migrationExtra, { keep: true })
  assert.equal((await raw('customers', companyA.customerId)).value.companyName, 'Alpha Updated')
  assert.equal((await raw('customers', companyB.customerId)).value.companyName, companyB.companyName)
  assert.equal((await operation('staff-list', maliciousCookie)).status, 403)
})

test('stale customer revision rolls back a previously executed user update', async () => {
  const loaded = await repository.findUser('id', companyA.id)
  const customer = await repository.findCustomer(companyA.customerId)
  await db.prepare('UPDATE customers SET revision = revision + 1 WHERE id = ?').bind(companyA.customerId).run()
  const before = await raw('users', companyA.id)
  await assert.rejects(repository.updateProfile(loaded, { firstName: 'must-roll-back' }, customer, { city: 'must-roll-back' }), AccountConflictError)
  assert.deepEqual(await raw('users', companyA.id), before)
  assert.notEqual((await raw('customers', companyA.customerId)).value.city, 'must-roll-back')
})

test('tenant reassignment during a company-only update cannot modify the old tenant', async () => {
  const loaded = await repository.findUser('id', companyA.id)
  const customer = await repository.findCustomer(companyA.customerId)
  await db.prepare('UPDATE users SET revision = revision + 1 WHERE id = ?').bind(companyA.id).run()
  await assert.rejects(repository.updateProfile(loaded, {}, customer, { city: 'cross-tenant-write' }), AccountConflictError)
  assert.notEqual((await raw('customers', companyA.customerId)).value.city, 'cross-tenant-write')
})

test('optimistic account writes preserve null vs absent and reject replay after a successful update', async () => {
  const loaded = await repository.findUser('id', companyA.id)
  await repository.patchUser(loaded, { emailVerificationToken: undefined, emailVerificationExpires: null })
  const after = (await raw('users', companyA.id)).value
  assert.equal(Object.hasOwn(after, 'emailVerificationToken'), false)
  assert.equal(after.emailVerificationExpires, null)
  await assert.rejects(repository.patchUser(loaded, { firstName: 'stale-write' }), AccountConflictError)
  assert.notEqual((await raw('users', companyA.id)).value.firstName, 'stale-write')
})

test('me statistics and notifications are scoped to the current customer and exclude staff notifications', async () => {
  const old = new Date(Date.now() - 86400000).toISOString()
  const soon = new Date(Date.now() + 86400000).toISOString()
  for (const doc of [
    { _id: 'a-approved-expired', customerId: companyA.customerId, status: 'approved', expiryDate: old },
    { _id: 'a-approved-soon', customerId: companyA.customerId, status: 'approved', expiryDate: soon },
    { _id: 'a-pending', customerId: companyA.customerId, status: 'pending_review' },
    { _id: 'a-archived', customerId: companyA.customerId, status: 'expired', isArchived: true },
    { _id: 'b-expired', customerId: companyB.customerId, status: 'expired' },
  ]) await insert('documents', { isArchived: false, ...doc })
  for (const note of [
    { _id: 'direct-a', recipientUserId: companyA.id },
    { _id: 'company-a', recipientCustomerId: companyA.customerId },
    { _id: 'staff-company-a', recipientCustomerId: companyA.customerId, targetAudience: 'staff' },
    { _id: 'global-unread', readBy: [companyB.id] },
    { _id: 'global-read', readBy: [companyA.id] },
  ]) await insert('notifications', { targetAudience: 'customer', recipientUserId: null, recipientCustomerId: null, isRead: false, readBy: [], ...note })
  await db.prepare("UPDATE customers SET data = json_set(data, '$.legacyPrivate', 'not-for-api') WHERE id = ?").bind(companyA.customerId).run()
  const response = await meRoute(request('/api/auth/me', undefined, companyA.cookie))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.customer.id, companyA.customerId)
  assert.equal(body.documentStats.totalDocs, 3)
  assert.equal(body.documentStats.expiredDocs, 1)
  assert.equal(body.documentStats.expiringDocs, 1)
  assert.equal(body.documentStats.pendingDocs, 1)
  assert.equal(body.unreadNotificationsCount, 3)
  assert.equal(Object.hasOwn(body.customer, 'legacyPrivate'), false)
  assert.equal(Object.hasOwn(body.user, 'passwordHash'), false)
  assert.equal(Object.hasOwn(body.user, 'migrationExtra'), false)
})

test('customers cannot read an admin customer detail endpoint even with forged role claims', async () => {
  const cookie = await cookieFor((await raw('users', companyA.id)).value, { role: 'super_admin' })
  const response = await customerRoute(request('/api/admin/customers/' + companyB.customerId, undefined, cookie), { params: Promise.resolve({ id: companyB.customerId }) })
  assert.equal(response.status, 403)
})

test('refresh rebuilds staff permissions from D1 and inactive users cannot refresh or authenticate', async () => {
  const staff = { _id: 'refresh-staff', email: 'refresh@example.test', firstName: 'Refresh', lastName: 'Staff', role: 'staff', status: 'active', staffPermissions: { canManageCustomers: false } }
  await insert('users', staff)
  const token = await createRefreshToken({ userId: staff._id, email: staff.email, role: 'super_admin', firstName: 'Old', lastName: 'Claims' })
  const cookie = `${REFRESH_COOKIE_NAME}=${token}`
  const response = await operation('refresh', cookie)
  assert.equal(response.status, 200)
  const payload = await verifyAuthToken(response.cookies.get(ACCESS_COOKIE_NAME).value)
  assert.equal(payload.role, 'staff')
  assert.equal(payload.staffPermissions.canManageCustomers, false)
  await repository.patchUser(await repository.findUser('id', staff._id), { status: 'inactive' })
  assert.equal((await operation('refresh', cookie)).status, 401)
  assert.equal((await operation('me', await cookieFor(staff))).status, 401)
  assert.equal((await operation('me', cookie)).status, 401)
})

test('password-reset and verification tokens are single-use under concurrent requests', async () => {
  const loaded = await repository.findUser('id', companyB.id)
  await repository.patchUser(loaded, { passwordResetToken: 'fixture-reset-token', passwordResetExpires: new Date(Date.now() + 600000).toISOString() })
  const responses = await Promise.all([1, 2].map(() => operation('reset-password', null, { token: 'fixture-reset-token', newPassword: 'Changed2026!' })))
  assert.equal(responses.filter(response => response.status === 200).length, 1)
  assert.ok(responses.filter(response => response.status !== 200).every(response => [400, 409].includes(response.status)))
  const stored = (await raw('users', companyB.id)).value
  assert.ok(await verifyPassword('Changed2026!', stored.passwordHash))
  assert.equal(Object.hasOwn(stored, 'passwordResetToken'), false)
})

test('manual WhatsApp acknowledgement uses registered phone arithmetic while email remains expiring random OTP', async () => {
  let loaded = await repository.findUser('id', companyA.id)
  await repository.patchUser(loaded, { whatsappVerificationCode: '999999', whatsappVerificationExpires: new Date(Date.now() + 600000).toISOString() })
  const predictable = String(Number(loaded.user.phone.replace(/\D/g, '').slice(-6)) + 123456)
  assert.equal((await operation('verify-otp', companyA.cookie, { channel: 'whatsapp', code: '999999' })).status, 400)
  const before = sent.length
  assert.equal((await operation('send-otp', companyA.cookie, { channel: 'whatsapp' })).status, 200)
  assert.equal(sent.length, before)
  assert.equal((await operation('verify-otp', companyA.cookie, { channel: 'whatsapp', code: predictable, phone: '01000000000' })).status, 200)
  assert.equal((await operation('send-otp', companyA.cookie, { channel: 'email' })).status, 200)
  const dispatched = sent.at(-1)
  assert.equal(dispatched.to, 'tenant_alpha@example.test')
  assert.equal((await operation('verify-otp', companyA.cookie, { channel: 'email', code: dispatched.code })).status, 200)
  loaded = await repository.findUser('id', companyA.id)
  await repository.patchUser(loaded, { emailVerificationOtp: '123456', emailVerificationOtpExpires: '2000-01-01T00:00:00.000Z' })
  assert.equal((await operation('verify-otp', companyA.cookie, { channel: 'email', code: '123456' })).status, 400)
})

test('contact changes update user and own company together and invalidate old email verification', async () => {
  const response = await operation('update-contact', companyA.cookie, { channel: 'email', newValue: 'new-alpha@example.test' })
  assert.equal(response.status, 200)
  const stored = (await raw('users', companyA.id)).value
  assert.equal(stored.email, 'new-alpha@example.test')
  assert.equal(stored.emailVerified, false)
  assert.equal(Object.hasOwn(stored, 'emailVerificationToken'), false)
  assert.equal((await raw('customers', companyA.customerId)).value.contactEmail, stored.email)
  assert.equal((await raw('customers', companyB.customerId)).value.contactEmail, 'tenant_beta@example.test')
  assert.equal(sent.at(-1).to, stored.email)
  const payload = await verifyAuthToken(response.cookies.get(ACCESS_COOKIE_NAME).value)
  assert.equal(payload.customerId, companyA.customerId)
  assert.equal(payload.emailVerified, false)
})

test('staff management and customer-status permission checks use current database privileges', async () => {
  const staff = { _id: 'restricted-staff', email: 'restricted@example.test', firstName: 'Restricted', lastName: 'Staff', role: 'staff', status: 'active', staffPermissions: { canManageCustomers: false } }
  await insert('users', staff)
  const staleCookie = await cookieFor(staff, { role: 'super_admin', staffPermissions: { canManageCustomers: true } })
  assert.equal((await operation('staff-create', staleCookie, { email: 'forbidden@example.test' })).status, 403)
  assert.equal((await operation('customer-status', staleCookie, { accountStatus: 'active', statusReason: 'must not apply' }, companyB.customerId)).status, 403)
  assert.equal((await raw('customers', companyB.customerId)).value.accountStatus, 'unverified')
  const created = await operation('staff-create', managerCookie, { email: 'new-staff@example.test', firstName: 'New', lastName: 'Staff', password: 'StaffPass2026!', role: 'staff', staffPermissions: { canManageCustomers: false } })
  assert.equal(created.status, 200)
  const newId = (await created.json()).staff.id
  const stored = (await raw('users', newId)).value
  assert.equal(Object.hasOwn(stored, 'password'), false)
  assert.ok(await verifyPassword('StaffPass2026!', stored.passwordHash))
  assert.equal((await operation('staff-suspend', managerCookie, {}, manager._id)).status, 400)
  assert.equal((await operation('staff-update', managerCookie, { status: 'inactive' }, manager._id)).status, 400)
  assert.equal((await operation('staff-suspend', managerCookie, {}, newId)).status, 200)
  assert.equal((await raw('users', newId)).value.status, 'suspended')
})

test('username-only staff and managers can be created and log in without an email', async () => {
  for (const role of ['staff', 'super_admin']) {
    const username = `username_only_${role}`
    const input = { firstName: 'Username', lastName: 'Account', username: username.toUpperCase(), password: 'Username2026!', role, staffPermissions: {} }
    const created = await createStaffRoute(request('/api/admin/staff', input, managerCookie))
    assert.equal(created.status, 200, JSON.stringify(await created.clone().json()))
    const id = (await created.json()).staff.id
    const stored = (await raw('users', id)).value
    assert.equal(stored.username, username)
    assert.equal(stored.role, role)
    assert.equal(Object.hasOwn(stored, 'password'), false)
    const logged = await loginRoute(request('/api/auth/login', { identifier: username, password: input.password }))
    assert.equal(logged.status, 200)
    assert.equal((await logged.json()).user.role, role)
    assert.equal((await createStaffRoute(request('/api/admin/staff', input, managerCookie))).status, 409)
    assert.equal((await createStaffRoute(request('/api/admin/staff', { ...input, username: 'invalid@name' }, managerCookie))).status, 400)
    assert.equal((await createStaffRoute(request('/api/admin/staff', { ...input, username: '' }, managerCookie))).status, 400)
    const staffCookie = await cookieFor({ ...stored, role: 'staff' })
    // The stored role, rather than forged cookie privileges, controls creation.
    if (role === 'staff') assert.equal((await createStaffRoute(request('/api/admin/staff', { ...input, username: 'escalation_attempt' }, staffCookie))).status, 403)
  }
})

test('roles treat titles literally and reject duplicate case variants', async () => {
  const permissions = { canSendAlerts: false, canReviewDocuments: false, canManageCustomers: false }
  assert.equal((await operation('roles-create', managerCookie, { title: 'Ops.*', permissions })).status, 200)
  assert.equal((await operation('roles-create', managerCookie, { title: 'OpsABC', permissions })).status, 200)
  assert.equal((await operation('roles-create', managerCookie, { title: 'opsabc', permissions })).status, 409)
  assert.equal((await operation('roles-create', companyA.cookie, { title: 'Customer escalation', permissions })).status, 403)
  const unicode = await Promise.all(['Équipe', 'équipe'].map(title => operation('roles-create', managerCookie, { title, permissions })))
  assert.deepEqual(unicode.map(response => response.status).sort(), [200, 409])
})

test('customer status and all corresponding notifications commit atomically', async () => {
  const response = await operation('customer-status', managerCookie, { accountStatus: 'active', statusReason: 'All documents accepted' }, companyB.customerId)
  assert.equal(response.status, 200)
  assert.equal((await raw('customers', companyB.customerId)).value.accountStatus, 'active')
  const rows = (await db.prepare("SELECT data FROM notifications WHERE recipientCustomerId = ? AND type = 'account_status_change'").bind(companyB.customerId).all()).results
  assert.equal(rows.length, 1)
  const note = JSON.parse(rows[0].data)
  assert.equal(note.recipientUserId, companyB.id)
  const before = await raw('customers', companyB.customerId)
  await assert.rejects(repository.updateCustomerStatus(await repository.findCustomer(companyB.customerId), { accountStatus: 'inactive' }, [note]), AccountConflictError)
  assert.deepEqual(await raw('customers', companyB.customerId), before)
})

test('search preserves regex behavior and SQL wildcard characters remain ordinary search input', async () => {
  const result = await operation('customers-search', managerCookie, {}, undefined, '/api/admin/customers/search?q=%25')
  assert.equal(result.status, 200)
  assert.deepEqual((await result.json()).customers, [])
  const anchored = await operation('customers-search', managerCookie, {}, undefined, '/api/admin/customers/search?q=%5EAlpha')
  assert.equal((await anchored.json()).customers[0].id, companyA.customerId)
  assert.equal((await operation('customers-search', managerCookie, {}, undefined, '/?q=%5B')).status, 400)
})

test('D1 preview fails closed, blocks unconverted Mongo access and cannot be enabled for production', async () => {
  delete process.env.DATABASE_PROVIDER
  assert.equal(getDatabaseProvider(), 'mongodb')
  process.env.DATABASE_PROVIDER = 'd1'
  assert.equal(getDatabaseProvider(), 'd1')
  await assert.rejects(connectDB(), /MongoDB access is disabled/)
  assert.equal((await operation('customer-delete', managerCookie, {}, companyB.customerId)).status, 409)
  assert.ok(await raw('customers', companyB.customerId))
  process.env.D1_ACCOUNTS_PREVIEW = 'false'
  assert.throws(getDatabaseProvider, /local preview/)
  process.env.D1_ACCOUNTS_PREVIEW = 'true'
  process.env.NODE_ENV = 'production'
  assert.throws(getDatabaseProvider, /local preview/)
  process.env.NODE_ENV = 'test'
  const context = globalThis[contextSymbol]
  globalThis[contextSymbol] = { env: {} }
  try {
    const response = await handleD1AccountAction({ action: 'me', request: request('/', undefined, companyA.cookie) })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'D1_UNAVAILABLE')
  } finally { globalThis[contextSymbol] = context }
  assert.equal((await db.prepare('SELECT count(*) AS count FROM _nilelink_write_guards').first()).count, 0)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
})

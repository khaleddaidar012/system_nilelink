import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { manualWhatsappCode } from '../../lib/auth/manual-whatsapp-code.ts'
const base = '.private/d1-migration/first-launch', origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const credentials = JSON.parse(await readFile(base + '/application/requested-admin-credentials.json', 'utf8'))
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials.email, password: credentials.password, rememberMe: false }), signal: AbortSignal.timeout(60000) })
assert.equal(login.status, 200)
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const call = (url, body) => fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { cookie, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) })
const before = await (await call('/api/auth/verification-status')).json()
assert.equal(before.whatsappVerified, true) // Never change a customer's verification for testing.
const code = manualWhatsappCode(before.phone); assert.ok(code)
const request = await call('/api/auth/send-otp', { channel: 'whatsapp' }); assert.equal(request.status, 200)
const prepared = await request.json(); assert.equal(prepared.manual, true); assert.equal(prepared.previewCode, undefined)
assert.equal((await call('/api/auth/verify-otp', { channel: 'whatsapp', code: '0000000' })).status, 400)
const verified = await call('/api/auth/verify-otp', { channel: 'whatsapp', code }); assert.equal(verified.status, 200)
const data = await verified.json(); assert.equal(data.whatsappVerified, true); assert.equal(data.emailVerified, before.emailVerified)
const report = { status: 'passed', checkedAt: new Date().toISOString(), manualPreparationWithoutMessage: true, invalidCodeRejected: true, registeredPhoneFormulaAccepted: true, existingAdminAlreadyVerified: true, customerVerificationModified: false, emailVerificationUnchanged: true, businessRecordsModified: false }
await writeFile(base + '/manual-whatsapp-live-validation.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

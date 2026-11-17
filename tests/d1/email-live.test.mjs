import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createResendProvider } from '../../lib/email/providers/resend.ts'
import { registerProvider } from '../../lib/email/providers/index.ts'
import { dispatchOtpNotification } from '../../lib/auth/otp-service.ts'
import { liveEmailConfigured } from '../../lib/email/readiness.ts'
import {plainTextFromHtml,brandedSender} from '../../lib/email/message.ts'
const names = ['NODE_ENV', 'EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY', 'EMAIL_DELIVERY_ENABLED', 'SMTP_HOST', 'EMAIL_SERVER_HOST', 'WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_OTP_TEMPLATE', 'WHATSAPP_GRAPH_VERSION']
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value } })

test('email activation needs an explicit flag, credential and valid sender', () => {
  Object.assign(process.env, { NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'sender@example.test', RESEND_API_KEY: 're_fixture', EMAIL_DELIVERY_ENABLED: 'false' })
  assert.equal(liveEmailConfigured(), false)
  process.env.EMAIL_DELIVERY_ENABLED = 'true'; assert.equal(liveEmailConfigured(), true)
  delete process.env.RESEND_API_KEY; assert.equal(liveEmailConfigured(), false)
})
test('production OTP returns failure for unavailable providers and never exposes preview codes', async () => {
  Object.assign(process.env, { NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_fixture' })
  let sent
  registerProvider('resend', () => ({ name: 'fixture', async send(message) { sent = message; return { success: true, messageId: 'receipt-fixture' } } }))
  const options = { to: 'owned@example.test', channel: 'email', purpose: 'password_reset', code: '123456', recipientName: '<script>' }
  try {
    const result = await dispatchOtpNotification(options)
    assert.equal(result.success, true); assert.equal(result.previewCode, undefined); assert.match(sent.html, /&lt;script&gt;/)
    registerProvider('resend', () => ({ name: 'fixture', async send() { return { success: false, error: 'provider unavailable' } } }))
    assert.equal((await dispatchOtpNotification(options)).success, false)
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    assert.equal((await dispatchOtpNotification({ ...options, channel: 'whatsapp' })).success, false)
  } finally { registerProvider('resend', createResendProvider) }
})
test('Resend forwards stable idempotency and PDF bytes, rejects failures and missing receipts', async () => {
  const original = globalThis.fetch; let captured
  const provider = createResendProvider({ provider: 'resend', from: 'sender@example.test', to: 'recipient@example.test', resendApiKey: 're_fixture' })
  try {
    globalThis.fetch = async (url, options) => { captured = options; return Response.json({ id: 'provider-receipt' }) }
    const result = await provider.send({ to: 'recipient@example.test', subject: 'Test', html: '<p>Test</p>', idempotencyKey: 'stable-key', attachments: [{ filename: 'test.pdf', content: Buffer.from('%PDF-fixture') }] })
    assert.equal(result.messageId, 'provider-receipt'); assert.equal(captured.headers['Idempotency-Key'], 'stable-key')
    assert.equal(JSON.parse(captured.body).attachments[0].content, Buffer.from('%PDF-fixture').toString('base64'))
    assert.equal(JSON.parse(captured.body).text,'Test')
    assert.equal(JSON.parse(captured.body).from,'NileLink Logistics <sender@example.test>')
    assert.equal(JSON.parse(captured.body).headers['List-Unsubscribe'],undefined)
    globalThis.fetch = async () => Response.json({}); assert.equal((await provider.send({ to: 'recipient@example.test', subject: 'Test', html: '' })).success, false)
    globalThis.fetch = async () => new Response('private provider details', { status: 403 })
    const failed = await provider.send({ to: 'recipient@example.test', subject: 'Test', html: '' }); assert.equal(failed.success, false); assert.ok(!failed.error.includes('private provider details'))
  } finally { globalThis.fetch = original }
})

test('transactional fallback text preserves action links and rejects header injection',()=>{
 assert.equal(plainTextFromHtml('<style>hidden</style><p>Hello &amp; welcome</p><p><a href="https://nilelinklogistics.com/verify?t=fixture">Verify</a></p>'),'Hello & welcome\nVerify (https://nilelinklogistics.com/verify?t=fixture)')
 assert.throws(()=>brandedSender('sender@example.test\r\nBcc: attacker@example.test'))
 assert.equal(brandedSender('NileLink <sender@example.test>'),'NileLink <sender@example.test>')
})

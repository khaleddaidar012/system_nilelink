import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createMailboxService } from '../service.mjs'
import { signMailboxRequest, verifyMailboxRequest } from '../protocol.mjs'
const actorId = '1234567890abcdef12345678', credentials = { actorId, email: 'employee@nilelinklogistics.com', password: 'private-mail-password' }
async function fixture({ smtpFails = false, appendFails = false, authUsernameFormat } = {}) {
  let sends = 0, seen = 0, imapOptions, smtpOptions
  const config = { authUsernameFormat, allowedDomain: 'nilelinklogistics.com', imapHost: 'localhost', imapPort: 993, smtpHost: 'localhost', smtpPort: 465, stateDirectory: await mkdtemp(path.join(os.tmpdir(), 'nilelink-mail-test-')) }
  const imapFactory = options => { imapOptions = options; return { mailbox: { exists: 1, uidValidity: 123n }, connect: async () => {}, logout: async () => {}, close() {}, mailboxOpen: async () => {}, list: async () => [{ path: 'Sent Items', name: 'Sent', specialUse: '\\Sent', flags: new Set() }], status: async () => ({ unseen: seen ? 0 : 1 }), fetchOne: async (_uid, query) => query.source ? { uid: 42, size: 100, flags: new Set(), envelope: {}, source: Buffer.from('From: Sender <sender@example.com>\r\nTo: employee@nilelinklogistics.com\r\nSubject: Hello\r\nMessage-ID: <test@example.com>\r\nContent-Type: text/plain\r\n\r\nHello World') } : { uid: 42, size: 100 }, messageFlagsAdd: async (uid, flags, options) => { assert.equal(uid, 42); assert.deepEqual(flags, ['\\Seen']); assert.equal(options.uid, true); seen++ }, append: async () => { if (appendFails) throw Error('append unavailable') } } }
  const smtpFactory = options => { smtpOptions = options; return { verify: async () => true, close() {}, sendMail: async () => { sends++; if (smtpFails) throw Error('uncertain private raw SMTP error'); return { accepted: ['recipient@example.com'], rejected: [], messageId: '<sent@example.com>' } } } }
  return { call: createMailboxService(config, { imapFactory, smtpFactory, compose: async () => Buffer.from('safe MIME') }), get sends() { return sends }, get seen() { return seen }, get imapOptions() { return imapOptions }, get smtpOptions() { return smtpOptions } }
}
test('HMAC includes body and owner, rejects replay, expiry and changed payload', () => {
  const key = 'ab'.repeat(32), time = String(Date.now()), nonce = randomUUID(), body = JSON.stringify(credentials), nonces = new Map()
  const headers = { 'x-nl-mail-time': time, 'x-nl-mail-nonce': nonce, 'x-nl-mail-signature': signMailboxRequest(key, time, nonce, body) }
  assert.equal(verifyMailboxRequest(key, headers, body + ' ', nonces), false)
  assert.equal(verifyMailboxRequest(key, headers, body, nonces), true)
  assert.equal(verifyMailboxRequest(key, headers, body, nonces), false)
  assert.equal(verifyMailboxRequest(key, headers, body, new Map(), Number(time) + 120000), false)
})
test('connect verifies IMAP and SMTP without sending; TLS verification and sender security remain enabled', async () => {
  const f = await fixture(); assert.equal((await f.call({ ...credentials, action: 'connect' })).connected, true)
  assert.equal(f.sends, 0); assert.equal(f.imapOptions.tls.rejectUnauthorized, true); assert.equal(f.smtpOptions.tls.rejectUnauthorized, true)
  assert.equal(f.smtpOptions.disableFileAccess, true); assert.equal(f.smtpOptions.disableUrlAccess, true)
  await assert.rejects(() => f.call({ ...credentials, email: 'someone@external.test', action: 'status' }), /DOMAIN_NOT_ALLOWED/)
})
test('message reading is separate from marking seen and UIDVALIDITY prevents wrong-message updates', async () => {
  const f = await fixture(), ref = { folder: 'INBOX', uid: 42, uidValidity: '123' }
  const message = await f.call({ ...credentials, ...ref, action: 'message' }); assert.match(message.text, /Hello World/); assert.equal(f.seen, 0)
  await assert.rejects(() => f.call({ ...credentials, ...ref, uidValidity: '999', action: 'read' }), /MAILBOX_CHANGED/)
  assert.equal((await f.call({ ...credentials, ...ref, action: 'read' })).unread, 0); assert.equal(f.seen, 1)
})
test('accepted send is idempotent, cannot change recipients on replay and append failure cannot resend SMTP', async () => {
  const f = await fixture({ appendFails: true }), request = { ...credentials, action: 'send', requestId: randomUUID(), to: ['recipient@example.com'], subject: 'Test', text: 'Message' }
  const first = await f.call(request); assert.equal(first.accepted, true); assert.equal(first.sentCopySaved, false)
  assert.deepEqual(await f.call(request), first); assert.equal(f.sends, 1)
  await assert.rejects(() => f.call({ ...request, subject: 'Different' }), /REQUEST_CONFLICT/); assert.equal(f.sends, 1)
})
test('uncertain SMTP result is persisted and a retry never duplicates a possibly sent message', async () => {
  const f = await fixture({ smtpFails: true }), request = { ...credentials, action: 'send', requestId: randomUUID(), to: ['recipient@example.com'], subject: 'Test', text: 'Message' }
  await assert.rejects(() => f.call(request), /SEND_OUTCOME_UNKNOWN/)
  await assert.rejects(() => f.call(request), /SEND_OUTCOME_UNKNOWN/); assert.equal(f.sends, 1)
  await assert.rejects(() => f.call({ ...request, requestId: randomUUID(), from: 'spoof@example.com' }), /INVALID_REQUEST/)
})

test('local-part login uses mailbox name for both protocols, with full-email default preserved', async () => {
  const local = await fixture({ authUsernameFormat: 'local-part' });
  await local.call({ ...credentials, action: 'connect' });
  assert.equal(local.imapOptions.auth.user, 'employee');
  assert.equal(local.smtpOptions.auth.user, 'employee');
  const full = await fixture();
  await full.call({ ...credentials, action: 'connect' });
  assert.equal(full.imapOptions.auth.user, credentials.email);
  assert.equal(full.smtpOptions.auth.user, credentials.email);
});

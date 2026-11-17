import { test } from 'node:test'
import { callMailboxAgent } from '../../lib/mailbox/gateway.ts'
import assert from 'node:assert/strict'
import { handleMailboxRequest } from '../../lib/mailbox/handler.ts'
import { sealMailboxPassword, openMailboxPassword } from '../../lib/mailbox/security.ts'
const owner = '1234567890abcdef12345678', other = 'abcdef1234567890abcdef12'
const env = { MAILBOX_AGENT_URL: 'https://mail-api.nilelinklogistics.com', MAILBOX_AGENT_HMAC_KEY: 'ab'.repeat(32), MAILBOX_ENCRYPTION_KEY: 'cd'.repeat(32) }
function fixture(role = 'staff') {
  let record = { _id: owner, role, status: 'active', email: 'employee@nilelink.com', passwordHash: 'original-login-hash' }, revision = 0
  const calls = []
  const db = {
    prepare(sql) { return { sql, values: [], bind(...args) { this.values=args;return this }, async first() { return this.values[0] === owner ? { data: JSON.stringify(record), revision } : null } } },
    async batch(statements) {
      for (const statement of statements.filter(item=>item.sql.includes('SELECT ?, count(*) FROM users'))) {
        assert.equal(statement.values[1], owner);assert.equal(statement.values[2], revision)
      }
      const update=statements.find(item=>item.sql.startsWith('UPDATE users'))
      if(update){assert.equal(update.values[1],owner);assert.equal(update.values[2],revision);record=JSON.parse(update.values[0]);revision++}
      return statements.map(()=>({success:true,results:[],meta:{changes:1}}))
    },
  }
  const overrides = { db, env, session: { userId: owner, tokenType: 'access' }, gateway: async (_env, input) => { calls.push(input); if (input.action === 'connect') return { connected: true }; if (input.action === 'status') return { unread: 4 }; if (input.action === 'read') return { read: true, unread: 3 }; return { accepted: true, text: '<script>untrusted email</script>' } } }
  const call = (action, body) => handleMailboxRequest(new Request('https://nilelinklogistics.com/api/admin/mailbox' + (body ? '' : '?action=' + action), { method: body ? 'POST' : 'GET', ...(body ? { headers: { origin: 'https://nilelinklogistics.com', 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) } : {}) }), overrides)
  return { call, calls, overrides, get record() { return record }, set record(value) { record = value } }
}
test('mailbox passwords use randomized authenticated encryption bound to the exact employee and email', async () => {
  const a = await sealMailboxPassword('mailbox-secret', owner, 'a@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY)
  const b = await sealMailboxPassword('mailbox-secret', owner, 'a@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY)
  assert.notEqual(a.ciphertext, b.ciphertext)
  assert.equal(await openMailboxPassword(a, owner, 'a@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY), 'mailbox-secret')
  await assert.rejects(() => openMailboxPassword(a, other, 'a@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY))
  await assert.rejects(() => openMailboxPassword(a, owner, 'b@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY))
  await assert.rejects(() => openMailboxPassword({ ...a, ciphertext: b.ciphertext }, owner, 'a@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY))
})
test('only active staff from current database state can access their own mailbox; mutation needs exact origin', async () => {
  const f = fixture('customer_admin'); assert.equal((await f.call('status')).status, 403); assert.equal(f.calls.length, 0)
  f.record = { ...f.record, role: 'staff', status: 'inactive' }; assert.equal((await f.call('status')).status, 401)
  f.record = { ...f.record, status: 'active' }
  const response = await handleMailboxRequest(new Request('https://nilelinklogistics.com/api/admin/mailbox', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' }), f.overrides)
  assert.equal(response.status, 403); assert.equal(f.calls.length, 0)
  assert.equal((await handleMailboxRequest(new Request('https://nilelinklogistics.com/api/admin/mailbox'), { ...f.overrides, session: null })).status, 401)
})
test('connection is verified before encrypted storage and never changes website credentials or exposes secrets', async () => {
  const f = fixture()
  const response = await f.call('connect', { email: 'employee@nilelinklogistics.com', password: 'a mailbox password' })
  assert.equal(response.status, 200); assert.ok(!(await response.text()).includes('password'))
  assert.equal(f.record.passwordHash, 'original-login-hash'); assert.ok(!JSON.stringify(f.record).includes('a mailbox password'))
  assert.equal(f.calls[0].actorId, owner)
  assert.equal((await f.call('status')).status, 200); assert.equal(f.calls.at(-1).password, 'a mailbox password')
  assert.equal((await f.call('connect', { email: 'employee@nilelinklogistics.com', password: 'pw', actorId: other })).status, 400)
  assert.equal((await f.call('connect', { email: 'employee@external.test', password: 'pw' })).status, 400)
  await f.call('disconnect', {}); assert.equal(f.record.mailbox, undefined); assert.equal(f.record.passwordHash, 'original-login-hash')
})
test('copied encrypted credentials cannot be used as another mailbox; gateway failures never store credentials', async () => {
  const f = fixture()
  f.overrides.gateway = async () => { throw Error('raw unsafe credentials') }
  assert.equal((await f.call('connect', { email: 'employee@nilelinklogistics.com', password: 'secret' })).status, 502)
  assert.equal(f.record.mailbox, undefined)
  f.record = { ...f.record, mailbox: { email: 'employee@nilelinklogistics.com', password: await sealMailboxPassword('secret', other, 'employee@nilelinklogistics.com', env.MAILBOX_ENCRYPTION_KEY), connectedAt: new Date().toISOString() } }
  const result = await f.call('status'); assert.equal(result.status, 502); assert.equal(f.calls.length, 0); assert.ok(!(await result.text()).includes('raw unsafe'))
})
test('unconfigured connector reports setup required and never pretends to send or connect', async () => {
  const f = fixture(); f.overrides.env = {}
  const status = await (await f.call('status')).json(); assert.equal(status.available, false); assert.equal(status.needsServerSetup, true)
  assert.equal((await f.call('connect', { email: 'a@nilelinklogistics.com', password: 'secret' })).status, 503)
  assert.equal(f.calls.length, 0)
})
test('mail read state requires an exact folder UID and UIDVALIDITY; no browser-selected owner is accepted', async () => {
  const f = fixture(); await f.call('connect', { email: 'a@nilelinklogistics.com', password: 'pw' })
  const data = await (await f.call('read', { folder: 'INBOX', uid: 42, uidValidity: '123' })).json()
  assert.equal(data.unread, 3); assert.equal(f.calls.at(-1).actorId, owner)
  assert.equal((await f.call('read', { folder: 'INBOX', uid: 42, uidValidity: '123', userId: other })).status, 400)
  assert.equal((await f.call('read', { folder: 'INBOX', uid: '42:*', uidValidity: '123' })).status, 400)
})

test('mailbox fetch uses edge-compatible manual redirects and never forwards mailbox credentials to Location', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++; assert.equal(String(url), 'https://mail-api.nilelinklogistics.com/mailbox');
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'https://untrusted.example/mailbox' } });
    };
    await assert.rejects(() => callMailboxAgent(env, { action: 'connect', actorId: owner, email: 'info@nilelinklogistics.com', password: 'private' }), /MAIL_SERVER_UNAVAILABLE/);
    assert.equal(calls, 1);
    globalThis.fetch = async (_url, options) => { assert.equal(options.redirect, 'manual'); return Response.json({ ok: true, data: { connected: true } }); };
    assert.deepEqual(await callMailboxAgent(env, { action: 'connect', actorId: owner, email: 'info@nilelinklogistics.com', password: 'private' }), { connected: true });
  } finally { globalThis.fetch = original; }
});

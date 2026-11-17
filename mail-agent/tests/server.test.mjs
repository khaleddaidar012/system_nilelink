import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createMailAgentServer } from '../server.mjs'
import { signMailboxRequest } from '../protocol.mjs'
test('real HTTP boundary rejects unsigned/replayed/modified requests and never exposes raw service errors', async () => {
  const key = 'ab'.repeat(32); let calls = 0
  const server = createMailAgentServer({ hmacKey: key }, async input => { calls++; if (input.action === 'fail') throw Error('raw private password=secret'); return { connected: true } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/mailbox`
  try {
    const body = JSON.stringify({ actorId: '1234567890abcdef12345678', action: 'connect' })
    assert.equal((await fetch(url, { method: 'POST', body })).status, 401); assert.equal(calls, 0)
    const time = String(Date.now()), nonce = randomUUID(), headers = { 'x-nl-mail-time': time, 'x-nl-mail-nonce': nonce, 'x-nl-mail-signature': signMailboxRequest(key, time, nonce, body) }
    assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200)
    assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 401); assert.equal(calls, 1)
    assert.equal((await fetch(url, { method: 'POST', headers, body: body.replace('connect', 'fail') })).status, 401)
    const failingBody = body.replace('connect', 'fail'), nextNonce = randomUUID()
    const result = await fetch(url, { method: 'POST', body: failingBody, headers: { ...headers, 'x-nl-mail-nonce': nextNonce, 'x-nl-mail-signature': signMailboxRequest(key, time, nextNonce, failingBody) } })
    assert.equal(result.status, 502); const text = await result.text(); assert.ok(!text.includes('password')); assert.ok(!text.includes('secret'))
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

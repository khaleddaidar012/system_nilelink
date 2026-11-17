import { jwtVerify } from 'jose'
import { createHash, createHmac, randomUUID } from 'node:crypto'

// Temporary diagnostic, to be placed INSIDE the existing first-launch gate.
// No mailbox credentials, message reads, sends, or database writes.
export function withMailboxRuntimeDiagnostic(application, { expectedHmacDigest, expiresAt }) {
  return { async fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== '/api/admin/mailbox/diagnostics') return application.fetch(request, env, ctx)
    const denied = () => new Response('Not found', { status: 404 })
    if (request.method !== 'GET' || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return denied()
    const prefix = 'nilelink_access_token='
    const token = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length)
    let user
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET), { algorithms: ['HS256'] })
      if (payload.tokenType !== 'access' || typeof payload.userId !== 'string') return denied()
      const row = await env.DB.prepare('SELECT data FROM users WHERE id=?').bind(payload.userId).first()
      user = JSON.parse(row.data)
    } catch { return denied() }
    if (user.status !== 'active' || user.role !== 'super_admin') return denied()
    const key = env.MAILBOX_AGENT_HMAC_KEY || ''
    const report = {
      keyMatchesExpected: createHash('sha256').update(key).digest('hex') === expectedHmacDigest,
      processKeyMatchesBinding: process.env.MAILBOX_AGENT_HMAC_KEY === key,
      urlMatchesExpected: env.MAILBOX_AGENT_URL === 'https://mail-api.nilelinklogistics.com',
      processUrlMatchesBinding: process.env.MAILBOX_AGENT_URL === env.MAILBOX_AGENT_URL,
    }
    // Deliberately invalid action: verifies HMAC only, without logging into mail.
    const body = JSON.stringify({ action: 'diagnostic', actorId: user._id })
    const time = String(Date.now()), nonce = randomUUID()
    const signature = createHmac('sha256', Buffer.from(key, 'hex')).update(['POST', '/mailbox', time, nonce, body].join('\n')).digest('hex')
    try {
      const response = await fetch('https://mail-api.nilelinklogistics.com/mailbox', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-nl-mail-time': time, 'x-nl-mail-nonce': nonce, 'x-nl-mail-signature': signature },
        body, redirect: 'manual', signal: AbortSignal.timeout(20000), cache: 'no-store',
      })
      report.agentStatus = response.status
      const result = await response.json().catch(() => null)
      report.agentCode = /^[A-Z_0-9]+$/.test(result?.error?.code || '') ? result.error.code : 'NON_AGENT_RESPONSE'
    } catch { report.failureCode = 'FETCH_FAILED' }
    return Response.json(report, { headers: { 'cache-control': 'private, no-store' } })
  } }
}

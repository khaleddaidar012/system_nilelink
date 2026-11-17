import { createStagingGate } from './staging-gate.mjs'
import { timingSafeEqual } from 'node:crypto'

const cookieName = '__Host-nilelink_review'
const lifetime = 7200
const encoder = new TextEncoder()
function equal(a, b) {
  const left = encoder.encode(a), right = encoder.encode(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
async function signature(secret, origin, expires) {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), item => parseInt(item, 16)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`nilelink-prelaunch:${origin}:${expires}`))), item => item.toString(16).padStart(2, '0')).join('')
}
async function smallBody(request) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks = []; let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 512) { await reader.cancel(); throw new Error('Body too large') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return new TextDecoder().decode(bytes)
  } finally { reader.releaseLock() }
}

/** Authenticated review of the first-launch data, before public activation. */
export function createPrelaunchGate(application) {
  const gated = createStagingGate({ async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname
    const login = request.method === 'POST' && ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(pathname)
    if ((!['GET', 'HEAD'].includes(request.method) && !login) || /^\/api\/admin\/system\/backups(?:\/|$)/.test(pathname)) {
      return Response.json({ error: 'Unavailable before launch', code: 'PRELAUNCH_REVIEW_ONLY' }, { status: 403, headers: { 'cache-control': 'no-store' } })
    }
    return application.fetch(request, env, ctx)
  } })
  return { async fetch(request, env, ctx) {
    const url = new URL(request.url), secret = env.D1_STAGING_GATE_SECRET
    const configured = env.D1_RUNTIME_STAGE === 'isolated-staging' && /^[a-f0-9]{64}$/.test(secret || '')
    if (url.pathname === '/__prelaunch/access') {
      const denied = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
      const origin = request.headers.get('origin')
      if (!configured || request.method !== 'POST' || url.protocol !== 'https:' || (origin && origin !== 'null' && origin !== url.origin) || !(request.headers.get('content-type') || '').startsWith('application/x-www-form-urlencoded')) return denied()
      try {
        const body = new URLSearchParams(await smallBody(request))
        if ([...body.keys()].length !== 1 || !equal(body.get('review_key') || '', secret)) return denied()
        const expires = String(Math.floor(Date.now() / 1000) + lifetime)
        const token = `v1.${expires}.${await signature(secret, url.origin, expires)}`
        return new Response(null, { status: 303, headers: { location: '/ar/login', 'set-cookie': `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' } })
      } catch { return denied() }
    }
    if (configured) {
      const value = (request.headers.get('cookie') || '').split(';').map(item => item.trim()).find(item => item.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
      const match = /^v1\.(\d{10})\.([a-f0-9]{64})$/.exec(value || '')
      const now = Math.floor(Date.now() / 1000)
      if (match && Number(match[1]) > now && Number(match[1]) <= now + lifetime && equal(match[2], await signature(secret, url.origin, match[1]))) {
        const headers = new Headers(request.headers)
        headers.set('x-nilelink-staging-key', secret)
        return gated.fetch(new Request(request, { headers }), env, ctx)
      }
    }
    return gated.fetch(request, env, ctx)
  } }
}

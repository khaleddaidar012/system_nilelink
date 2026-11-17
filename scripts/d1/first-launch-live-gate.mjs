import { withApprovedFirstLaunchRequest } from '../../lib/db/staging-context.mjs'
import { jwtVerify } from 'jose'
import { retiredDemoPasswordFingerprints } from './retired-demo-passwords.mjs'
import { approvedPublicOrigins } from '../../lib/deployment/public-origin.mjs'

async function emptyBody(request) {
  const reader = request.clone().body?.getReader()
  if (!reader) return true
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return true
      if (value?.byteLength) { void reader.cancel(); return false }
    }
  } finally { reader.releaseLock() }
}

async function retiredCredential(request, env, fingerprints) {
  let row
  const pathname = new URL(request.url).pathname
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const reader = request.clone().body?.getReader()
    if (!reader) return false
    let size = 0; const parts = []
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > 16384) { void reader.cancel(); return true }
        parts.push(value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const value of parts) { bytes.set(value, offset); offset += value.length }
    let input
    try { input = JSON.parse(new TextDecoder().decode(bytes)) } catch { return false }
    if (typeof input.identifier !== 'string') return false
    const identifier = input.identifier.trim().toLowerCase()
    row = await env.DB.prepare("SELECT json_extract(data,'$.passwordHash') AS passwordHash FROM users WHERE email=? OR username=? LIMIT 1").bind(identifier, identifier).first()
  } else if (/^\/api\//.test(pathname) || /\/(?:admin|portal)(?:\/|$)/.test(pathname)) {
    const cookies = request.headers.get('cookie') || ''
    const name = pathname === '/api/auth/refresh' ? 'nilelink_refresh_token=' : 'nilelink_access_token='
    const token = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(name))?.slice(name.length)
    if (!token) return false
    let userId
    try { userId = (await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET), { algorithms: ['HS256'] })).payload.userId } catch { return false }
    if (typeof userId !== 'string') return false
    row = await env.DB.prepare("SELECT json_extract(data,'$.passwordHash') AS passwordHash FROM users WHERE id=?").bind(userId).first()
  }
  if (typeof row?.passwordHash !== 'string') return false
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.passwordHash))), item => item.toString(16).padStart(2, '0')).join('')
  return fingerprints.includes(hash)
}

/** Public login and normal authorized operations on the exact approved resources.
 * Account and tenant permissions remain inside the application handlers. */
export function createFirstLaunchLiveGate(application, { retiredFingerprints = retiredDemoPasswordFingerprints } = {}) {
  return { async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (env.D1_RUNTIME_STAGE !== 'first-launch-live' || env.D1_ACTIVATION_CONFIRMED !== 'true' ||
      env.DATABASE_PROVIDER !== 'd1' || env.D1_MIGRATION_PREVIEW !== 'true' ||
      env.D1_RESOURCE_ACCOUNT !== 'f882b38e4571e0141cb6353f5a271af7' ||
      env.D1_RESOURCE_DATABASE !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' ||
      env.D1_RESOURCE_FILES !== 'nilelink-production-files' || env.D1_BACKUP_SCOPE !== 'first-launch' ||
      !approvedPublicOrigins.includes(env.NEXT_PUBLIC_APP_URL) ||
      !approvedPublicOrigins.includes(url.origin) || !/^[a-f0-9]{64}$/.test(env.JWT_SECRET || '') || !env.DB?.prepare || !env.D1_PREVIEW_FILES?.get || !env.D1_BACKUPS?.get) {
      return new Response('Service unavailable', { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    if (url.pathname.startsWith('/__prelaunch/') || /^\/api\/(?:seed|env-test)(?:\/|$)/.test(url.pathname) || /^\/api\/admin\/system\/backups(?:\/|$)/.test(url.pathname)) return new Response('Not found', { status: 404 })
    if (env.EMAIL_DELIVERY_ENABLED !== 'true' && (/^\/api\/(?:contact|quote)(?:\/|$)/.test(url.pathname) || /\/(?:send|send-warning|send-otp|send-verification|forgot-password|reset-password|password-reset|verify-email|update-contact)(?:\/|$)/.test(url.pathname))) {
      return Response.json({ error: 'Email and external messaging are not configured yet.', code: 'DELIVERY_NOT_CONFIGURED' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    const origin = request.headers.get('origin')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin && origin !== url.origin) return Response.json({ error: 'Invalid request origin' }, { status: 403 })
    try {
      if (await retiredCredential(request, env, retiredFingerprints)) return Response.json({ error: 'This account needs a new password before it can be used. Contact the system administrator.', code: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403, headers: { 'cache-control': 'no-store' } })
    } catch { return Response.json({ error: 'Authentication check unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } }) }
    const headers = new Headers(request.headers)
    headers.delete('x-nilelink-staging-key')
    // OpenNext can expose an empty POST as a non-null stream. Preserve the
    // existing mark-all contract by forwarding explicit JSON to this handler.
    // Nonempty payloads remain unchanged and retain normal input/tenant checks.
    const emptyNotificationRead = url.pathname === '/api/portal/notifications/mark-read' && request.method === 'POST' && await emptyBody(request)
    if (emptyNotificationRead) { headers.set('content-type', 'application/json'); headers.delete('content-length') }
    return withApprovedFirstLaunchRequest(async () => {
      const response = await application.fetch(new Request(request, { headers, ...(emptyNotificationRead ? { body: '{}' } : {}) }), env, ctx)
      const result = new Response(response.body, response)
      if (url.pathname.startsWith('/api/') || /\/(?:admin|portal|login)(?:\/|$)/.test(url.pathname)) result.headers.set('cache-control', 'private, no-store')
      return result
    })
  } }
}

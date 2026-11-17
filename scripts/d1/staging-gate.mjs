import { timingSafeEqual } from 'node:crypto'
import { withIsolatedStagingRequest } from '../../lib/db/staging-context.mjs'

/** The entry point must wrap the entire application, including asset requests. */
export function createStagingGate(application) {
  return {
    async fetch(request, env, ctx) {
      const secret = env.D1_STAGING_GATE_SECRET
      const candidate = request.headers.get('x-nilelink-staging-key') ?? ''
      if (env.D1_RUNTIME_STAGE !== 'isolated-staging' || typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) {
        return new Response('Staging unavailable', { status: 503, headers: { 'cache-control': 'no-store' } })
      }
      const a = Buffer.from(secret), b = Buffer.from(candidate)
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
      }
      const url = new URL(request.url)
      // No external notification, scheduler, seeding or backup execution in this laboratory.
      const readOnlyBackupPage = request.method === 'GET' && /^\/[a-z]{2}\/admin\/system\/backups\/?$/.test(url.pathname)
      if (!readOnlyBackupPage && (/^\/api\/(?:seed|cron|contact|quote|env-test)(?:\/|$)/.test(url.pathname) || url.pathname === '/api/auth/register' || /\/(?:send|send-warning|send-otp|send-verification|forgot-password|reset-password|password-reset|verify-email|update-contact|backups?)(?:\/|$)/.test(url.pathname))) {
        return new Response('Disabled in staging', { status: 403, headers: { 'cache-control': 'no-store' } })
      }
      const headers = new Headers(request.headers)
      headers.delete('x-nilelink-staging-key')
      const clean = new Request(request, { headers })
      return withIsolatedStagingRequest(async () => {
        const response = await application.fetch(clean, env, ctx)
        const output = new Response(response.body, response)
        output.headers.set('cache-control', 'private, no-store')
        output.headers.set('x-robots-tag', 'noindex, nofollow')
        return output
      })
    },
  }
}

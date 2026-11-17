export async function runScheduledExpiry(worker, env, ctx) {
  if (!env.CRON_SECRET) throw new Error('CRON_SECRET is required for expiry scheduling')
  const request = new Request('https://nilelinklogistics.com/api/cron/check-expiries', {
    method: 'POST', headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  })
  const response = await worker.fetch(request, env, ctx)
  if (!response.ok) throw new Error(`Expiry scan failed: HTTP ${response.status}`)
  const data = await response.json()
  if (!data.success || data.results?.conflicts || data.results?.requiresReview) throw new Error('Expiry scan requires review or retry')
  return data
}

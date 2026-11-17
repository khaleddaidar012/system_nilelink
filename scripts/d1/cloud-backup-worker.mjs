import { timingSafeEqual } from 'node:crypto'
import { createCloudBackup, digest, validateBackupStage } from './cloud-backup-core.mjs'
import { claimScheduledBackup, finishScheduledBackup } from './cloud-backup-schedule.mjs'

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
async function requestedBackup(request, env, spec) {
  const requestId = request.headers.get('idempotency-key'), actorId = request.headers.get('x-nilelink-actor')
  if (!uuid.test(requestId || '') || !/^[a-f0-9]{24}$/.test(actorId || '')) return Response.json({ state: 'invalid' }, { status: 400 })
  const key = 'staging-jobs/' + await digest(new TextEncoder().encode(actorId + ':' + requestId)) + '.json'
  const existing = await env.BACKUPS.get(key)
  const respond = async job => {
    if (job.state === 'completed') {
      const data = job.receipt && await env.BACKUPS.head(job.receipt.objectKey)
      const marker = job.receipt && await env.BACKUPS.get(`staging-backups/${job.receipt.id}.complete.json`)
      if (!data || data.size !== job.receipt.encryptedBytes || data.customMetadata?.sha256 !== job.receipt.sha256 || !marker || JSON.stringify(await marker.json()) !== JSON.stringify(job.receipt)) job = { state: 'uncertain' }
    }
    return Response.json({ requestId, state: job.state, ...(job.receipt ? { receipt: job.receipt } : {}) }, { status: job.state === 'completed' ? 200 : job.state === 'processing' ? 202 : job.state === 'rate_limited' ? 429 : 409, headers: { 'cache-control': 'no-store' } })
  }
  if (existing) return respond(await existing.json())
  const job = { requestId, actorId, state: 'processing', startedAt: new Date().toISOString() }
  const claim = await env.BACKUPS.put(key, JSON.stringify(job), { onlyIf: { etagDoesNotMatch: '*' } })
  if (!claim) {
    const winner = await env.BACKUPS.get(key)
    return winner ? respond(await winner.json()) : Response.json({ state: 'uncertain' }, { status: 409 })
  }
  // Persist a claim before any backup side effect. Never take over an old claim.
  const save = state => env.BACKUPS.put(key, JSON.stringify({ ...job, ...state }), { onlyIf: { etagMatches: claim.etag } })
  try {
    const slot = Math.floor(Date.now() / 300000)
    const lease = await env.BACKUPS.put(`staging-job-limits/${slot}.json`, JSON.stringify({ requestId, startedAt: job.startedAt }), { onlyIf: { etagDoesNotMatch: '*' } })
    if (!lease) { const saved = await save({ state: 'rate_limited' }); return respond({ state: saved ? 'rate_limited' : 'uncertain' }) }
    const receipt = await createCloudBackup(env, spec)
    if (!await save({ state: 'completed', completedAt: new Date().toISOString(), receipt })) return respond({ state: 'uncertain' })
    return respond({ state: 'completed', receipt })
  } catch {
    await save({ state: 'uncertain', failedAt: new Date().toISOString() }).catch(() => {})
    return respond({ state: 'uncertain' })
  }
}

export function createBackupWorker(spec) { return {
  async fetch(request, env) {
    // No public listing or backup downloads, even with the trigger credential.
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/run' || !/^[a-f0-9]{64}$/.test(env.BACKUP_TRIGGER_KEY || '')) return new Response('Not found', { status: 404 })
    const candidate = new TextEncoder().encode(request.headers.get('authorization') || '')
    const expected = new TextEncoder().encode('Bearer ' + env.BACKUP_TRIGGER_KEY)
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return new Response('Not found', { status: 404 })
    if (request.headers.has('idempotency-key')) return requestedBackup(request, env, spec).catch(() => Response.json({ requestId: request.headers.get('idempotency-key'), state: 'uncertain' }, { status: 409 }))
    try { return Response.json(await createCloudBackup(env, spec), { headers: { 'cache-control': 'no-store' } }) }
    catch { return Response.json({ error: 'Backup incomplete; inspect private operations logs' }, { status: 503 }) }
  },
  async scheduled(controller, env) {
    const monitored = spec.scope === 'first-launch-snapshot-only'
    let runId = crypto.randomUUID(), startedAt = new Date().toISOString(), claim, receipt
    try {
      validateBackupStage(env, spec)
      if (monitored) {
        claim = await claimScheduledBackup(env.BACKUPS, controller.scheduledTime || Date.now())
        if (!claim) return
        runId = claim.record.runId; startedAt = claim.record.startedAt
        if (!await env.BACKUPS.put(`backup-runs/${runId}.json`, JSON.stringify({ format: 'nilelink-backup-run-v1', runId, trigger: 'scheduled', state: 'processing', startedAt, scheduledFor: claim.record.scheduledFor }), { onlyIf: { etagDoesNotMatch: '*' } })) throw Error('Run start not stored')
      }
      receipt = await createCloudBackup(env, spec, { trigger: 'scheduled' })
      if (monitored) {
        const stored = await env.BACKUPS.put(`backup-runs/${runId}.json`, JSON.stringify({ format: 'nilelink-backup-run-v1', runId, trigger: 'scheduled', state: 'completed', startedAt, finishedAt: new Date().toISOString(), backupId: receipt.id, records: receipt.records, files: receipt.files }))
        if (!stored) throw new Error('Run receipt not stored')
        await finishScheduledBackup(env.BACKUPS, claim, receipt)
      }
      console.log(JSON.stringify({ event: monitored ? 'first-launch-backup-completed' : 'staging-backup-completed', id: receipt.id, records: receipt.records, files: receipt.files }))
    } catch {
      if (monitored) {
        await env.BACKUPS.put(`backup-runs/${runId}.json`, JSON.stringify({ format: 'nilelink-backup-run-v1', runId, trigger: 'scheduled', state: receipt ? 'uncertain' : 'failed', startedAt, finishedAt: new Date().toISOString(), backupId: receipt?.id || null })).catch(() => {})
        if (claim) await finishScheduledBackup(env.BACKUPS, claim, receipt).catch(() => {})
      }
      console.error(monitored ? 'first-launch-backup-failed-or-uncertain' : 'staging-backup-failed')
      throw new Error('Scheduled backup incomplete or requires review')
    }
  },
} }

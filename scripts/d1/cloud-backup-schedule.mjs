const leaseMs = 15 * 60 * 1000
const maxAttempts = 3

async function completedObjectExists(bucket, receipt) {
  if (!receipt || !/^[a-f0-9-]{36}$/.test(receipt.id || '') || receipt.objectKey !== `staging-backups/${receipt.id}.aesgcm`) return false
  const marker = await bucket.get(`staging-backups/${receipt.id}.complete.json`)
  const object = await bucket.head(receipt.objectKey)
  return !!marker && !!object && object.size === receipt.encryptedBytes && object.customMetadata?.sha256 === receipt.sha256 && JSON.stringify(await marker.json()) === JSON.stringify(receipt)
}

// The hourly trigger only retries today's missed daily backup. Successful days
// are skipped; conditional R2 claims prevent concurrent runs duplicating work.
export async function claimScheduledBackup(bucket, scheduledTime = Date.now(), now = Date.now()) {
  const day = new Date(scheduledTime).toISOString().slice(0, 10)
  const due = Date.parse(`${day}T01:30:00.000Z`)
  if (scheduledTime < due) return null
  const key = `scheduled-days/${day}.json`
  const stored = await bucket.get(key)
  const previous = stored ? await stored.json() : null
  if (previous) {
    if (previous.format !== 'nilelink-scheduled-day-v1' || previous.day !== day || !Number.isSafeInteger(previous.attempts) || previous.attempts < 1 || !['processing', 'completed', 'failed'].includes(previous.state)) throw Error('Invalid scheduled backup ledger')
    if (previous.state === 'completed' && await completedObjectExists(bucket, previous.receipt)) return null
    if (previous.state === 'processing' && now - Date.parse(previous.startedAt) < leaseMs) return null
    if (previous.attempts >= maxAttempts) return null
    if (!stored.etag) throw Error('Scheduled backup version unavailable')
  }
  const record = { format: 'nilelink-scheduled-day-v1', day, state: 'processing', attempts: (previous?.attempts || 0) + 1, runId: crypto.randomUUID(), startedAt: new Date(now).toISOString(), scheduledFor: new Date(due).toISOString() }
  const saved = await bucket.put(key, JSON.stringify(record), { onlyIf: stored ? { etagMatches: stored.etag } : { etagDoesNotMatch: '*' } })
  return saved ? { key, etag: saved.etag, record } : null
}

export async function finishScheduledBackup(bucket, claim, receipt) {
  const record = { ...claim.record, state: receipt ? 'completed' : 'failed', finishedAt: new Date().toISOString(), ...(receipt ? { receipt } : {}) }
  if (!await bucket.put(claim.key, JSON.stringify(record), { onlyIf: { etagMatches: claim.etag } })) throw Error('Scheduled backup ownership changed')
}

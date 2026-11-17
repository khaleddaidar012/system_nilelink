import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimScheduledBackup, finishScheduledBackup } from '../../scripts/d1/cloud-backup-schedule.mjs'

function bucket() {
  const rows = new Map(); let revision = 0
  return { rows, async get(key) { const row = rows.get(key); return row ? { etag: row.etag, json: async () => JSON.parse(row.value) } : null }, async head(key) { return rows.get(key)?.metadata || null }, async put(key, value, options = {}) {
    const old = rows.get(key)
    if (options.onlyIf?.etagDoesNotMatch === '*' && old || options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null
    const etag = String(++revision); rows.set(key, { value, etag }); return { etag }
  } }
}
const due = Date.parse('2026-10-26T01:30:00Z')
test('a scheduled day is claimed once concurrently and not before the primary daily time', async () => {
  const b = bucket()
  assert.equal(await claimScheduledBackup(b, due - 1, due - 1), null)
  const claims = await Promise.all([claimScheduledBackup(b, due, due), claimScheduledBackup(b, due, due)])
  assert.equal(claims.filter(Boolean).length, 1)
  assert.equal(await claimScheduledBackup(b, due + 300000, due + 300000), null)
})
test('a completed day skips retries only while its matching completion receipt and object exist', async () => {
  const b = bucket(), claim = await claimScheduledBackup(b, due, due)
  const id = '00000000-0000-4000-8000-000000000001'
  const receipt = { id, objectKey: `staging-backups/${id}.aesgcm`, encryptedBytes: 50, sha256: 'ab'.repeat(32) }
  b.rows.set(receipt.objectKey, { metadata: { size: 50, customMetadata: { sha256: receipt.sha256 } } })
  await b.put(`staging-backups/${id}.complete.json`, JSON.stringify(receipt))
  await finishScheduledBackup(b, claim, receipt)
  assert.equal(await claimScheduledBackup(b, due + 3600000, due + 3600000), null)
  b.rows.delete(receipt.objectKey)
  assert.equal((await claimScheduledBackup(b, due + 3600000, due + 3600000)).record.attempts, 2)
})
test('failed and abandoned runs get bounded retries; stale owners cannot overwrite a newer claim', async () => {
  const b = bucket(), first = await claimScheduledBackup(b, due, due)
  const second = await claimScheduledBackup(b, due + 16 * 60000, due + 16 * 60000)
  assert.equal(second.record.attempts, 2)
  await assert.rejects(() => finishScheduledBackup(b, first), /ownership changed/)
  await finishScheduledBackup(b, second)
  const third = await claimScheduledBackup(b, due + 3600000, due + 3600000)
  assert.equal(third.record.attempts, 3)
  await finishScheduledBackup(b, third)
  assert.equal(await claimScheduledBackup(b, due + 7200000, due + 7200000), null)
  assert.equal((await claimScheduledBackup(b, due + 86400000, due + 86400000)).record.attempts, 1)
})

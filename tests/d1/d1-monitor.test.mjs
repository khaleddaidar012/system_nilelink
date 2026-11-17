import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readD1BackupMonitor } from '../../lib/backup/d1-monitor.ts'
const id = '00000000-0000-4000-8000-000000000001', runId = '00000000-0000-4000-8000-000000000002'
const firstDue = '2026-10-22T01:30:00.000Z', sha = 'ab'.repeat(32)
const receipt = { format: 'nilelink-backup-receipt-v1', id, objectKey: `staging-backups/${id}.aesgcm`, sha256: sha, encryptedBytes: 1234, trigger: 'manual', tables: 23, records: 2073, files: 53, omittedFiles: 1, verifiedAt: '2026-10-21T05:30:00.000Z' }
function bucket(receipts = [receipt], runs = [], present = true) {
  const objects = new Map([...receipts.map(row => [`staging-backups/${row.id}.complete.json`, row]), ...runs.map(row => [`backup-runs/${row.runId}.json`, row])])
  return { async list({ prefix }) { return { objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false } }, async get(key) { const row = objects.get(key); return row ? { size: 400, json: async () => row } : null }, async head() { return present ? { size: 1234, customMetadata: { sha256: sha } } : null } }
}
test('configured first run is not claimed as observed; summary omits sensitive fields', async () => {
  const data = await readD1BackupMonitor(bucket(), '30 1 * * *', firstDue, Date.parse('2026-10-21T18:00:00Z'))
  assert.equal(data.monitoring, 'connected'); assert.equal(data.totalBackups, 1)
  assert.equal(data.firstScheduledRunObserved, false); assert.equal(data.missedScheduledBackup, false)
  assert.equal(data.nextScheduledRun, firstDue)
  assert.ok(!JSON.stringify(data).includes(sha)); assert.ok(!JSON.stringify(data).includes('.aesgcm'))
})

test('reviewed shipment schema receipts stay healthy and unknown schemas fail closed', async () => {
  for (const tables of [23, 26, 27, 28, '27']) {
    const data = await readD1BackupMonitor(bucket([{ ...receipt, tables }]), '30 1 * * *', firstDue, Date.parse('2026-10-21T18:00:00Z'))
    assert.equal(data.monitoring, [23, 26, 27].includes(tables) ? 'connected' : 'unavailable')
  }
})
test('a recent manual copy cannot hide a missed scheduled run; grace period is respected', async () => {
  const fresh = { ...receipt, verifiedAt: '2026-10-22T04:00:00Z' }
  assert.equal((await readD1BackupMonitor(bucket([{ ...receipt, verifiedAt: '2026-10-22T01:00:00Z' }]), '30 1 * * *', firstDue, Date.parse('2026-10-22T02:00:00Z'))).missedScheduledBackup, false)
  const data = await readD1BackupMonitor(bucket([fresh]), '30 1 * * *', firstDue, Date.parse('2026-10-22T04:01:00Z'))
  assert.equal(data.missedScheduledBackup, true); assert.equal(data.isBackupOverdue, false)
})
test('successful scheduled receipt proves observation; recovered failures remain historical', async () => {
  const scheduled = { ...receipt, trigger: 'scheduled', verifiedAt: '2026-10-22T01:31:00Z' }
  const failed = { format: 'nilelink-backup-run-v1', runId, trigger: 'scheduled', state: 'failed', finishedAt: '2026-10-21T01:30:00Z' }
  const data = await readD1BackupMonitor(bucket([scheduled], [failed]), '30 1 * * *', firstDue, Date.parse('2026-10-22T04:00:00Z'))
  assert.equal(data.firstScheduledRunObserved, true); assert.equal(data.latestBackupStatus, 'completed')
  assert.equal(data.failedBackups, 1); assert.equal(data.missedScheduledBackup, false)
})
test('missing objects, invalid markers and missing configuration never report healthy', async () => {
  for (const r2 of [bucket([receipt], [], false), bucket([{ ...receipt, sha256: 'wrong' }]), undefined]) {
    const data = await readD1BackupMonitor(r2, '30 1 * * *', firstDue, Date.parse('2026-10-21T18:00:00Z'))
    assert.equal(data.monitoring, 'unavailable'); assert.equal(data.agentStatus, 'unknown')
  }
})

test('started scheduled runs remain readable and abandoned runs are reported as uncertain', async () => {
  const pending = { format: 'nilelink-backup-run-v1', runId, trigger: 'scheduled', state: 'processing', startedAt: '2026-10-22T01:30:00Z' }
  const running = await readD1BackupMonitor(bucket([receipt], [pending]), '30 1 * * *', firstDue, Date.parse('2026-10-22T01:35:00Z'))
  assert.equal(running.monitoring, 'connected'); assert.equal(running.failedBackups, 0)
  const stalled = await readD1BackupMonitor(bucket([receipt], [pending]), '30 1 * * *', firstDue, Date.parse('2026-10-22T01:46:00Z'))
  assert.equal(stalled.monitoring, 'connected'); assert.equal(stalled.failedBackups, 1)
})

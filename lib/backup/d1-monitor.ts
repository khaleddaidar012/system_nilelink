interface Bucket {
  list(options: { prefix: string; limit: number; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>
  get(key: string): Promise<{ size: number; json(): Promise<any> } | null>
  head(key: string): Promise<{ size: number; customMetadata?: Record<string, string> } | null>
}
const uuid = '[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}'
const complete = new RegExp(`^staging-backups/(${uuid})\\.complete\\.json$`)
const run = new RegExp(`^backup-runs/(${uuid})\\.json$`)
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0

/** Receipts/object metadata only. Does not decrypt, trigger, mutate or expose keys. */
export async function readD1BackupMonitor(bucket?: Bucket, cron?: string, firstDue?: string, now = Date.now()) {
  const base = { provider: 'd1' as const, agentStatus: 'unknown', schedulerStatus: 'unknown', nextScheduledRun: null as string | null,
    lastCompletedAt: null as string | null, latestBackupStatus: 'unknown', totalBackups: 0, failedBackups: 0,
    missedScheduledBackup: false, lastSuccessfulBackupAgeHours: null as number | null, isBackupOverdue: false,
    firstScheduledRunObserved: false, lastScheduledCompletedAt: null as string | null, lastFailureAt: null as string | null,
    monitoring: 'unavailable', verification: 'receipt-and-object-metadata-only' }
  try {
    if (!bucket || cron !== '30 1 * * *' || !date(firstDue)) throw Error('Unconfigured')
    const receipts: any[] = [], failures: any[] = []
    async function list(prefix: string, visit: (key: string) => Promise<void>) {
      let cursor: string | undefined, seen = 0
      const cursors = new Set<string>()
      do {
        const page = await bucket!.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) })
        seen += page.objects.length
        if (seen > 2000 || (page.truncated && (!page.cursor || page.cursor === cursor))) throw Error('Incomplete inventory')
        for (const item of page.objects) await visit(item.key)
        cursor = page.truncated ? page.cursor : undefined
        if (cursor && cursors.has(cursor)) throw Error('Repeated cursor')
        if (cursor) cursors.add(cursor)
      } while (cursor)
    }
    await list('staging-backups/', async key => {
      const match = complete.exec(key)
      if (!match) return
      const object = await bucket.get(key)
      if (!object || object.size > 4096) throw Error('Invalid completion marker')
      const receipt = await object.json()
      if (receipt.format !== 'nilelink-backup-receipt-v1' || receipt.id !== match[1] || receipt.objectKey !== `staging-backups/${match[1]}.aesgcm` || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '') || !count(receipt.encryptedBytes) || receipt.encryptedBytes > 64 * 1024 * 1024 || !date(receipt.verifiedAt) || Date.parse(receipt.verifiedAt) > now + 300000 || !['manual', 'scheduled'].includes(receipt.trigger) || ![23,26,27].includes(receipt.tables) || !count(receipt.records) || !count(receipt.files) || !count(receipt.omittedFiles)) throw Error('Invalid receipt')
      const stored = await bucket.head(receipt.objectKey)
      if (!stored || stored.size !== receipt.encryptedBytes || stored.customMetadata?.sha256 !== receipt.sha256) throw Error('Backup object unavailable')
      receipts.push(receipt)
    })
    await list('backup-runs/', async key => {
      const match = run.exec(key)
      if (!match) return
      const object = await bucket.get(key)
      if (!object || object.size > 4096) throw Error('Invalid run')
      const record = await object.json()
      if (record.format !== 'nilelink-backup-run-v1' || record.runId !== match[1] || record.trigger !== 'scheduled' || !['processing', 'completed', 'failed', 'uncertain'].includes(record.state)) throw Error('Invalid run')
      if (record.state === 'processing') {
        if (!date(record.startedAt) || Date.parse(record.startedAt) > now + 300000) throw Error('Invalid run start')
        if (now - Date.parse(record.startedAt) > 15 * 60 * 1000) failures.push({ ...record, state: 'uncertain', finishedAt: record.startedAt })
        return
      }
      if (!date(record.finishedAt) || Date.parse(record.finishedAt) > now + 300000) throw Error('Invalid run finish')
      if (record.state !== 'completed') failures.push(record)
    })
    receipts.sort((a, b) => Date.parse(b.verifiedAt) - Date.parse(a.verifiedAt))
    failures.sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    const latest = receipts[0], scheduled = receipts.find(item => item.trigger === 'scheduled')
    const day = Math.floor(now / 86400000) * 86400000, today = day + 5400000
    const previous = today <= now ? today : today - 86400000
    const next = today > now ? today : today + 86400000
    const missed = previous >= Date.parse(firstDue!) && now > previous + 7200000 && (!scheduled || Date.parse(scheduled.verifiedAt) < previous)
    const age = latest ? Math.max(0, (now - Date.parse(latest.verifiedAt)) / 3600000) : null
    return { ...base, monitoring: 'connected', agentStatus: 'online', schedulerStatus: 'enabled', nextScheduledRun: new Date(next).toISOString(),
      lastCompletedAt: latest?.verifiedAt || null, latestBackupStatus: failures[0] && (!latest || Date.parse(failures[0].finishedAt) > Date.parse(latest.verifiedAt)) ? 'failed' : latest ? 'completed' : 'unknown',
      totalBackups: receipts.length, failedBackups: failures.length, lastFailureAt: failures[0]?.finishedAt || null,
      missedScheduledBackup: missed, lastSuccessfulBackupAgeHours: age === null ? null : Number(age.toFixed(1)), isBackupOverdue: age !== null && age > 26,
      firstScheduledRunObserved: !!scheduled, lastScheduledCompletedAt: scheduled?.verifiedAt || null }
  } catch { return { ...base, error: 'D1_BACKUP_MONITOR_UNAVAILABLE' } }
}

export async function firstLaunchBackupMonitor() {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const settings = env as unknown as { D1_BACKUPS?: Bucket; D1_BACKUP_SCOPE?: string; D1_BACKUP_CRON?: string; D1_BACKUP_FIRST_DUE?: string }
    if (settings.D1_BACKUP_SCOPE !== 'first-launch') return readD1BackupMonitor()
    return readD1BackupMonitor(settings.D1_BACKUPS, settings.D1_BACKUP_CRON, settings.D1_BACKUP_FIRST_DUE)
  } catch { return readD1BackupMonitor() }
}

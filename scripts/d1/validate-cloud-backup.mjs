import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { spawnSync } from 'node:child_process'
import { backupFileInventory } from './backup-file-inventory.mjs'
import { unseal, digest, base64ToBytes } from './cloud-backup-core.mjs'
import { reviewedBackupSchema } from './backup-schema.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2), firstLaunch = args[0] === '--first-launch'
if (firstLaunch) args.shift()
const target = path.join(root, firstLaunch ? '.private/d1-migration/first-launch/backup' : '.private/d1-migration/cloud-backup/staging-v1')
const inspectOnly = args.length === 1 && args[0] === '--inspect'
const existingId = args.length === 2 && args[0] === '--restore-existing' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(args[1]) ? args[1] : null
if (!inspectOnly && !existingId && (args.length !== 1 || args[0] !== '--execute')) throw new Error('Use [--first-launch] --execute, --inspect, or --restore-existing <backup-id>')
if (firstLaunch && inspectOnly) throw new Error('First-launch validation requires a completed backup or --execute')
const config = JSON.parse(await readFile(path.join(target, 'wrangler.json'), 'utf8'))
let spec = JSON.parse(await readFile(path.join(target, 'spec.json'), 'utf8'))
const secrets = JSON.parse(await readFile(path.join(target, 'secrets.json'), 'utf8'))
const bucketName = firstLaunch ? 'nilelink-production-backups' : 'nilelink-d1-staging-backups'
if (config.name !== (firstLaunch ? 'nilelink-first-launch-backup' : 'nilelink-d1-staging-backup') || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || spec.scope !== (firstLaunch ? 'first-launch-snapshot-only' : 'baseline-staging-only') || config.r2_buckets[1].bucket_name !== bucketName || (firstLaunch && (spec.source.databaseId !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' || spec.source.bucketName !== 'nilelink-production-files'))) throw new Error('Wrong backup target')
for (const key of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(key)) throw new Error('Authentication overrides forbidden')
const directory = path.join(target, 'validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: firstLaunch ? 'first-launch-encrypted-cloud-backup-and-local-restore' : 'deployed-staging-encrypted-cloud-backup-and-local-restore', sourceModified: false, productionCertified: false, status: 'started' }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
let proxy, db
async function connectForRestore() {
  if (proxy) return
  if (firstLaunch) {
    // Direct authenticated R2 API avoids the unstable remote development tunnel.
    let downloadNumber = 0
    proxy = { dispose: async () => {}, env: { BACKUPS: { get: async key => {
      if (!/^staging-backups\/[a-f0-9-]{36}\.(?:aesgcm|complete\.json)$/.test(key)) throw new Error('Unreviewed backup key')
      const filename = path.join(directory, `download-${downloadNumber++}.bin`)
      const child = spawnSync(process.execPath, ['--use-system-ca', path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'r2', 'object', 'get', `${bucketName}/${key}`, '--remote', '--file', filename, '--config', path.join(target, 'wrangler.json'), '--env-file', path.join(target, 'empty.env')], { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 180000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
      if (child.status !== 0) throw new Error('Backup download failed')
      const bytes = await readFile(filename)
      return { size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes.toString('utf8')) }
    } } } }
    return
  }
  const proxyConfig = { name: 'nilelink-backup-restore-validation', account_id: config.account_id, compatibility_date: '2025-04-01', r2_buckets: [{ binding: 'BACKUPS', bucket_name: 'nilelink-d1-staging-backups', remote: true }] }
  const configPath = path.join(directory, 'wrangler.json')
  await writeFile(configPath, JSON.stringify(proxyConfig), { flag: 'wx', mode: 0o600 })
  proxy = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
}
try {
  await save()
  if (inspectOnly) {
    const configPath = path.join(directory, 'wrangler.json')
    await writeFile(configPath, JSON.stringify({ name: 'nilelink-backup-readonly-inventory', account_id: config.account_id, compatibility_date: '2025-04-01', r2_buckets: [{ binding: 'BACKUPS', bucket_name: 'nilelink-d1-staging-backups', remote: true }] }), { flag: 'wx', mode: 0o600 })
    proxy = await getPlatformProxy({ configPath, envFiles: [], persist: false, remoteBindings: true })
    const receipts = []; let cursor
    do {
      const page = await proxy.env.BACKUPS.list({ prefix: 'staging-backups/', limit: 1000, ...(cursor ? { cursor } : {}) })
      for (const item of page.objects) if (/\/[^/]+\.complete\.json$/.test(item.key)) {
        const object = await proxy.env.BACKUPS.get(item.key), receipt = await object.json()
        if (receipt.format !== 'nilelink-backup-receipt-v1' || !/^staging-backups\/[a-f0-9-]{36}\.aesgcm$/.test(receipt.objectKey)) throw new Error('Invalid backup marker')
        const data = await proxy.env.BACKUPS.head(receipt.objectKey)
        if (!data || data.size !== receipt.encryptedBytes || data.customMetadata?.sha256 !== receipt.sha256) throw new Error('Incomplete backup object')
        receipts.push({ id: receipt.id, trigger: receipt.trigger || 'legacy-unknown', verifiedAt: receipt.verifiedAt, records: receipt.records, files: receipt.files, encryptedBytes: receipt.encryptedBytes })
      }
      if (receipts.length > 1000) throw new Error('Inventory limit exceeded')
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
    Object.assign(report, { scope: 'read-only-cloud-backup-inventory', status: 'inventory-checked', receipts, scheduledReceipts: receipts.filter(r => r.trigger === 'scheduled').length, checkedAt: new Date().toISOString(), newBackupCreated: false })
    await save(); console.log(JSON.stringify({ directory, ...report }))
  } else {
  let receipt
  if (existingId) {
    await connectForRestore()
    const marker = await proxy.env.BACKUPS.get(`staging-backups/${existingId}.complete.json`)
    if (!marker) throw new Error('Existing completed backup not found')
    receipt = await marker.json()
    if (receipt.id !== existingId || receipt.objectKey !== `staging-backups/${existingId}.aesgcm`) throw new Error('Existing backup identity mismatch')
    report.newBackupCreated = false
  } else {
  const url = firstLaunch ? 'https://nilelink-first-launch-backup.mohamedznaty55.workers.dev/run' : 'https://nilelink-d1-staging-backup.mohamedznaty55.workers.dev/run'
  if ((await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000) })).status !== 404) throw new Error('Unprotected trigger')
  const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + secrets.BACKUP_TRIGGER_KEY }, signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw new Error('Deployed backup failed: HTTP ' + response.status)
  receipt = await response.json()
  report.newBackupCreated = true
  }
  if (receipt.format !== 'nilelink-backup-receipt-v1' || !/^staging-backups\/[a-f0-9-]{36}\.aesgcm$/.test(receipt.objectKey)) throw new Error('Invalid receipt')
  report.receipt = receipt; report.status = 'cloud-backup-created'; await save()
  await connectForRestore()
  const object = await proxy.env.BACKUPS.get(receipt.objectKey)
  if (!object || object.size !== receipt.encryptedBytes || object.size > 48 * 1024 * 1024) throw new Error('Backup object unavailable')
  const encrypted = new Uint8Array(await object.arrayBuffer())
  if (await digest(encrypted) !== receipt.sha256) throw new Error('Cloud checksum mismatch')
  await writeFile(path.join(directory, 'backup.aesgcm'), encrypted, { flag: 'wx', mode: 0o600 })
  const backup = JSON.parse(new TextDecoder().decode(await unseal(encrypted, secrets.BACKUP_ENCRYPTION_KEY, receipt.objectKey)))
  spec = reviewedBackupSchema(spec, backup.database.ddl)
  if (backup.inventoryMode && (!firstLaunch || backup.inventoryMode !== 'database-documents-and-pending-v1')) throw new Error('Unreviewed file inventory mode')
  const inventory = backupFileInventory(backup.database, { ...spec, inventoryMode: backup.inventoryMode })
  if (backup.format !== (firstLaunch ? 'nilelink-encrypted-prelaunch-backup-v1' : 'nilelink-encrypted-staging-backup-v1') || JSON.stringify(backup.source) !== JSON.stringify(spec.source) || JSON.stringify(backup.database.ddl) !== JSON.stringify(spec.ddl) || backup.database.tables.length !== spec.tables.length || backup.files.length !== inventory.files.length || JSON.stringify(backup.omittedFiles) !== JSON.stringify(inventory.omittedFiles)) throw new Error('Backup scope mismatch')
  if (backup.database.tables.reduce((n, t) => n + t.rows.length, 0) !== receipt.records || backup.files.length !== receipt.files || backup.trigger !== receipt.trigger) throw new Error('Receipt differs from encrypted backup')
  db = new DatabaseSync(':memory:', { allowExtension: false, defensive: true })
  db.exec(spec.ddl.join(';\n'))
  db.exec('PRAGMA foreign_keys=ON; BEGIN; PRAGMA defer_foreign_keys=ON;')
  for (let i = 0; i < spec.tables.length; i++) {
    const table = backup.database.tables[i], expected = spec.tables[i]
    if (table.name !== expected.name || JSON.stringify(table.columns) !== JSON.stringify(expected.columns)) throw new Error('Backup table mismatch')
    const insert = db.prepare(`INSERT INTO ${expected.name} (${expected.columns.join(',')}) VALUES (${expected.columns.map(() => '?').join(',')})`)
    for (const row of table.rows) insert.run(...expected.columns.map(c => row[c]))
  }
  db.exec('COMMIT')
  for (const table of backup.database.tables) {
    const rows = db.prepare(`SELECT ${table.columns.join(',')} FROM ${table.name} ORDER BY ${table.columns[0]}`).all()
    if (JSON.stringify(rows) !== JSON.stringify(table.rows)) throw new Error('Restored rows mismatch')
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length || Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw new Error('Restored integrity failure')
  const objectsDir = path.join(directory, 'restored-files'); await mkdir(objectsDir, { mode: 0o700 })
  let restoredBytes = 0
  for (let i = 0; i < backup.files.length; i++) {
    const file = backup.files[i], expected = inventory.files[i], bytes = base64ToBytes(file.base64)
    const expectedSize = expected.pendingUpload ? file.size : expected.size
    const expectedHash = expected.pendingUpload ? file.sha256 : expected.sha256
    if (file.key !== expected.key || !Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 10 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(expectedHash || '') || file.size !== expectedSize || file.sha256 !== expectedHash || bytes.length !== expectedSize || await digest(bytes) !== expectedHash) throw new Error('Restored file mismatch')
    const filename = path.join(objectsDir, String(i).padStart(4, '0') + '.bin')
    await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
    if (await digest(await readFile(filename)) !== expectedHash) throw new Error('Restored disk bytes mismatch')
    restoredBytes += bytes.length
  }
  const marker = await proxy.env.BACKUPS.get(receipt.objectKey.replace('.aesgcm', '.complete.json'))
  if (!marker || JSON.stringify(await marker.json()) !== JSON.stringify(receipt)) throw new Error('Completion receipt mismatch')
  if (restoredBytes !== receipt.fileBytes) throw new Error('Receipt byte total differs')
  Object.assign(report, { status: 'cloud-backup-and-restore-verified', verifiedTables: spec.tables.length, verifiedRecords: receipt.records, restoredFiles: backup.files.length, restoredFileBytes: restoredBytes,
    omittedFiles: backup.omittedFiles.length, foreignKeys: 'ok', quickCheck: 'ok', checkedAt: new Date().toISOString() }); await save()
  console.log(JSON.stringify({ directory, ...report }))
  }
} catch (error) {
  report.status = 'failed'; await save(); await writeFile(path.join(directory, 'private-error.txt'), String(error.stack || error), { mode: 0o600 })
  console.error('Cloud backup validation stopped. Inspect private report; no source data was changed.'); process.exitCode = 1
} finally { db?.close(); await proxy?.dispose() }

import { backupFileInventory } from './backup-file-inventory.mjs'
import { reviewedBackupSchema } from './backup-schema.mjs'
const encoder = new TextEncoder()
export const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
const normalize = sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '')
const schemaQuery = "SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations') AND tbl_name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations')"
export function bytesToBase64(bytes) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384))
  return btoa(text)
}
export function base64ToBytes(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)) }
async function keyFor(hex) {
  if (!/^[a-f0-9]{64}$/.test(hex || '')) throw new Error('Backup encryption key unavailable')
  return crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g), b => parseInt(b, 16)), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function seal(bytes, keyHex, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await keyFor(keyHex), bytes))
  const result = new Uint8Array(12 + cipher.length); result.set(iv); result.set(cipher, 12); return result
}
export async function unseal(bytes, keyHex, context) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(context) }, await keyFor(keyHex), bytes.subarray(12)))
}
export function validateBackupStage(env, spec) {
  if (env.BACKUP_STAGE === 'isolated-staging' && spec.scope === 'baseline-staging-only') return
  if (env.BACKUP_STAGE === 'prelaunch' && spec.scope === 'first-launch-snapshot-only' &&
    spec.source?.accountId === 'f882b38e4571e0141cb6353f5a271af7' &&
    spec.source?.databaseId === '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' &&
    spec.source?.bucketName === 'nilelink-production-files') return
  throw new Error('Unreviewed backup stage')
}
export async function captureDatabase(db, spec) {
  const currentSchema = await db.prepare(schemaQuery).all()
  if (!currentSchema.success) throw new Error('Schema unavailable')
  spec = reviewedBackupSchema(spec, currentSchema.results.map(row => row.sql))
  if (spec.tables.some(t => !/^[a-z_]+$/.test(t.name) || t.columns.some(c => !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(c)))) throw new Error('Unreviewed schema')
  const results = await db.batch([db.prepare(schemaQuery), ...spec.tables.map(t => db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.name} ORDER BY ${t.columns[0]}`)), db.prepare('PRAGMA foreign_key_check'), db.prepare('PRAGMA quick_check')])
  if (results.length !== spec.tables.length + 3 || results.some(r => r.success !== true)) throw new Error('Incomplete database capture')
  if (JSON.stringify(results[0].results.map(r => normalize(r.sql)).sort()) !== JSON.stringify(spec.ddl.map(normalize).sort())) throw new Error('Schema mismatch')
  if (results.at(-2).results.length || Object.values(results.at(-1).results[0] || {})[0] !== 'ok') throw new Error('Database integrity failure')
  const tables = spec.tables.map((t, i) => ({ ...t, rows: results[i + 1].results }))
  if (tables.reduce((n, t) => n + t.rows.length, 0) > 5000) throw new Error('Backup record limit exceeded')
  return { ddl: spec.ddl, tables }
}
export async function createCloudBackup(env, spec, { trigger = 'manual' } = {}) {
  if (!['manual', 'scheduled'].includes(trigger)) throw new Error('Unknown backup trigger')
  validateBackupStage(env, spec)
  await keyFor(env.BACKUP_ENCRYPTION_KEY)
  const database = await captureDatabase(env.DB, spec), files = []
  const inventory = backupFileInventory(database, spec)
  let totalBytes = 0
  for (const object of inventory.files) {
    const source = await env.SOURCE_FILES.get(object.key)
    const expectedSize = object.pendingUpload ? source?.size : object.size
    const expectedHash = object.pendingUpload ? source?.customMetadata?.sha256 : object.sha256
    if (!source || !Number.isSafeInteger(expectedSize) || expectedSize < 0 || source.size !== expectedSize || source.size > 10 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(expectedHash || '')) throw new Error('Source file unavailable')
    const bytes = new Uint8Array(await source.arrayBuffer())
    totalBytes += bytes.length
    if (totalBytes > 32 * 1024 * 1024 || bytes.length !== expectedSize || await digest(bytes) !== expectedHash) throw new Error('Source file mismatch')
    files.push({ key: object.key, size: bytes.length, sha256: expectedHash, base64: bytesToBase64(bytes) })
  }
  // A changing source must not produce a success receipt for a mixed snapshot.
  if (JSON.stringify(await captureDatabase(env.DB, spec)) !== JSON.stringify(database)) throw new Error('Database changed during file capture')
  const id = crypto.randomUUID(), objectKey = `staging-backups/${id}.aesgcm`
  const backup = { format: spec.scope === 'first-launch-snapshot-only' ? 'nilelink-encrypted-prelaunch-backup-v1' : 'nilelink-encrypted-staging-backup-v1', trigger, createdAt: new Date().toISOString(),
    ...(spec.inventoryMode ? { inventoryMode: spec.inventoryMode } : {}), source: spec.source, database, files, omittedFiles: inventory.omittedFiles, productionCertified: false }
  const plain = encoder.encode(JSON.stringify(backup))
  if (plain.length > 48 * 1024 * 1024) throw new Error('Backup byte limit exceeded')
  const encrypted = await seal(plain, env.BACKUP_ENCRYPTION_KEY, objectKey)
  const sha256 = await digest(encrypted)
  const put = await env.BACKUPS.put(objectKey, encrypted, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256 } })
  if (!put) throw new Error('Backup key collision')
  const stored = await env.BACKUPS.get(objectKey)
  if (!stored || stored.size !== encrypted.length) throw new Error('Backup readback missing')
  const readback = new Uint8Array(await stored.arrayBuffer())
  if (await digest(readback) !== sha256 || await digest(await unseal(readback, env.BACKUP_ENCRYPTION_KEY, objectKey)) !== await digest(plain)) throw new Error('Backup readback mismatch')
  const receipt = { format: 'nilelink-backup-receipt-v1', trigger, id, objectKey, sha256, encryptedBytes: encrypted.length,
    tables: database.tables.length, records: database.tables.reduce((n, t) => n + t.rows.length, 0), files: files.length,
    fileBytes: totalBytes, omittedFiles: inventory.omittedFiles.length, verifiedAt: new Date().toISOString(), productionCertified: false }
  const marker = await env.BACKUPS.put(`staging-backups/${id}.complete.json`, JSON.stringify(receipt), { onlyIf: { etagDoesNotMatch: '*' } })
  if (!marker) throw new Error('Completion marker collision')
  return receipt
}

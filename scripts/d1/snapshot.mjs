import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { BSON } from 'mongodb'

// Verified against model.collection.name, not inferred English pluralization.
export const collectionTables = Object.freeze({
  customers: 'customers', users: 'users', roleconfigs: 'role_configs',
  systemsettings: 'system_settings', serviceconfigs: 'service_configs',
  pricingrules: 'pricing_rules', customerrequests: 'customer_requests',
  requestservices: 'request_services', documents: 'documents',
  documentactivitylogs: 'document_activity_logs', quotes: 'quotes',
  quoteitems: 'quote_items', invoices: 'invoices', invoicesequences: 'invoice_sequences',
  invoiceactivitylogs: 'invoice_activity_logs', payments: 'payments',
  notifications: 'notifications', analyticsevents: 'analytics_events',
  systemauditlogs: 'system_audit_logs',
})

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/**
 * Lossless source remains in raw BSON. Convert only types whose runtime meaning
 * is understood by the application. Reject rather than truncate unsupported data.
 */
export function toApplicationValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error('Unsupported non-finite or negative-zero number')
    return value
  }
  if (value instanceof BSON.ObjectId) return value.toHexString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof BSON.Int32 || value instanceof BSON.Double) return toApplicationValue(value.valueOf())
  if (Array.isArray(value)) return value.map(toApplicationValue)
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toApplicationValue(item)]))
  }
  throw new Error('Unsupported BSON value: a reviewed lossless mapping is required')
}

export function decodeRecord(line) {
  const record = JSON.parse(line)
  if (typeof record.bson !== 'string' || typeof record.sha256 !== 'string') throw new Error('Invalid snapshot record')
  const bytes = Buffer.from(record.bson, 'base64')
  if (bytes.toString('base64') !== record.bson || sha256(bytes) !== record.sha256) throw new Error('Snapshot record checksum mismatch')
  const source = BSON.deserialize(bytes, { promoteValues: false })
  // Duplicate BSON keys, legacy undefined values and property-order changes
  // must not disappear silently during decoding into a JavaScript object.
  if (!BSON.serialize(source).equals(bytes)) throw new Error('BSON round-trip mismatch: explicit mapping is required')
  const document = toApplicationValue(source)
  if (!document || typeof document._id !== 'string' || !document._id) throw new Error('Document requires its original string or ObjectId identity')
  const data = JSON.stringify(document)
  // Conservative headroom below D1's 2 MB string/row ceiling, including indexes.
  // Larger records require a separately reviewed storage strategy.
  if (Buffer.byteLength(data) > 1_500_000) throw new Error('Document exceeds conservative D1 import size limit')
  return { id: document._id, data, document }
}

export async function* readRecords(file) {
  const input = createReadStream(file, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (!line) throw new Error('Unexpected empty record in snapshot')
      yield decodeRecord(line)
    }
  } finally {
    lines.close()
    input.destroy()
  }
}

/** Validate the entire source before any rehearsal writes. Never trust manifest paths. */
export async function validateSnapshot(directory) {
  const root = await realpath(directory)
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
  if (manifest.formatVersion !== 1 || manifest.status !== 'complete' || !Array.isArray(manifest.collections)) {
    throw new Error('Incomplete or unsupported snapshot')
  }
  const seen = new Set()
  const files = new Map()
  for (const entry of manifest.collections) {
    if (!Object.hasOwn(collectionTables, entry.name)) throw new Error('Unmapped source collection: review is required before migration')
    if (entry.type !== 'collection') throw new Error('Source views require an explicit migration strategy')
    if (seen.has(entry.name)) throw new Error('Duplicate source collection')
    seen.add(entry.name)
    if (typeof entry.file !== 'string' || !/^collection-\d+\.jsonl$/.test(entry.file)) throw new Error('Unsafe snapshot filename')
    const file = await realpath(path.join(root, entry.file))
    if (path.dirname(file) !== root) throw new Error('Snapshot file escapes source directory')
    if (files.has(file)) throw new Error('Snapshot file reused by multiple collections')
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) throw new Error('Invalid source record count')
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(file)) digest.update(chunk)
    if (digest.digest('hex') !== entry.sha256) throw new Error('Snapshot collection checksum mismatch')
    let count = 0
    for await (const record of readRecords(file)) { void record; count++ }
    if (count !== entry.count) throw new Error('Snapshot collection count mismatch')
    files.set(file, { ...entry, table: collectionTables[entry.name], file })
  }
  return { manifest, files: [...files.values()] }
}

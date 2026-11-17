import { randomUUID, createHash } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MongoClient, BSON } from 'mongodb'
import { sha256 } from './snapshot.mjs'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('node --env-file=.env.local scripts/d1/export-mongo.mjs --database <name> [--writes-frozen]')
  console.log('Read-only MongoDB export into .private/d1-migration/<unique-id>. No D1 writes or production switch.')
  process.exit(0)
}
const databaseIndex = args.indexOf('--database')
const databaseName = databaseIndex >= 0 ? args[databaseIndex + 1] : undefined
if (!databaseName || databaseName.startsWith('--') || !process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI privately and provide --database <name>. Use --help for usage.')
  process.exit(1)
}
const allowedArgs = args.filter((_, index) => index !== databaseIndex && index !== databaseIndex + 1)
if (allowedArgs.some(arg => arg !== '--writes-frozen')) {
  console.error('Unknown export argument')
  process.exit(1)
}

const directory = path.resolve('.private', 'd1-migration', randomUUID())
const client = new MongoClient(process.env.MONGODB_URI, {
  appName: 'nilelink-d1-readonly-export',
  serverSelectionTimeoutMS: 15_000,
  readPreference: 'primary',
  readConcern: { level: 'majority' },
})

try {
  await client.connect()
  const db = client.db(databaseName)
  const collections = await db.listCollections({}, { nameOnly: false }).toArray()
  await mkdir(path.dirname(directory), { recursive: true })
  await mkdir(directory, { mode: 0o700 })
  await writeFile(path.join(directory, 'EXPORT_STATUS'), 'incomplete\n', { flag: 'wx', mode: 0o600 })
  const manifest = {
    formatVersion: 1, status: 'complete', database: databaseName,
    startedAt: new Date().toISOString(),
    // This flag records an operator assertion. It does not freeze writers,
    // establish a shared point-in-time snapshot, or certify a cutover.
    operatorAssertedWritesFrozen: args.includes('--writes-frozen'),
    collections: [],
  }
  for (let index = 0; index < collections.length; index++) {
    const source = collections[index]
    const collection = db.collection(source.name)
    const filename = `collection-${index}.jsonl`
    const file = await open(path.join(directory, filename), 'wx', 0o600)
    const digest = createHash('sha256')
    let count = 0
    let sourceBytes = 0
    try {
      // Native driver, raw BSON: no Mongoose projection, defaults or hooks.
      for await (const bytes of collection.find({}, { raw: true }).sort({ _id: 1 })) {
        if (!Buffer.isBuffer(bytes)) throw new Error('Raw BSON cursor required')
        const line = JSON.stringify({ bson: bytes.toString('base64'), sha256: sha256(bytes) }) + '\n'
        await file.writeFile(line)
        digest.update(line)
        sourceBytes += bytes.length
        count++
      }
    } finally {
      await file.close()
    }
    const indexes = source.type === 'collection' ? await collection.listIndexes().toArray() : []
    manifest.collections.push({
      name: source.name, type: source.type, file: filename, count, sourceBytes,
      sha256: digest.digest('hex'),
      metadata: BSON.EJSON.serialize(source, { relaxed: false }),
      indexes: BSON.EJSON.serialize(indexes, { relaxed: false }),
    })
  }
  const finalInventory = await db.listCollections({}, { nameOnly: true }).toArray()
  const names = entries => entries.map(entry => entry.name).sort().join('\n')
  if (names(finalInventory) !== names(collections)) throw new Error('Source collections changed during export')
  manifest.completedAt = new Date().toISOString()
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(path.join(directory, 'EXPORT_STATUS'), 'complete\n')
  console.log(JSON.stringify({ snapshot: directory, collections: manifest.collections.length, records: manifest.collections.reduce((sum, entry) => sum + entry.count, 0), cutoverCertified: false }))
} catch {
  // Driver errors may contain credentials, hostnames, or raw source data.
  console.error('MongoDB export failed. Source was not modified. Any incomplete output must not be imported.')
  process.exitCode = 1
} finally {
  await client.close()
}

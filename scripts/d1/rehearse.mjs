import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Miniflare } from 'miniflare'
import { collectionTables, validateSnapshot, readRecords } from './snapshot.mjs'
import { readD1MigrationStatements } from './migrations.mjs'

/** Local, disposable rehearsal only. No API token, production binding or remote URL. */
export async function rehearseSnapshot(directory, { onProgress = () => {} } = {}) {
  const { manifest, files } = await validateSnapshot(directory)
  onProgress({ phase: 'source-checksums-verified', collections: files.length })
  const simulator = new Miniflare({
    modules: true, script: 'export default { fetch() { return new Response("local rehearsal"); } }',
    compatibilityDate: '2025-04-01', d1Databases: { DB: 'nilelink-rehearsal' }, d1Persist: false,
  })
  try {
    const db = await simulator.getD1Database('DB')
    const statements = await readD1MigrationStatements()
    await db.batch(statements.map(sql => db.prepare(sql)))
    onProgress({ phase: 'local-schema-ready' })
    // Table order follows the FK dependency graph. Customers' staff assignment
    // is restored after users exist; the source snapshot is never changed.
    const byTable = new Map(files.map(entry => [entry.table, entry]))
    const ordered = Object.values(collectionTables).map(table => byTable.get(table)).filter(Boolean)
    for (const entry of ordered) {
      let batch = []
      for await (const record of readRecords(entry.file)) {
        let data = record.data
        if (entry.table === 'customers' && Object.hasOwn(record.document, 'assignedStaffId')) {
          const temporary = { ...record.document }
          delete temporary.assignedStaffId
          data = JSON.stringify(temporary)
        }
        batch.push(db.prepare(`INSERT INTO ${entry.table} (id, data) VALUES (?, ?)`).bind(record.id, data))
        if (batch.length === 50) { await db.batch(batch); batch = [] }
      }
      if (batch.length) await db.batch(batch)
      onProgress({ phase: 'table-imported', table: entry.table, records: entry.count })
    }
    const customers = byTable.get('customers')
    if (customers) {
      for await (const record of readRecords(customers.file)) {
        if (Object.hasOwn(record.document, 'assignedStaffId')) {
          await db.prepare('UPDATE customers SET data = ? WHERE id = ?').bind(record.data, record.id).run()
        }
      }
    }
    let verifiedRecords = 0
    for (const entry of ordered) {
      const count = await db.prepare(`SELECT count(*) AS count FROM ${entry.table}`).first()
      if (count.count !== entry.count) throw new Error('Rehearsal target record count mismatch')
      let pending = [], pendingBytes = 0
      const verify = async () => {
        if (!pending.length) return
        const rows = await db.prepare(`SELECT id, data FROM ${entry.table} WHERE id IN (${pending.map(() => '?').join(',')})`).bind(...pending.map(record => record.id)).all()
        const byId = new Map(rows.results.map(row => [row.id, row.data]))
        if (byId.size !== pending.length) throw new Error('Rehearsal target identities mismatch')
        for (const record of pending) {
          if (byId.get(record.id) !== record.data) throw new Error('Rehearsal per-record comparison failed')
          verifiedRecords++
        }
        pending = []; pendingBytes = 0
      }
      for await (const record of readRecords(entry.file)) {
        const size = Buffer.byteLength(record.data)
        if (pending.length && (pending.length >= 50 || pendingBytes + size > 1_500_000)) await verify()
        pending.push(record); pendingBytes += size
      }
      await verify()
      onProgress({ phase: 'table-compared', table: entry.table, records: entry.count })
    }
    const foreignKeys = (await db.prepare('PRAGMA foreign_key_check').all()).results
    const quickCheck = Object.values(await db.prepare('PRAGMA quick_check').first())[0]
    if (foreignKeys.length || quickCheck !== 'ok') throw new Error('Rehearsal integrity verification failed')
    const finalSource = await validateSnapshot(directory)
    if (JSON.stringify(finalSource.manifest) !== JSON.stringify(manifest)) {
      throw new Error('Source manifest changed during rehearsal')
    }
    return {
      formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'disposable-local-d1',
      collections: files.length, verifiedRecords, foreignKeys: 'ok', quickCheck,
      dataComparison: 'exact-application-json-for-every-record',
      sourceFormat: 'raw-bson-with-sha256',
      operatorAssertedWritesFrozen: manifest.operatorAssertedWritesFrozen === true,
      cutoverCertified: false,
      pending: ['business-workflow parity', 'financial reconciliation', 'file verification', 'source consistency at cutover', 'remote D1 validation', 'backup restore drill'],
    }
  } finally {
    await simulator.dispose()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help') || process.argv.length !== 3) {
    console.log('node scripts/d1/rehearse.mjs <snapshot-directory>')
    console.log('Validates all source checksums, imports into disposable local D1, compares every record. Never deploys.')
  } else {
    try {
      const directory = path.resolve(process.argv[2])
      const report = await rehearseSnapshot(directory, { onProgress: progress => console.error(JSON.stringify({ progress })) })
      await writeFile(path.join(directory, `local-rehearsal-${randomUUID()}.json`), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      console.log(JSON.stringify(report, null, 2))
    } catch {
      console.error('Local rehearsal failed. No production database was changed. Check source mapping, checksums, BSON types and relational constraints privately.')
      process.exitCode = 1
    }
  }
}

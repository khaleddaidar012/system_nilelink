import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import assert from 'node:assert/strict'
import { unseal } from './cloud-backup-core.mjs'
import { documentStorageKey } from '../../lib/storage/document-key.mjs'
import { PREVIEW_OBJECT_PREFIX } from '../../lib/storage/preview-object-prefix.mjs'

// One explicitly authorized cleanup, pinned to the verified pre-deletion backup.
const root = process.cwd(), base = path.join(root, '.private/d1-migration/first-launch')
const restore = path.join(base, 'backup/validation/b29862fa-8f7b-42e1-8ca5-7c730ef86250')
const report = JSON.parse(await readFile(path.join(restore, 'report.json'), 'utf8'))
assert.equal(report.status, 'cloud-backup-and-restore-verified')
assert.equal(report.receipt.id, 'c438547a-d0cb-4550-8f01-d4fcbffcf648')
const secrets = JSON.parse(await readFile(path.join(base, 'backup/secrets.json'), 'utf8'))
const backup = JSON.parse(new TextDecoder().decode(await unseal(new Uint8Array(await readFile(path.join(restore, 'backup.aesgcm'))), secrets.BACKUP_ENCRYPTION_KEY, report.receipt.objectKey)))
assert.equal(backup.source.databaseId, '515ee420-9ccb-4bbc-ba98-53ecb391bbeb')
const tables = backup.database.tables
const users = tables.find(t => t.name === 'users').rows
const targetUsers = users.filter(r => ['customer', 'customer_admin'].includes(JSON.parse(r.data).role))
assert.equal(targetUsers.length, 27)
const expectedEmails = `mohamed@alexexport.com
freight.client.1788116416961@gmail.com
kavira4189@jobscai.com
khaled.daidar012@gmail.com
khaled.daidar012@yahoo.com
khaled@nilelinklogistics.com
khaleddaidar012@yahoo.com
khaleddaidar22@gmail.com
khaledhesham012255@gmail.com
khaledhesham0122@gmail.com
khaledhesham0125552@gmail.com
khaledhesham012555555@gmail.com
khaledhesham012@gmail.com
khaledhesham012@nilenil.com
khaledhesham012a@gmail.com
khaledhesham01ggg2@nile.com
khaledheshamsgsdgsd012@gmail.com
mohamedznaty55@yahoo.com
mahmoudzanaty028@gmail.com
khaleddaidar2@gmail.com
mohamedznaty55@gmail.com
mohamedznaty55@gmial.com
mohamedzanaty@nilelinklogistics.com
mijajo5292@slotbeer.com
info@nilelinklogistics.com
khaleddaidar48@gmail.com
khaleddaidar48@daidar.com`.split('\n').sort()
assert.deepEqual(targetUsers.map(r => JSON.parse(r.data).email).sort(), expectedEmails)
const userIds = new Set(targetUsers.map(r => r.id)), customerIds = new Set(targetUsers.map(r => JSON.parse(r.data).customerId))
assert.ok(!customerIds.has(undefined))
assert.ok(users.filter(r => !userIds.has(r.id)).every(r => !customerIds.has(JSON.parse(r.data).customerId)))
const selected = new Map(tables.map(t => [t.name, new Set()]))
selected.set('users', userIds); selected.set('customers', customerIds)
const protectedTables = new Set(['users', 'customers', 'role_configs', 'system_settings', 'service_configs', 'pricing_rules', 'invoice_sequences', '_nilelink_workflow_sequences', '_nilelink_write_guards'])
const relatedIds = new Set([...userIds, ...customerIds])
let changed = true
while (changed) {
  changed = false
  for (const table of tables) {
    if (protectedTables.has(table.name)) continue
    for (const row of table.rows) {
      const key = row.id ?? row.storageKey
      if (selected.get(table.name).has(key)) continue
      const text = row.data ?? JSON.stringify(row)
      if ([...relatedIds].some(id => text.includes(id)) || expectedEmails.some(email => text.includes(email))) {
        selected.get(table.name).add(key)
        if (row.id) relatedIds.add(row.id)
        changed = true
      }
    }
  }
}
const docs = tables.find(t => t.name === 'documents')
const keys = new Set(docs.rows.filter(r => selected.get('documents').has(r.id)).map(r => PREVIEW_OBJECT_PREFIX + documentStorageKey(JSON.parse(r.data))))
for (const row of tables.find(t => t.name === '_nilelink_storage_pending').rows) if (selected.get('_nilelink_storage_pending').has(row.storageKey)) keys.add(PREVIEW_OBJECT_PREFIX + row.storageKey)
for (const row of docs.rows.filter(r => !selected.get('documents').has(r.id))) assert.ok(!keys.has(PREVIEW_OBJECT_PREFIX + documentStorageKey(JSON.parse(r.data))))
const availableKeys = new Set(backup.files.map(f => f.key))
const omittedKeys = new Set(backup.omittedFiles.map(f => PREVIEW_OBJECT_PREFIX + f.key))
for (const key of keys) { assert.ok(key.startsWith(PREVIEW_OBJECT_PREFIX + 'clients/')); assert.ok(availableKeys.has(key) || omittedKeys.has(key)) }
const q = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'"
const sql = ['PRAGMA defer_foreign_keys=ON;']
let guard = 0
// Fail the entire import if the snapshot changed; no widening to new customers.
for (const t of tables) {
  const checks = [`(SELECT count(*) FROM ${t.name}${t.name === '_nilelink_write_guards' ? " WHERE id NOT LIKE 'authorized-purge-%'" : ''})${t.name === 'system_audit_logs' ? '>=' : '='}${t.rows.length}`]
  for (const row of t.rows) checks.push(`EXISTS(SELECT 1 FROM ${t.name} WHERE ${t.columns.map(c => `${c} IS ${q(row[c])}`).join(' AND ')})`)
  for (let i = 0; i < checks.length; i += 30) sql.push(`INSERT INTO _nilelink_write_guards(id,valid) VALUES('authorized-purge-${guard++}', (${checks.slice(i, i + 30).join(' AND ')}));`)
}
const deletionCounts = {}
for (const t of tables) {
  const ids = [...selected.get(t.name)]
  if (!ids.length) continue
  deletionCounts[t.name] = ids.length
  const pk = t.columns[0]
  sql.push(`DELETE FROM ${t.name} WHERE ${pk} IN (${ids.map(q).join(',')});`)
}
sql.push("DELETE FROM _nilelink_write_guards WHERE id LIKE 'authorized-purge-%';", 'PRAGMA defer_foreign_keys=OFF;')
const db = new DatabaseSync(':memory:')
db.exec(backup.database.ddl.join(';\n'))
db.exec('PRAGMA foreign_keys=ON; BEGIN; PRAGMA defer_foreign_keys=ON;')
for (const t of tables) {
  const insert = db.prepare(`INSERT INTO ${t.name}(${t.columns.join(',')}) VALUES(${t.columns.map(() => '?').join(',')})`)
  for (const row of t.rows) insert.run(...t.columns.map(c => row[c]))
}
db.exec('COMMIT; BEGIN;')
db.exec(sql.join('\n')); db.exec('COMMIT;')
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
for (const t of tables) {
  const expected = t.rows.filter(r => !selected.get(t.name).has(r[t.columns[0]]))
  const actual = db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.name} ORDER BY ${t.columns[0]}`).all().map(r => ({ ...r }))
  assert.deepEqual(actual, expected)
}
db.close()
const directory = path.join(base, 'customer-purge-2026-10-22'); await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(path.join(directory, 'purge.sql'), sql.join('\n'), { flag: 'wx', mode: 0o600 })
await writeFile(path.join(directory, 'plan.json'), JSON.stringify({ backupId: report.receipt.id, targetUsers: [...userIds], targetCustomers: [...customerIds], deletionCounts, objectKeys: [...keys].filter(k => availableKeys.has(k)), omittedKeys: [...keys].filter(k => omittedKeys.has(k)), preservedUsers: users.filter(r => !userIds.has(r.id)), localRehearsal: 'passed', foreignKeys: 'ok', status: 'prepared-not-executed' }, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ directory, deletionCounts, files: [...keys].filter(k => availableKeys.has(k)).length, localRehearsal: 'passed' }))

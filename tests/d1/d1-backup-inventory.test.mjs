import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { handleD1BackupInventory } from '../../lib/backup/d1-inventory.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'

let instance, db, admin, customer, staff, pending
const oldJwt = process.env.JWT_SECRET
const id = '12345678-1234-1234-1234-123456789abc', sha = 'ab'.repeat(32)
const receipt = { format: 'nilelink-backup-receipt-v1', id, objectKey: `staging-backups/${id}.aesgcm`, sha256: sha, encryptedBytes: 1000, tables: 23, records: 2072, files: 53, omittedFiles: 1, verifiedAt: '2026-10-20T16:00:00.000Z', trigger: 'scheduled' }
before(async () => {
  process.env.JWT_SECRET = 'inventory-fixture-secret'
  instance = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2025-04-01', d1Databases: { DB: 'inventory-fixture' } })
  db = await instance.getD1Database('DB'); await db.batch((await readD1MigrationStatements()).map(s => db.prepare(s)))
  const cookies = []
  for (const [index, role, status, permissions] of [[1, 'super_admin', 'active', {}], [2, 'customer_admin', 'active', {}], [3, 'staff', 'active', { canManageBackups: false }], [4, 'super_admin', 'pending_verification', {}]]) {
    const userId = String(index).padStart(24, '0'), email = `inventory${index}@example.test`
    await db.prepare('INSERT INTO users(id,data) VALUES(?,?)').bind(userId, JSON.stringify({ _id: userId, email, firstName: 'Fixture', lastName: 'User', role, status, staffPermissions: permissions })).run()
    cookies.push(`${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId, email, firstName: 'Fixture', lastName: 'User', role: index === 3 ? 'super_admin' : role })}`)
  }
  ;[admin, customer, staff, pending] = cookies
})
after(async () => { await instance?.dispose(); if (oldJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwt })
const request = (cookie, query = '') => new Request('https://fixture/api/admin/system/d1-backups' + query, { headers: cookie ? { cookie } : {} })
function bucket(data = receipt, head = { size: 1000, customMetadata: { sha256: sha } }) {
  let calls = 0
  return { get calls() { return calls }, async list() { calls++; return { objects: [{ key: `staging-backups/${id}.complete.json` }], truncated: false } }, async get() { return { size: 400, json: async () => data } }, async head() { return head } }
}
test('D1 inventory authenticates and rechecks stored role/status before reading R2', async () => {
  for (const [cookie, status] of [[null, 401], [customer, 403], [staff, 403], [pending, 403]]) {
    const r2 = bucket(), response = await handleD1BackupInventory(request(cookie), db, r2, 'baseline-staging')
    assert.equal(response.status, status); assert.equal(r2.calls, 0)
  }
})
test('authorized metadata response omits storage keys, hashes and data', async () => {
  const response = await handleD1BackupInventory(request(admin), db, bucket(), 'baseline-staging'), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.items[0].trigger, 'scheduled'); assert.equal(data.items[0].status, 'stored')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(data.items[0].objectKey, undefined); assert.equal(data.items[0].sha256, undefined)
  assert.equal(data.verification, 'receipt-and-object-metadata-only')
})
test('missing data object is reported as unavailable, never restored or complete', async () => {
  const response = await handleD1BackupInventory(request(admin), db, bucket(receipt, null), 'baseline-staging')
  assert.equal((await response.json()).items[0].status, 'unavailable')
})

test('reviewed 27-table shipment backups remain visible while unsupported schemas fail closed', async () => {
  for (const tables of [23, 26, 27]) {
    const response = await handleD1BackupInventory(request(admin), db, bucket({ ...receipt, tables }), 'first-launch')
    assert.equal(response.status, 200)
    assert.equal((await response.json()).items[0].status, 'stored')
  }
  for (const tables of [24, 28, '27']) {
    assert.equal((await handleD1BackupInventory(request(admin), db, bucket({ ...receipt, tables }), 'first-launch')).status, 503)
  }
})
test('first-launch inventory has its own explicit scope and uses the same authorization', async () => {
  assert.equal((await handleD1BackupInventory(request(customer), db, bucket(), 'first-launch')).status, 403)
  const response = await handleD1BackupInventory(request(admin), db, bucket(), 'first-launch')
  assert.equal(response.status, 200); assert.equal((await response.json()).scope, 'first-launch')
})
test('forged receipt and unsupported scope fail closed without exposing details', async () => {
  assert.equal((await handleD1BackupInventory(request(admin), db, bucket({ ...receipt, objectKey: 'other/private-key' }), 'baseline-staging')).status, 503)
  assert.equal((await handleD1BackupInventory(request(admin), db, bucket(), 'production')).status, 503)
  assert.equal((await handleD1BackupInventory(request(admin, '?prefix=secret'), db, bucket(), 'baseline-staging')).status, 400)
})

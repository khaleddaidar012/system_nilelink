import { readFile, writeFile } from 'node:fs/promises'
import { getPlatformProxy } from 'wrangler'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = process.cwd(), directory = path.join(root, '.private/d1-migration/first-launch/customer-purge-2026-10-22')
const plan = JSON.parse(await readFile(path.join(directory, 'plan.json'), 'utf8'))
assert.equal(plan.localRehearsal, 'passed'); assert.equal(plan.targetUsers.length, 27)
const configPath = path.join(directory, 'proxy.json')
await writeFile(configPath, JSON.stringify({ name: 'nilelink-authorized-customer-cleanup', account_id: 'f882b38e4571e0141cb6353f5a271af7', compatibility_date: '2025-04-01', d1_databases: [{ binding: 'DB', database_name: 'nilelink-production', database_id: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', remote: true }], r2_buckets: [{ binding: 'FILES', bucket_name: 'nilelink-production-files', remote: true }] }))
const proxy = await getPlatformProxy({ configPath, envFiles: [] })
try {
  const db = proxy.env.DB
  if (process.argv.includes('--inspect-guards')) {
    const sql = (await readFile(path.join(directory, 'purge.sql'), 'utf8')).split(/;\r?\n/).map(s => s.trim().replace(/;$/, '')).filter(Boolean)
    const guards = sql.map(s => /^INSERT INTO _nilelink_write_guards\(id,valid\) VALUES\('authorized-purge-(\d+)', ([\s\S]*)\)$/.exec(s)).filter(Boolean)
    const results = await db.batch(guards.map(m => db.prepare(`SELECT ${m[2]} AS valid`)))
    console.log(JSON.stringify(results.flatMap((r,i) => r.results[0].valid ? [] : [{ guard: guards[i][1], tables: [...new Set([...guards[i][2].matchAll(/FROM ([a-z_]+)/g)].map(m => m[1]))] }])))
  } else if (process.argv.includes('--inspect')) {
    const counts = await db.prepare("SELECT role,count(*) AS count FROM users GROUP BY role").all()
    console.log(JSON.stringify(counts.results)); process.exitCode = 0
  } else if (process.argv.includes('--execute')) {
    assert.equal(plan.status, 'prepared-not-executed')
    const sql = (await readFile(path.join(directory, 'purge.sql'), 'utf8')).split(/;\r?\n/).map(s => s.trim().replace(/;$/, '')).filter(Boolean)
    const results = await db.batch(sql.map(s => db.prepare(s)))
    assert.ok(results.every(r => r.success))
    plan.status = 'database-deleted-files-pending'; plan.databaseDeletedAt = new Date().toISOString()
    await writeFile(path.join(directory, 'plan.json'), JSON.stringify(plan, null, 2))
    console.log(JSON.stringify({ status: plan.status, statements: results.length }))
  } else if (process.argv.includes('--files')) {
    assert.ok(['database-deleted-files-pending', 'complete'].includes(plan.status))
    const count = await db.prepare("SELECT count(*) AS n FROM users WHERE role IN ('customer','customer_admin')").first()
    assert.equal(count.n, 0)
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0)
    for (const key of plan.objectKeys) assert.ok(key.startsWith('_nilelink_d1_preview/clients/'))
    await proxy.env.FILES.delete(plan.objectKeys)
    for (const key of plan.objectKeys) assert.equal(await proxy.env.FILES.head(key), null)
    plan.status = 'complete'; plan.completedAt = new Date().toISOString(); plan.deletedFilesVerified = plan.objectKeys.length
    await writeFile(path.join(directory, 'plan.json'), JSON.stringify(plan, null, 2))
    console.log(JSON.stringify({ status: plan.status, deletedFilesVerified: plan.deletedFilesVerified }))
  } else throw Error('Use --inspect, --execute or --files')
} finally { await proxy.dispose() }

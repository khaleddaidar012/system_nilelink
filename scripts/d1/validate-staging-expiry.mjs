import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy } from 'wrangler'
import { WorkflowStore, timestamped } from '../../lib/workflows/runtime.ts'
import { evaluateExpiry } from '../../lib/workflows/expiry.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const target = path.join(root, '.private/d1-migration/worker-staging/7e89ea06-ed15-4149-805a-4da1929ccb10')
if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('Explicit --execute required')
const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'))
const config = JSON.parse(await readFile(path.join(target, 'wrangler.json'), 'utf8'))
if (manifest.scope !== 'synthetic-worker-e2e' || manifest.sourceRecordsCopied !== false || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.d1_databases.length !== 1 || config.d1_databases[0].database_id !== '7aa12b1a-5015-4f99-b028-d65de7a260bd' || config.d1_databases[0].remote !== true || config.d1_databases[0].preview_database_id !== config.d1_databases[0].database_id) throw new Error('Wrong synthetic target')
for (const key of Object.keys(process.env)) if (/^(CLOUDFLARE_|CF_)/.test(key)) throw new Error('Authentication overrides forbidden')
const directory = path.join(target, 'expiry-validation', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { scope: 'scoped-expiry-domain-handler-on-remote-synthetic-d1', databaseId: config.d1_databases[0].database_id,
  sourceRecordsModified: false, schedulerEnabled: false, externalMessagesSent: false, productionCertified: false, results: [], status: 'running' }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
let proxy
try {
  await save()
  proxy = await getPlatformProxy({ configPath: path.join(target, 'wrangler.json'), envFiles: [], persist: false, remoteBindings: true })
  const db = proxy.env.DB, store = new WorkflowStore(db), time = Date.UTC(2040, 0, 1)
  const customers = [0, 1, 2].map(n => timestamped({ companyName: 'Expiry fixture ' + randomUUID(), commercialRegisterNumber: randomUUID(), accountStatus: n === 1 ? 'inactive' : 'active' }))
  const docs = customers.map((c, i) => timestamped({ customerId: c._id, title: 'Synthetic expiry', category: 'commercial_register', status: 'approved',
    isArchived: false, expiryDate: i === 2 ? 'invalid-date' : new Date(time + (i === 0 ? -1 : 40) * 86400000).toISOString(),
    warningEscalationTier: 'none', retained: { unknown: [null, 'original'] } }))
  await store.commit({ inserts: [...customers.map(data => ({ table: 'customers', data })), ...docs.map(data => ({ table: 'documents', data }))] })
  // Evaluate only this run's customers; never touch earlier fixtures or source rows.
  const ids = new Set(customers.map(c => c._id)), list = store.list.bind(store)
  store.list = async (...args) => { const rows = await list(...args); return args[0] === 'customers' ? rows.filter(row => ids.has(row.id)) : rows }
  const notes = () => list('notifications', "json_extract(data,'$.relatedDocumentId') = ?", [docs[0]._id])
  await Promise.all([evaluateExpiry(store, null, time), evaluateExpiry(store, null, time)])
  assert.equal((await notes()).length, 1)
  assert.equal((await store.read('documents', docs[0]._id)).data.status, 'expired')
  assert.deepEqual((await store.read('documents', docs[0]._id)).data.retained, docs[0].retained)
  report.results.push({ name: 'concurrent expiry produces one notification and preserves unknown fields', passed: true }); await save()
  await evaluateExpiry(store, null, time)
  assert.equal((await notes()).length, 1)
  const note = (await notes())[0].data
  assert.equal(note.channel, 'in_app'); assert.equal(note.emailStatus, 'not_applicable')
  assert.equal((await store.read('documents', docs[0]._id)).data.lastNotificationSentAt, undefined)
  report.results.push({ name: 'repeated run does not duplicate or claim email delivery', passed: true }); await save()
  assert.equal((await store.read('customers', customers[1]._id)).data.accountStatus, 'inactive')
  assert.deepEqual((await store.read('documents', docs[2]._id)).data, docs[2])
  report.results.push({ name: 'manual inactive hold and invalid source date retained', passed: true })
  report.status = 'all-expiry-checks-passed'; report.checkedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ directory, status: report.status, passed: report.results.length }))
} catch (error) {
  report.status = 'failed'; await save()
  await writeFile(path.join(directory, 'private-error.txt'), String(error.stack || error), { mode: 0o600 })
  console.error('Synthetic expiry validation failed; inspect private receipt. No outgoing message was sent.'); process.exitCode = 1
} finally { await proxy?.dispose() }

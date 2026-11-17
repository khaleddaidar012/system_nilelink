import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readD1MigrationStatements } from './migrations.mjs'
import { stagingConfig } from './staging-target.mjs'
import { verifyBuildTraceIsolation } from './build-traces.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const id = number => number.toString(16).padStart(24, '0')
const literal = value => `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`

/** Creates private files only. No credentials, source records or dotenv files are copied. */
export async function prepareWorkerStaging({ accountId, databaseId, databaseName, bucketName }) {
  stagingConfig({ accountId, databaseId, databaseName })
  if (databaseName !== 'nilelink-d1-staging-e2e' || bucketName !== 'nilelink-d1-staging-e2e-files') throw new Error('Only isolated E2E fixture resources are allowed')
  const receipt = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
  const workspace = await realpath(receipt.workspace)
  const parent = await realpath(path.join(root, '.private/d1-migration/build-audit/workspaces'))
  if (!workspace.startsWith(parent + path.sep) || receipt.exitCode !== 0 || !receipt.credentialsIsolated || receipt.dotenvFilesCopied) throw new Error('A successful sanitized Worker build is required')
  await readFile(path.join(workspace, '.open-next/worker.js'))
  await verifyBuildTraceIsolation(workspace)
  const directory = path.join(root, '.private/d1-migration/worker-staging', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const secret = randomBytes(32).toString('hex'), jwt = randomBytes(48).toString('hex'), password = randomBytes(24).toString('base64url')
  const salt = randomBytes(16).toString('hex')
  const passwordHash = salt + ':' + scryptSync(password, salt, 64, { cost: 16384, blockSize: 8, parallelization: 1 }).toString('hex')
  const now = new Date().toISOString(), rows = []
  const add = (table, data) => rows.push(`INSERT INTO ${table} (id,data) VALUES (${literal(data._id)},${literal(JSON.stringify({ createdAt: now, updatedAt: now, ...data }))});`)
  for (const n of [11, 12]) add('customers', { _id: id(n), companyName: `Synthetic E2E ${n}`, contactEmail: `company${n}@example.test`, contactPhone: '+201000000000', commercialRegisterNumber: `E2E-CR-${n}`, taxCardNumber: `E2E-TAX-${n}`, accountStatus: 'active', maxAllowedDocuments: 20 })
  const actors = []
  for (const [n, role, customerId] of [[1, 'super_admin', null], [2, 'customer_admin', id(11)], [3, 'customer_admin', id(12)], [4, 'staff', null]]) {
    const data = { _id: id(n), email: `e2e${n}@example.test`, firstName: 'Synthetic', lastName: 'User', role, status: 'active', customerId, emailVerified: true, whatsappVerified: true, passwordHash,
      staffPermissions: n === 4 ? { canReviewDocuments: false, canManageCustomers: false, createInvoice: false, editInvoice: false } : {} }
    add('users', data); actors.push({ id: data._id, email: data.email, role, customerId })
  }
  add('invoices', { _id: id(101), customerId: id(11), invoiceNumber: 'INV-E2E-000001', token: randomBytes(24).toString('hex'), documentType: 'invoice', status: 'confirmed', currency: 'EGP', totalAmount: 100, subtotal: 100, taxRate: 0, tax: 0, discount: 0, additionalCharges: 0, paidAmount: 0, remainingAmount: 100,
    issueDate: now, dueDate: '2035-01-01T00:00:00.000Z', customerSnapshot: { companyName: 'Synthetic E2E 11', contactEmail: 'company11@example.test' }, items: [{ description: 'Synthetic freight', quantity: 1, unitPrice: 100, total: 100 }], internalNotes: 'private-e2e-note' })
  const gateImport = path.relative(workspace, path.join(root, 'scripts/d1/staging-gate.mjs')).replaceAll('\\', '/')
  await writeFile(path.join(workspace, 'staging-worker.mjs'), `import application from './.open-next/worker.js';\nimport { createStagingGate } from ${JSON.stringify(gateImport)};\nexport * from './.open-next/worker.js';\nexport default createStagingGate(application);\n`, { flag: 'wx' })
  const config = { name: 'nilelink-d1-staging-e2e', account_id: accountId, main: path.join(workspace, 'staging-worker.mjs'), compatibility_date: '2025-04-01', compatibility_flags: ['nodejs_compat', 'nodejs_compat_populate_process_env', 'enable_nodejs_fs_module'],
    workers_dev: false, preview_urls: false,
    assets: { directory: path.join(workspace, '.open-next/assets'), binding: 'ASSETS', run_worker_first: true },
    vars: { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', D1_RUNTIME_STAGE: 'isolated-staging', D1_STORAGE_MODE: 'r2-preview', PDF_ASSET_MODE: 'binding', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:8791' },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId, preview_database_id: databaseId, remote: true }],
    r2_buckets: [{ binding: 'D1_PREVIEW_FILES', bucket_name: bucketName, preview_bucket_name: bucketName, remote: true }],
    dev: { ip: '127.0.0.1', port: 8791 } }
  const save = (name, value) => writeFile(path.join(directory, name), value, { flag: 'wx', mode: 0o600 })
  await save('wrangler.json', JSON.stringify(config, null, 2))
  await save('empty.env', '# No live environment variables.\n')
  await save('.dev.vars', `D1_STAGING_GATE_SECRET=${secret}\nJWT_SECRET=${jwt}\n`)
  await save('credentials.json', JSON.stringify({ gateSecret: secret, password, actors, invoiceId: id(101) }))
  await save('fixtures.sql', (await readD1MigrationStatements()).map(sql => sql + ';').join('\n') + '\n' + rows.join('\n'))
  await save('manifest.json', JSON.stringify({ scope: 'synthetic-worker-e2e', accountId, databaseId, databaseName, bucketName, workspace, sourceRecordsCopied: false, productionCertified: false }, null, 2))
  return directory
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [accountId, databaseId] = process.argv.slice(2)
  const directory = await prepareWorkerStaging({ accountId, databaseId, databaseName: 'nilelink-d1-staging-e2e', bucketName: 'nilelink-d1-staging-e2e-files' })
  console.log(JSON.stringify({ directory, remoteWritesExecuted: false, credentialsPrinted: false }))
}

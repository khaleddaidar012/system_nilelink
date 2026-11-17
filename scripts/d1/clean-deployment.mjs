import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyBuildTraceIsolation } from './build-traces.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
export function cleanStagingConfig({ accountId, databaseId, databaseName, bucketName, main, assets, origin }) {
  if (accountId !== 'f882b38e4571e0141cb6353f5a271af7' || databaseId !== '7aa12b1a-5015-4f99-b028-d65de7a260bd' || databaseName !== 'nilelink-d1-staging-e2e' || bucketName !== 'nilelink-d1-staging-e2e-files') throw new Error('Only approved synthetic resources are allowed')
  if (origin !== 'https://nilelink-d1-staging-e2e.mohamedznaty55.workers.dev' || !path.isAbsolute(main) || !path.isAbsolute(assets)) throw new Error('Unreviewed deployment paths or origin')
  return { name: 'nilelink-d1-staging-e2e', account_id: accountId, main, compatibility_date: '2025-04-01',
    compatibility_flags: ['nodejs_compat', 'nodejs_compat_populate_process_env', 'enable_nodejs_fs_module'], workers_dev: true, preview_urls: false,
    limits: { cpu_ms: 1000 }, assets: { directory: assets, binding: 'ASSETS', run_worker_first: true },
    vars: { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', D1_RUNTIME_STAGE: 'isolated-staging', D1_STORAGE_MODE: 'r2-preview', PDF_ASSET_MODE: 'binding', NEXT_PUBLIC_APP_URL: origin, D1_BACKUP_SCOPE: 'baseline-staging', D1_BACKUP_CREATE_ENABLED: 'true' },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId }],
    r2_buckets: [{ binding: 'D1_PREVIEW_FILES', bucket_name: bucketName }, { binding: 'D1_BACKUPS', bucket_name: 'nilelink-d1-staging-backups' }],
    services: [{ binding: 'D1_BACKUP_RUNNER', service: 'nilelink-d1-staging-backup' }] }
}
export async function prepareCleanDeployment() {
  const fixture = path.join(root, '.private/d1-migration/worker-staging/7e89ea06-ed15-4149-805a-4da1929ccb10')
  const manifest = JSON.parse(await readFile(path.join(fixture, 'manifest.json'), 'utf8'))
  const credentials = JSON.parse(await readFile(path.join(fixture, 'credentials.json'), 'utf8'))
  if (manifest.scope !== 'synthetic-worker-e2e' || manifest.sourceRecordsCopied !== false || !/^[a-f0-9]{64}$/.test(credentials.gateSecret)) throw new Error('Wrong isolated fixture')
  const build = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
  if (build.firstLaunch === true) throw new Error('First-launch artifact cannot be deployed to the synthetic environment')
  if (build.exitCode !== 0 || !build.credentialsIsolated || build.dotenvFilesCopied) throw new Error('Sanitized build required')
  const workspace = await realpath(build.workspace), parent = await realpath(path.join(root, '.private/d1-migration/build-audit/workspaces'))
  if (!workspace.startsWith(parent + path.sep)) throw new Error('Build escapes sanitized workspace')
  const entry = path.join(workspace, 'inventory-staging-worker.mjs')
  const gateImport = path.relative(workspace, path.join(root, 'scripts/d1/staging-gate.mjs')).replaceAll('\\', '/')
  await writeFile(entry, `import application from './.open-next/worker.js';\nimport { createStagingGate } from ${JSON.stringify(gateImport)};\nexport * from './.open-next/worker.js';\nexport default createStagingGate(application);\n`, { flag: 'wx', mode: 0o600 })
  for (const filename of [entry, path.join(workspace, '.open-next/assets')]) {
    if (!(await realpath(filename)).startsWith(workspace + path.sep)) throw new Error('Artifact escapes sanitized workspace')
  }
  const traceIsolation = await verifyBuildTraceIsolation(workspace)
  const config = cleanStagingConfig({ ...manifest, main: entry, assets: path.join(workspace, '.open-next/assets'), origin: manifest.deployedOrigin })
  const directory = path.join(root, '.private/d1-migration/deployment-preparation', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const save = (name, value) => writeFile(path.join(directory, name), value, { flag: 'wx', mode: 0o600 })
  const backupSecrets = JSON.parse(await readFile(path.join(root, '.private/d1-migration/cloud-backup/staging-v1/secrets.json'), 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(backupSecrets.BACKUP_TRIGGER_KEY || '')) throw new Error('Reviewed backup trigger credential missing')
  const secrets = { D1_STAGING_GATE_SECRET: credentials.gateSecret, JWT_SECRET: randomBytes(48).toString('hex'), AUTH_SECRET: randomBytes(48).toString('hex'), CRON_SECRET: randomBytes(32).toString('hex'), D1_BACKUP_TRIGGER_KEY: backupSecrets.BACKUP_TRIGGER_KEY }
  await save('wrangler.json', JSON.stringify(config, null, 2))
  await save('empty.env', '# Never load original application dotenv files.\n')
  await save('secrets.json', JSON.stringify(secrets))
  const state = { scope: 'clean-deployment-rehearsal-synthetic-only', accountId: config.account_id,
    databaseId: manifest.databaseId, bucketName: manifest.bucketName, origin: manifest.deployedOrigin, fixtureDirectory: fixture,
    configSha256: createHash('sha256').update(JSON.stringify(config, null, 2)).digest('hex'), traceIsolation,
    secretNames: Object.keys(secrets), originalSecretsCopied: false, originalConfigurationModified: false,
    freshSecretsForSyntheticWorkerOnly: true, backupTriggerSharedWithSyntheticWorker: true, backupEncryptionKeyCopied: false,
    productionSecretsRotated: false, productionActivationAllowed: false, productionCertified: false }
  await save('manifest.json', JSON.stringify(state, null, 2))
  await save('production-requirements.json', JSON.stringify({ accountId: config.account_id, deployable: false, finalDatabaseId: null, finalBucketName: null, productionOrigin: null,
    blockers: ['fresh-final-source-snapshot-and-byte-comparison', 'approved-live-email-or-explicit-disabled-features', 'd1-backup-native-actions-and-monitoring', 'production-secret-rotation-and-recovery-key-confirmation', 'reviewed-production-activation-guard-and-final-cutover-window'],
    requiredBindings: ['DB', 'D1_PREVIEW_FILES', 'ASSETS'], requiredSecretNames: ['JWT_SECRET', 'AUTH_SECRET', 'CRON_SECRET'] }, null, 2))
  return { directory, ...state }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareCleanDeployment())) }
  catch { console.error('Clean deployment preparation stopped; no remote change was made.'); process.exitCode = 1 }
}

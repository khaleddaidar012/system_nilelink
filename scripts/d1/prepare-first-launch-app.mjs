import { randomBytes } from 'node:crypto'
import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuildTraceIsolation } from './build-traces.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv.length !== 2) throw new Error('No target overrides accepted')
const build = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
const origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
if (build.exitCode !== 0 || build.firstLaunch !== true || build.publicOrigin !== origin || !build.credentialsIsolated || build.dotenvFilesCopied) throw new Error('Successful isolated first-launch build required')
const backup = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/backup/validation/a80d117e-7b93-4a7b-8bdf-7204e19c10cd/report.json'), 'utf8'))
if (backup.scope !== 'first-launch-encrypted-cloud-backup-and-local-restore' || backup.status !== 'cloud-backup-and-restore-verified' || backup.verifiedRecords !== 2072 || backup.restoredFiles !== 53) throw new Error('First-launch restore proof required')
const workspace = await realpath(build.workspace), parent = await realpath(path.join(root, '.private/d1-migration/build-audit/workspaces'))
if (!workspace.startsWith(parent + path.sep)) throw new Error('Artifact escapes isolated build directory')
const traceIsolation = await verifyBuildTraceIsolation(workspace)
const entry = path.join(workspace, 'first-launch-worker.mjs')
const gateImport = path.relative(workspace, path.join(root, 'scripts/d1/prelaunch-gate.mjs')).replaceAll('\\', '/')
await writeFile(entry, `import application from './.open-next/worker.js';\nimport {createPrelaunchGate} from ${JSON.stringify(gateImport)};\nexport * from './.open-next/worker.js';\nexport default createPrelaunchGate(application);\n`, { flag: 'wx', mode: 0o600 })
const directory = path.join(root, '.private/d1-migration/first-launch/application')
await mkdir(directory, { recursive: true, mode: 0o700 })
const config = { name: 'nilelink-system', account_id: 'f882b38e4571e0141cb6353f5a271af7', main: entry, compatibility_date: '2025-04-01',
  compatibility_flags: ['nodejs_compat', 'nodejs_compat_populate_process_env', 'enable_nodejs_fs_module'], workers_dev: true, preview_urls: false,
  limits: { cpu_ms: 1000 }, assets: { directory: path.join(workspace, '.open-next/assets'), binding: 'ASSETS', run_worker_first: true },
  vars: { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', D1_RUNTIME_STAGE: 'isolated-staging', D1_STORAGE_MODE: 'r2-preview', PDF_ASSET_MODE: 'binding', NEXT_PUBLIC_APP_URL: origin, D1_BACKUP_CREATE_ENABLED: 'false' },
  d1_databases: [{ binding: 'DB', database_name: 'nilelink-production', database_id: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', migrations_dir: path.join(root, 'migrations/d1') }],
  r2_buckets: [{ binding: 'D1_PREVIEW_FILES', bucket_name: 'nilelink-production-files' }] }
const save = (name, value) => writeFile(path.join(directory, name), value, { flag: 'wx', mode: 0o600 })
await save('wrangler.json', JSON.stringify(config, null, 2))
await save('empty.env', '# No original dotenv or secrets.\n')
await save('secrets.json', JSON.stringify(Object.fromEntries(['JWT_SECRET', 'AUTH_SECRET', 'CRON_SECRET', 'D1_STAGING_GATE_SECRET'].map(name => [name, randomBytes(32).toString('hex')]))))
const manifest = { scope: 'first-launch-protected-review', origin, accountId: config.account_id, databaseId: config.d1_databases[0].database_id,
  bucketName: config.r2_buckets[0].bucket_name, publicOriginBuiltIn: build.publicOrigin, workspace, traceIsolation,
  originalSecretsCopied: false, freshApplicationSecrets: true, publicActivationAllowed: false, productionCertified: false,
  originalProviderGuardPreserved: true, writesBlockedExceptAuthentication: true, backupControlsBlockedInReview: true,
  backupRestoreVerified: true, deployed: false }
await save('manifest.json', JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ directory, ...manifest }))

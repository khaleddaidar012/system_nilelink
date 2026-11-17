import { readFile, writeFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuildTraceIsolation } from './build-traces.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const app = path.join(root, '.private/d1-migration/first-launch/application')
const configPath = path.join(app, 'wrangler.json'), config = JSON.parse(await readFile(configPath, 'utf8'))
const build = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
const backupPath = '.private/d1-migration/first-launch/backup/validation/0103cbb3-7e7c-4602-ae7d-ee62fa0bb513/report.json'
const backup = JSON.parse(await readFile(path.join(root, backupPath), 'utf8'))
const suite = await readFile(path.join(root, '.private/d1-migration/first-launch/live-full-suite.tap'), 'utf8')
const gateTests = await readFile(path.join(root, '.private/d1-migration/first-launch/live-gate-final-tests.tap'), 'utf8')
if (!/^ℹ fail 0\r?$/m.test(suite) || !/^ℹ cancelled 0\r?$/m.test(suite) || !/^ℹ fail 0\r?$/m.test(gateTests) || Number(suite.match(/^ℹ pass (\d+)/m)?.[1]) < 198) throw Error('Passing activation checks required')
if (backup.status !== 'cloud-backup-and-restore-verified' || backup.scope !== 'first-launch-encrypted-cloud-backup-and-local-restore') throw Error('Fresh safety backup restore proof required')
if (config.name !== 'nilelink-system' || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.d1_databases?.length !== 1 || config.d1_databases[0].database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' || config.r2_buckets.find(row => row.binding === 'D1_PREVIEW_FILES')?.bucket_name !== 'nilelink-production-files' || config.r2_buckets.find(row => row.binding === 'D1_BACKUPS')?.bucket_name !== 'nilelink-production-backups') throw Error('Wrong launch destination')
if (build.exitCode !== 0 || !build.firstLaunch || !build.credentialsIsolated || build.dotenvFilesCopied || build.publicOrigin !== 'https://nilelink-system.mohamedznaty55.workers.dev') throw Error('Fresh isolated first-launch build required')
const workspace = await realpath(build.workspace), parent = await realpath(path.join(root, '.private/d1-migration/build-audit/workspaces'))
if (!workspace.startsWith(parent + path.sep)) throw Error('Artifact escapes build directory')
const traceIsolation = await verifyBuildTraceIsolation(workspace)
await writeFile(path.join(app, 'wrangler.before-live.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
const main = path.join(workspace, 'first-launch-live-worker.mjs')
const gate = path.relative(workspace, path.join(root, 'scripts/d1/first-launch-live-gate.mjs')).replaceAll('\\', '/')
await writeFile(main, `import application from './.open-next/worker.js';\nimport {createFirstLaunchLiveGate} from ${JSON.stringify(gate)};\nexport * from './.open-next/worker.js';\nexport default createFirstLaunchLiveGate(application);\n`, { flag: 'wx', mode: 0o600 })
config.main = main
config.assets.directory = path.join(workspace, '.open-next/assets')
Object.assign(config.vars, { D1_RUNTIME_STAGE: 'first-launch-live', D1_ACTIVATION_CONFIRMED: 'true', D1_RESOURCE_ACCOUNT: config.account_id, D1_RESOURCE_DATABASE: config.d1_databases[0].database_id, D1_RESOURCE_FILES: 'nilelink-production-files' })
await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
await writeFile(path.join(root, '.private/d1-migration/first-launch/activation/preparation.json'), JSON.stringify({ scope: 'user-authorized-first-launch-activation', userRequestedLiveActivation: true, safetyBackupReport: backupPath, safetyBackupRecords: backup.verifiedRecords, safetyBackupFiles: backup.restoredFiles, workspace, traceIsolation, existingAccountPermissionsPreserved: true, secretsChanged: false, emailEnabled: false, seedAndLegacyAgentsBlocked: true, retiredDemoCredentialGuardEnabled: true, deployed: false }, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ workspace, traceIsolation, prepared: true, deployed: false, secretsChanged: false }))

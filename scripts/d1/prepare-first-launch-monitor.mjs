import { readFile, writeFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuildTraceIsolation } from './build-traces.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const app = path.join(root, '.private/d1-migration/first-launch/application')
const configPath = path.join(app, 'wrangler.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const build = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
if (config.name !== 'nilelink-system' || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.d1_databases?.length !== 1 || config.d1_databases[0].database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' || config.r2_buckets.find(row => row.binding === 'D1_PREVIEW_FILES')?.bucket_name !== 'nilelink-production-files') throw Error('Wrong first-launch destination')
if (build.exitCode !== 0 || !build.firstLaunch || !build.credentialsIsolated || build.dotenvFilesCopied || build.publicOrigin !== config.vars.NEXT_PUBLIC_APP_URL) throw Error('Isolated first-launch build required')
const workspace = await realpath(build.workspace), parent = await realpath(path.join(root, '.private/d1-migration/build-audit/workspaces'))
if (!workspace.startsWith(parent + path.sep)) throw Error('Build escapes isolated directory')
const traceIsolation = await verifyBuildTraceIsolation(workspace)
await writeFile(path.join(app, 'wrangler.before-monitor.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
const entry = path.join(workspace, 'first-launch-monitor-worker.mjs')
const gate = path.relative(workspace, path.join(root, 'scripts/d1/prelaunch-gate.mjs')).replaceAll('\\', '/')
await writeFile(entry, `import application from './.open-next/worker.js';\nimport {createPrelaunchGate} from ${JSON.stringify(gate)};\nexport * from './.open-next/worker.js';\nexport default createPrelaunchGate(application);\n`, { flag: 'wx', mode: 0o600 })
config.main = entry
config.assets.directory = path.join(workspace, '.open-next/assets')
config.r2_buckets = config.r2_buckets.filter(row => row.binding !== 'D1_BACKUPS')
config.r2_buckets.push({ binding: 'D1_BACKUPS', bucket_name: 'nilelink-production-backups' })
Object.assign(config.vars, { D1_BACKUP_SCOPE: 'first-launch', D1_BACKUP_CRON: '30 1 * * *', D1_BACKUP_FIRST_DUE: '2026-10-22T01:30:00.000Z', D1_BACKUP_CREATE_ENABLED: 'false' })
await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
await writeFile(path.join(app, 'monitor-preparation.json'), JSON.stringify({ scope: 'first-launch-read-only-monitoring', workspace, traceIsolation, secretsChanged: false, recordsModified: false, backupBucket: 'nilelink-production-backups', firstScheduledDueAt: config.vars.D1_BACKUP_FIRST_DUE, restoreOrDeleteEnabled: false, deployed: false }, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ workspace, traceIsolation, secretsChanged: false, deployed: false }))

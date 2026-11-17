import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { verifyBuildTraceIsolation } from './build-traces.mjs'
import { canonicalPublicOrigin, approvedPublicOrigins } from '../../lib/deployment/public-origin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const app = path.join(root, '.private/d1-migration/first-launch/application')
const configPath = path.join(app, 'wrangler.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
if (config.name !== 'nilelink-system' || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.vars.D1_RUNTIME_STAGE !== 'first-launch-live' || config.vars.D1_ACTIVATION_CONFIRMED !== 'true' || !approvedPublicOrigins.includes(config.vars.NEXT_PUBLIC_APP_URL) || config.d1_databases?.length !== 1 || config.d1_databases[0].database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb' || config.r2_buckets?.find(row => row.binding === 'D1_PREVIEW_FILES')?.bucket_name !== 'nilelink-production-files' || config.r2_buckets?.find(row => row.binding === 'D1_BACKUPS')?.bucket_name !== 'nilelink-production-backups') throw Error('Refusing unexpected live resources')
if (Object.keys(config.vars).some(name => /SECRET|TOKEN|PASSWORD|API_KEY|MONGODB_URI/.test(name))) throw Error('Secrets must not be embedded in plain variables')
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js')
let activeConfigPath = configPath, activeEnvPath = path.join(app, 'empty.env'), activeCwd = root
async function run(args, input) {
  const child = spawn(process.execPath, ['--use-system-ca', wrangler, ...args, '--config', activeConfigPath, '--env-file', activeEnvPath], { cwd: activeCwd, windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
  if (input) child.stdin.end(input + '\n')
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  if (code !== 0) throw Error('Cloudflare operation failed; no automatic retry')
}
if (process.argv.includes('--install-email-secret')) {
  const values = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8'))
  if (!/^re_[A-Za-z0-9_-]+$/.test(values.RESEND_API_KEY || '')) throw Error('Invalid configured email credential')
  await run(['secret', 'put', 'RESEND_API_KEY'], values.RESEND_API_KEY)
  console.log('Existing email credential installed; its value was not displayed. Delivery still requires explicit activation.')
} else if (process.argv.includes('--install-backup-secret')) {
  const secrets = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/backup/secrets.json'), 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(secrets.BACKUP_TRIGGER_KEY || '')) throw Error('Invalid backup trigger secret')
  // This credential can trigger this backup Worker only. The encryption key
  // and Cloudflare account management token never enter the application.
  await run(['secret', 'put', 'D1_BACKUP_TRIGGER_KEY'], secrets.BACKUP_TRIGGER_KEY)
  console.log('Backup trigger secret installed; secret value not displayed.')
} else if (process.argv.includes('--execute')) {
  const build = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
  if (build.exitCode !== 0 || !build.firstLaunch || !build.credentialsIsolated || build.dotenvFilesCopied || build.publicOrigin !== canonicalPublicOrigin || Date.now() - Date.parse(build.checkedAt) > 3600000) throw Error('A fresh successful isolated first-launch build is required')
  const workspace = await realpath(build.workspace), parent = await realpath(build.temporaryWorkspace ? path.join(os.tmpdir(), 'nilelink-isolated-builds') : path.join(root, '.private/d1-migration/build-audit/workspaces'))
  if (!workspace.startsWith(parent + path.sep)) throw Error('Build is outside the isolated workspace')
  if (build.temporaryWorkspace) {
    activeConfigPath = path.join(workspace, 'wrangler.live.json')
    activeEnvPath = path.join(workspace, 'empty.env')
    activeCwd = workspace
  }
  await verifyBuildTraceIsolation(workspace)
  const directory = path.join(root, '.private/d1-migration/first-launch/deployments', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(path.join(directory, 'wrangler.before.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
  const main = path.join(workspace, 'first-launch-live-worker.mjs')
  let gate = path.relative(workspace, path.join(root, 'scripts/d1/first-launch-live-gate.mjs')).replaceAll('\\', '/')
  if (build.temporaryWorkspace) {
    // Keep imports on the build's drive, with exactly the reviewed gate sources.
    await mkdir(path.join(workspace, 'scripts/d1'), { recursive: true })
    for (const name of ['first-launch-live-gate.mjs', 'retired-demo-passwords.mjs']) await writeFile(path.join(workspace, 'scripts/d1', name), await readFile(path.join(root, 'scripts/d1', name)), { flag: 'wx', mode: 0o600 })
    gate = './scripts/d1/first-launch-live-gate.mjs'
  }
  await writeFile(path.join(workspace, 'expiry-scheduled.mjs'), await readFile(path.join(root, 'scripts/expiry-scheduled.mjs')), { flag: 'wx', mode: 0o600 })
  await writeFile(main, `import application from './.open-next/worker.js';\nimport {createFirstLaunchLiveGate} from ${JSON.stringify(gate)};\nimport {runScheduledExpiry} from './expiry-scheduled.mjs';\nexport * from './.open-next/worker.js';\nconst live = createFirstLaunchLiveGate(application);\nexport default {...live, async scheduled(controller, env, ctx) { await runScheduledExpiry(live, env, ctx); }};\n`, { flag: 'wx', mode: 0o600 })
  config.triggers = { ...(config.triggers || {}), crons: [...new Set([...(config.triggers?.crons || []), '0 * * * *'])] }
  config.main = main; config.assets.directory = path.join(workspace, '.open-next/assets')
  config.vars.NEXT_PUBLIC_APP_URL = canonicalPublicOrigin
  config.services = [{ binding: 'D1_BACKUP_RUNNER', service: 'nilelink-first-launch-backup' }]
  config.vars.D1_BACKUP_CREATE_ENABLED = 'true'
  if (process.argv.includes('--enable-email')) {
    const values = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8'))
    if (!/^[^\s<>@]+@nilelinklogistics\.com$/.test(values.EMAIL_FROM || '')) throw Error('Unexpected email sender')
    Object.assign(config.vars, { EMAIL_PROVIDER: 'resend', EMAIL_FROM: values.EMAIL_FROM, EMAIL_TO: 'info@nilelinklogistics.com', EMAIL_DELIVERY_ENABLED: 'true' })
  }
  await writeFile(activeConfigPath, JSON.stringify(config, null, 2), { mode: 0o600 })
  if (build.temporaryWorkspace) await writeFile(activeEnvPath, '', { mode: 0o600 })
  const receipt = { preparedAt: new Date().toISOString(), workspace, resourcesChanged: false, emailEnabled: config.vars.EMAIL_DELIVERY_ENABLED === 'true', nativeManualBackupsEnabled: true, status: 'prepared' }
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 })
  await run(['deploy'])
  if (build.temporaryWorkspace) await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
  receipt.status = 'deployed-awaiting-live-validation'; receipt.deployedAt = new Date().toISOString()
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ directory, ...receipt }))
} else throw Error('Use --install-email-secret, --install-backup-secret or --execute [--enable-email]; no deployment performed')

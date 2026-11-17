import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
import { canonicalPublicOrigin, approvedPublicOrigins } from '../../lib/deployment/public-origin.mjs'
const root = process.cwd(), app = path.join(root, '.private/d1-migration/first-launch/application')
const configPath = path.join(app, 'wrangler.json'), config = JSON.parse(await readFile(configPath, 'utf8'))
assert.equal(config.account_id, 'f882b38e4571e0141cb6353f5a271af7'); assert.equal(config.name, 'nilelink-system')
assert.equal(config.d1_databases[0].database_id, '515ee420-9ccb-4bbc-ba98-53ecb391bbeb')
assert.equal(config.vars.D1_RUNTIME_STAGE, 'first-launch-live'); assert.ok(approvedPublicOrigins.includes(config.vars.NEXT_PUBLIC_APP_URL))
const workspace = await realpath(path.dirname(path.dirname(config.assets.directory)))
assert.equal(await realpath(path.join(workspace, '.open-next/assets')), await realpath(config.assets.directory))
assert.ok((await readFile(path.join(workspace, '.open-next/worker.js'))).length > 0)
const id = randomUUID(), directory = path.join(root, '.private/d1-migration/first-launch/deployments', id)
await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, 'wrangler.before.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
// New wrapper only; the existing application bundle and assets are untouched.
const wrapper = path.join(workspace, 'custom-domain-' + id)
await mkdir(path.join(wrapper, 'scripts/d1'), { recursive: true }); await mkdir(path.join(wrapper, 'lib/db'), { recursive: true }); await mkdir(path.join(wrapper, 'lib/deployment'), { recursive: true })
for (const name of ['scripts/d1/first-launch-live-gate.mjs', 'scripts/d1/retired-demo-passwords.mjs', 'lib/db/staging-context.mjs', 'lib/deployment/public-origin.mjs']) await writeFile(path.join(wrapper, name), await readFile(path.join(root, name)), { flag: 'wx', mode: 0o600 })
const main = path.join(wrapper, 'worker.mjs')
await writeFile(main, "import application from '../.open-next/worker.js';\nimport {createFirstLaunchLiveGate} from './scripts/d1/first-launch-live-gate.mjs';\nexport * from '../.open-next/worker.js';\nexport default createFirstLaunchLiveGate(application);\n", { flag: 'wx' })
config.main = main; config.vars.NEXT_PUBLIC_APP_URL = canonicalPublicOrigin
await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
const report = { status: 'prepared', scope: 'custom-domain-gate-only', applicationBundleUnchanged: true, databaseModified: false, canonicalRuntimeOrigin: canonicalPublicOrigin, builtEmailLinksNotRebuilt: true }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
await save()
const child = spawn(process.execPath, ['--use-system-ca', path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', configPath, '--env-file', path.join(app, 'empty.env')], { cwd: root, stdio: 'inherit', windowsHide: true })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
assert.equal(code, 0)
report.status = 'deployed-awaiting-validation'; report.deployedAt = new Date().toISOString(); await save()
console.log(JSON.stringify({ directory, ...report }))

import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, readFile, writeFile, rm, realpath, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { verifyBuildTraceIsolation } from './build-traces.mjs'
import { canonicalPublicOrigin } from '../../lib/deployment/public-origin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let cli = process.argv.slice(2)
const temporaryWorkspace = cli.includes('--temporary-workspace')
cli = cli.filter(value => value !== '--temporary-workspace')
const reuseIndex = cli.indexOf('--reuse-dependencies-from')
const reuseDependencies = reuseIndex >= 0 ? cli[reuseIndex + 1] : null
if (reuseIndex >= 0) {
  if (!temporaryWorkspace || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(reuseDependencies || '')) throw new Error('Expected a temporary dependency workspace ID')
  cli.splice(reuseIndex, 2)
}
const refreshLaunchId = cli.length === 4 && cli[0] === '--worker' && cli[1] === '--first-launch' && cli[2] === '--refresh-unpublished-workspace' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(cli[3]) ? cli[3] : null
const resumeLaunch = cli.length === 4 && cli[0] === '--worker' && cli[1] === '--first-launch' && cli[2] === '--resume-workspace'
const firstLaunch = !!refreshLaunchId || resumeLaunch || (cli.length === 2 && cli[0] === '--worker' && cli[1] === '--first-launch')
if (resumeLaunch) cli.splice(1, 1)
if (refreshLaunchId) cli = ['--worker', '--resume-workspace', refreshLaunchId]
else if (firstLaunch && !resumeLaunch) cli.pop()
const resumeId = cli.length === 3 && cli[0] === '--worker' && cli[1] === '--resume-workspace' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(cli[2]) ? cli[2] : null
if (!resumeId && (cli.some(value => value !== '--worker') || cli.length > 1)) throw new Error('Usage: node scripts/d1/build-audit.mjs [--worker [--resume-workspace <failed-private-workspace-id>]]')
const environment = { ...process.env }
const sensitive = /SECRET|TOKEN|PASSWORD|SMTP|RESEND|API_KEY|MONGODB|BACKUP_AGENT|CF_ACCESS|CLOUDFLARE|AWS_/i
// Next automatically loads dotenv files. Set placeholder values first so live
// credentials in those files cannot become part of this build's environment.
for (const name of Object.keys(environment)) if (sensitive.test(name)) environment[name] = 'local-d1-build-audit-disabled'
for (const filename of ['.env', '.env.local', '.env.production', '.env.production.local', '.dev.vars']) {
  try {
    const content = await readFile(path.join(root, filename), 'utf8')
    for (const match of content.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) if (sensitive.test(match[1])) environment[match[1]] = 'local-d1-build-audit-disabled'
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
Object.assign(environment, { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', NEXT_TELEMETRY_DISABLED: '1',
  MONGODB_URI: 'mongodb://127.0.0.1:1/d1-build-audit', JWT_SECRET: 'local-d1-build-audit-disabled', AUTH_SECRET: 'local-d1-build-audit-disabled', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
if (firstLaunch) environment.NEXT_PUBLIC_APP_URL = canonicalPublicOrigin
// Honor the Windows/system trust store rather than disabling certificate verification.
if (process.allowedNodeEnvironmentFlags.has('--use-system-ca')) environment.NODE_OPTIONS = `${environment.NODE_OPTIONS || ''} --use-system-ca`.trim()
// Let each esbuild package resolve its matching binary. Wrangler can carry a
// different version from the root package, so a shared override breaks builds.
delete environment.ESBUILD_BINARY_PATH
const worker = process.argv.includes('--worker')
let workspace = root
if (worker) {
  // OpenNext reads/copies dotenv files directly, bypassing process.env overrides.
  // Build the worker in a new sanitized workspace rather than renaming or editing
  // the user's live dotenv files or loading the original Wrangler configuration.
  workspace = path.join(temporaryWorkspace ? path.join(os.tmpdir(), 'nilelink-isolated-builds') : path.join(root, '.private/d1-migration/build-audit/workspaces'), resumeId || randomUUID())
  if (resumeId) {
    const previous = JSON.parse(await readFile(path.join(root, '.private/d1-migration/build-audit/worker.json'), 'utf8'))
    if (previous.firstLaunch === true && !firstLaunch) throw new Error('A first-launch build cannot resume as a preview build')
    if (resumeLaunch && (previous.firstLaunch !== true || previous.publicOrigin !== environment.NEXT_PUBLIC_APP_URL || previous.temporaryWorkspace !== temporaryWorkspace)) throw new Error('First-launch resume must match the original build scope')
    if (refreshLaunchId) {
      const live = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/application/wrangler.json'), 'utf8'))
      if (previous.firstLaunch !== true || previous.publicOrigin !== environment.NEXT_PUBLIC_APP_URL || live.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || path.resolve(live.main).startsWith(workspace + path.sep) || path.resolve(live.assets.directory).startsWith(workspace + path.sep)) throw new Error('Only an unpublished matching first-launch workspace may refresh')
    }
    if (path.resolve(previous.workspace) !== workspace || (!refreshLaunchId && previous.exitCode === 0) || !previous.credentialsIsolated || previous.dotenvFilesCopied || !(await readFile(path.join(workspace, 'package-lock.json'))).equals(await readFile(path.join(root, 'package-lock.json')))) throw new Error('Only the matching isolated build with unchanged dependencies may resume')
    for (const filename of ['.env', '.env.local', '.env.production', '.env.production.local', '.dev.vars']) {
      try { await lstat(path.join(workspace, filename)); throw new Error('Unexpected dotenv in resumed workspace') }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  } else await mkdir(workspace, { recursive: true, mode: 0o700 })
  const copy = async name => {
    const source = path.join(root, name)
    if (refreshLaunchId) {
      const resolvedWorkspace = await realpath(workspace)
      const expectedParent = await realpath(path.join(root, '.private/d1-migration/build-audit/workspaces'))
      const target = path.resolve(resolvedWorkspace, name)
      if (!resolvedWorkspace.startsWith(expectedParent + path.sep) || !target.startsWith(resolvedWorkspace + path.sep)) throw new Error('Refreshed source escapes the unpublished build workspace')
      try { if ((await lstat(target)).isSymbolicLink()) throw new Error('Refreshed build source is a symlink') } catch (error) { if (error.code !== 'ENOENT') throw error }
      // Only whitelisted copied sources inside the unpublished build are
      // replaced. Dependencies/caches remain; removed routes cannot linger.
      await rm(target, { recursive: true, force: true })
    }
    try { await lstat(source) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    await cp(source, path.join(workspace, name), { recursive: true, filter: async candidate => {
      const stat = await lstat(candidate)
      if (stat.isSymbolicLink()) throw new Error('Build source symlink requires review')
      const base = path.basename(candidate)
      return !/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)|^secrets\.json$/i.test(base)
    } })
  }
  for (const name of ['app', 'components', 'lib', 'constants', 'messages', 'i18n', 'types', 'public', 'hooks', 'utils', 'navigation.ts', 'i18n.ts',
    'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.mjs', 'open-next.d1.audit.config.ts', 'wrangler.d1.build.jsonc', 'wrangler.d1.local.jsonc',
    'postcss.config.mjs', 'postcss.config.js', 'tailwind.config.ts', 'tailwind.config.js', 'middleware.ts', 'proxy.ts', 'cloudflare-env.d.ts']) await copy(name)
  // A junction resolves outside the sanitized app. Next then emits ../../ traces
  // which escape OpenNext's output directory and its runtime patches are skipped.
  // Real dependency files keep tracing and patching inside this build workspace.
  if (!resumeId && reuseDependencies) {
    const parent = await realpath(path.join(os.tmpdir(), 'nilelink-isolated-builds'))
    const previous = await realpath(path.join(parent, reuseDependencies))
    const target = await realpath(workspace)
    if (!previous.startsWith(parent + path.sep) || !target.startsWith(parent + path.sep) || previous === target ||
      !(await readFile(path.join(previous, 'package-lock.json'))).equals(await readFile(path.join(root, 'package-lock.json'))) ||
      (await lstat(path.join(previous, 'node_modules'))).isSymbolicLink()) throw new Error('Dependency reuse must stay within matching generated temporary builds')
    const sourceDependencies = path.join(previous, 'node_modules'), targetDependencies = path.join(target, 'node_modules')
    try { await rename(sourceDependencies, targetDependencies) }
    catch (error) {
      if (process.platform !== 'win32' || error.code !== 'EPERM') throw error
      // Paths above are resolved and checked against the isolated-build parent.
      const literal = value => "'" + value.replaceAll("'", "''") + "'"
      const mover = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Move-Item -LiteralPath ${literal(sourceDependencies)} -Destination ${literal(targetDependencies)} -ErrorAction Stop`], { windowsHide: true, stdio: 'inherit' })
      const moved = await new Promise((resolve, reject) => { mover.once('error', reject); mover.once('exit', resolve) })
      if (moved !== 0) throw new Error('Generated dependency move failed')
    }
    // OpenNext removes its AWS entry while packaging. Restore this build-time
    // entry from the matching lockfile installation before reusing dependencies.
    await cp(path.join(root, 'node_modules/@opennextjs/aws/dist/index.js'), path.join(targetDependencies, '@opennextjs/aws/dist/index.js'))
    console.log('Reused matching generated dependencies without duplicating disk space; previous deployed artifacts retained.')
  } else if (!resumeId) {
  console.log('Copying dependencies into the isolated workspace for correct Next file tracing.')
  if (process.platform === 'win32') {
    // Parallel ordinary copies, never junctions/hardlinks or mirror/delete flags.
    // Skipped source junctions fail later dependency/build/trace checks if needed.
    const copier = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'robocopy.exe')
    const child = spawn(copier, [path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), '/E', '/COPY:DAT', '/DCOPY:DAT', '/MT:8', '/R:0', '/W:0', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD', '.cache', '.wrangler'], { stdio: 'ignore', windowsHide: true })
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    if (!Number.isInteger(code) || code >= 8) throw new Error('Windows dependency copy failed; no build or deploy executed')
  } else {
  await cp(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), {
    recursive: true, dereference: true,
    filter: candidate => !['.cache', '.wrangler'].includes(path.basename(candidate)),
  })
  }
  } else console.log('Reusing dependencies from the matching failed isolated build; refreshing application sources.')
}
const entry = worker ? 'node_modules/@opennextjs/cloudflare/dist/cli/index.js' : 'node_modules/next/dist/bin/next'
const args = worker ? [entry, 'build', '--config=wrangler.d1.build.jsonc', '--openNextConfigPath=open-next.d1.audit.config.ts'] : [entry, 'build', '--webpack']
console.log('Local D1 build audit: placeholder credentials, local bindings, no deployment. Production D1 remains disabled.')
const child = spawn(process.execPath, args, { cwd: workspace, env: environment, stdio: 'inherit', windowsHide: true })
let exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)) })
let traceIsolation
if (worker && exitCode === 0) {
  try { traceIsolation = await verifyBuildTraceIsolation(workspace) }
  catch { exitCode = 1; console.error('Worker build traces escaped the isolated workspace or could not be verified. Do not deploy this artifact.') }
}
const directory = path.join(root, '.private/d1-migration/build-audit')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(path.join(directory, worker ? 'worker.json' : 'next.json'), JSON.stringify({ checkedAt: new Date().toISOString(), scope: worker ? 'opennext-local-build' : 'next-local-build', firstLaunch, temporaryWorkspace, publicOrigin: environment.NEXT_PUBLIC_APP_URL, workspace, exitCode, credentialsIsolated: true, dotenvFilesCopied: false, traceIsolation, deployed: false, remoteD1Validated: false, productionCertified: false }, null, 2), { mode: 0o600 })
process.exitCode = Number(exitCode)

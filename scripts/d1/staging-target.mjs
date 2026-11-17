import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readD1MigrationStatements } from './migrations.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
export function stagingConfig({ accountId, databaseId, databaseName }) {
  if (typeof accountId !== 'string' || !/^[a-f\d]{32}$/i.test(accountId) || /^0+$/.test(accountId)) throw new Error('Select the destination Account ID explicitly')
  if (typeof databaseId !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(databaseId) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(databaseId)) throw new Error('A real staging Database ID is required')
  if (typeof databaseName !== 'string' || !/^nilelink-d1-staging(?:-[a-z0-9]+)*$/.test(databaseName) || databaseName.length > 63) throw new Error('Database name must explicitly identify NileLink D1 staging')
  return { name: databaseName, account_id: accountId, compatibility_date: '2025-04-01',
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId, migrations_dir: path.join(root, 'migrations/d1') }] }
}

/** Writes a private D1-only target file. Never logs in, creates, deploys or executes remote SQL. */
export async function prepareStagingTarget(input, parent = path.join(root, '.private/d1-migration/targets')) {
  const config = stagingConfig(input)
  const directory = path.join(parent, randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const configText = JSON.stringify(config, null, 2) + '\n'
  const target = { formatVersion: 1, scope: 'staging-d1-only', accountId: input.accountId, databaseId: input.databaseId, databaseName: input.databaseName,
    configSha256: createHash('sha256').update(configText).digest('hex'),
    migrationsSha256: createHash('sha256').update(JSON.stringify(await readD1MigrationStatements())).digest('hex'),
    accountVerified: false, databaseOwnershipVerified: false, databaseEmptyVerified: false, remoteWritesExecuted: false, productionCertified: false }
  await writeFile(path.join(directory, 'wrangler.json'), configText, { flag: 'wx', mode: 0o600 })
  await writeFile(path.join(directory, 'empty.env'), '# Intentionally empty: do not load project dotenv secrets.\n', { flag: 'wx', mode: 0o600 })
  await writeFile(path.join(directory, 'target.json'), JSON.stringify(target, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return directory
}

export async function verifyStagingTarget(directory, expectedAccountId) {
  const target = JSON.parse(await readFile(path.join(directory, 'target.json'), 'utf8'))
  const configText = await readFile(path.join(directory, 'wrangler.json'), 'utf8'), config = JSON.parse(configText)
  stagingConfig(target)
  if (target.formatVersion !== 1 || target.scope !== 'staging-d1-only' || target.accountId !== expectedAccountId || config.account_id !== expectedAccountId) throw new Error('Destination account mismatch')
  if (target.configSha256 !== createHash('sha256').update(configText).digest('hex') || JSON.stringify(config) !== JSON.stringify(stagingConfig(target))) throw new Error('Staging target configuration changed')
  if (target.migrationsSha256 !== createHash('sha256').update(JSON.stringify(await readD1MigrationStatements())).digest('hex')) throw new Error('Migration schema changed; prepare a new target')
  return target
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length !== 6 || args[0] !== '--account-id' || args[2] !== '--database-id' || args[4] !== '--database-name') {
    console.log('node scripts/d1/staging-target.mjs --account-id <destination-account-id> --database-id <staging-id> --database-name nilelink-d1-staging')
    process.exitCode = args.includes('--help') ? 0 : 1
  } else try {
    const directory = await prepareStagingTarget({ accountId: args[1], databaseId: args[3], databaseName: args[5] })
    console.log(JSON.stringify({ targetDirectory: directory, remoteWritesExecuted: false, accountVerificationRequired: true }))
  } catch { console.error('Staging target preparation failed. No Cloudflare resources were changed.'); process.exitCode = 1 }
}

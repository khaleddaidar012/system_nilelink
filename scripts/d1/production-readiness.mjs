import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = name => readFile(path.join(root, name), 'utf8')
const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', await read('wrangler.jsonc'))
if (parsed.error) throw new Error('Cannot inspect Wrangler JSONC safely')
const config = parsed.config
const source = await Promise.all(['lib/db/provider.ts', 'lib/workflows/delivery.ts', 'lib/backup/guard.ts', 'scripts/d1/cloud-backup-core.mjs', 'lib/backup/d1-create.ts'].map(read))
let liveConfig = {}
try { liveConfig = JSON.parse(await read('.private/d1-migration/first-launch/application/wrangler.json')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
let firstLaunch = {}
try { firstLaunch = JSON.parse(await read('.private/d1-migration/first-launch/resources.json')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const embeddedSecretNames = Object.keys(config.vars || {}).filter(k => !k.startsWith('NEXT_PUBLIC_') && /SECRET|TOKEN|PASSWORD|API_KEY|MONGODB_URI|DATABASE_URL|SMTP_PASS/.test(k) && config.vars[k])
const gates = [
  { name: 'D1 production activation', status: firstLaunch.publicActivationConfirmed && source[0].includes('isApprovedFirstLaunchRequest()') ? 'user-authorized-live-entry-with-pinned-resources' : source[0].includes('isIsolatedStagingRequest()') ? 'blocked-by-existing-guard' : 'requires-review' },
  { name: 'D1 financial email', status: liveConfig.vars?.EMAIL_DELIVERY_ENABLED === 'true' && source[1].includes('liveEmailConfigured') ? 'live-provider-configured-with-idempotent-financial-delivery' : 'provider-activation-deferred' },
  { name: 'Legacy MongoDB backup agent', status: source[2].includes('D1_BACKUP_UNAVAILABLE') ? 'blocked-on-d1-by-design' : 'requires-review' },
  { name: 'Native D1 manual backup creation', status: source[4].includes('"first-launch"') && liveConfig.vars?.D1_BACKUP_CREATE_ENABLED === 'true' && liveConfig.services?.some(row => row.binding === 'D1_BACKUP_RUNNER' && row.service === 'nilelink-first-launch-backup') ? 'live-service-binding-configured-validation-report-required' : source[4].includes('baseline-staging') ? 'implemented-live-scope-awaiting-configuration' : 'requires-review' },
  { name: 'Native D1 in-place restore', status: 'not-enabled' },
  { name: 'Secrets in original Wrangler configuration', status: embeddedSecretNames.length ? 'legacy-config-contains-secrets-do-not-deploy-it-live-uses-separate-secrets' : 'no-matching-embedded-values', keyNamesOnly: embeddedSecretNames },
  { name: 'First-launch application', status: firstLaunch.applicationMode === 'first-launch-live' ? liveConfig.vars?.EMAIL_DELIVERY_ENABLED === 'true' ? 'live-with-account-authorization-and-email-enabled' : 'live-with-account-authorization-and-deferred-email' : firstLaunch.applicationMode === 'protected-review' ? 'deployed-with-public-access-and-business-writes-blocked' : 'not-recorded' },
  { name: 'Current backup source', status: firstLaunch.dynamicBackupRestoreVerified ? 'first-launch-dynamic-documents-and-pending-uploads-restore-verified' : firstLaunch.prelaunchBackupRestoreVerified ? 'first-launch-static-snapshot-restore-verified' : source[3].includes('baseline-staging-only') ? 'fixed-staging-baseline-only' : 'requires-review' },
  { name: 'Recovery key storage', status: firstLaunch.userRequestedContinueWithSameDeviceKey ? 'user-confirmed-second-location-on-same-device-and-requested-continuation' : 'user-confirmation-not-recorded', offDeviceConfirmed: firstLaunch.recoveryKeyOffDeviceConfirmed === true },
  { name: 'Final source snapshot with write freeze', status: 'not-performed' },
  { name: 'Demo file exception', status: 'user-confirmed-demo-file-retain-record-and-document-missing-bytes' },
]
const report = { scope: 'read-only-production-readiness-inspection', checkedAt: new Date().toISOString(),
  sourceFilesModified: false, secretValuesIncluded: false, productionCertified: false, gates,
  rootConfiguration: { expectedAccountSelected: config.account_id === 'f882b38e4571e0141cb6353f5a271af7',
    d1BindingCount: config.d1_databases?.length || 0, r2BindingCount: config.r2_buckets?.length || 0, cronCount: config.triggers?.crons?.length || 0 } }
const directory = path.join(root, '.private/d1-migration/readiness')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(path.join(directory, 'production-readiness.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify(report))

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBackupStage } from '../../scripts/d1/cloud-backup-core.mjs'
test('prelaunch backup permits only the pinned new destination and never arbitrary production', () => {
  const source = { accountId: 'f882b38e4571e0141cb6353f5a271af7', databaseId: '515ee420-9ccb-4bbc-ba98-53ecb391bbeb', bucketName: 'nilelink-production-files' }
  const spec = { scope: 'first-launch-snapshot-only', source }
  assert.doesNotThrow(() => validateBackupStage({ BACKUP_STAGE: 'prelaunch' }, spec))
  for (const key of Object.keys(source)) assert.throws(() => validateBackupStage({ BACKUP_STAGE: 'prelaunch' }, { ...spec, source: { ...source, [key]: 'unapproved' } }))
  assert.throws(() => validateBackupStage({ BACKUP_STAGE: 'production' }, spec))
  assert.throws(() => validateBackupStage({ BACKUP_STAGE: 'isolated-staging' }, spec))
  assert.throws(() => validateBackupStage({ BACKUP_STAGE: 'prelaunch' }, { scope: 'baseline-staging-only' }))
  assert.doesNotThrow(() => validateBackupStage({ BACKUP_STAGE: 'isolated-staging' }, { scope: 'baseline-staging-only' }))
})

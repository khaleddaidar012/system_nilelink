import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { cleanStagingConfig } from '../../scripts/d1/clean-deployment.mjs'

const input = { accountId: 'f882b38e4571e0141cb6353f5a271af7', databaseId: '7aa12b1a-5015-4f99-b028-d65de7a260bd', databaseName: 'nilelink-d1-staging-e2e', bucketName: 'nilelink-d1-staging-e2e-files', main: path.resolve('fixture/worker.mjs'), assets: path.resolve('fixture/assets'), origin: 'https://nilelink-d1-staging-e2e.mohamedznaty55.workers.dev' }
test('clean config allowlist excludes injected legacy secrets and production routes', () => {
  const config = cleanStagingConfig({ ...input, vars: { MONGODB_URI: 'must-not-copy', JWT_SECRET: 'must-not-copy' }, routes: ['production.example/*'] })
  assert.equal(config.vars.JWT_SECRET, undefined); assert.equal(config.vars.MONGODB_URI, undefined); assert.equal(config.routes, undefined)
  assert.equal(config.assets.run_worker_first, true)
  assert.equal(config.vars.NEXT_PUBLIC_APP_URL, input.origin)
  assert.equal(config.vars.D1_RUNTIME_STAGE, 'isolated-staging')
})
test('rejects old account, baseline database, wrong bucket and unverified origin', () => {
  for (const patch of [{ accountId: '0'.repeat(32) }, { databaseId: '5055ce01-0b2b-4ed4-a175-f325e99e9c10' }, { bucketName: 'nilelink-d1-staging-files' }, { origin: 'https://production.example' }, { main: 'relative.mjs' }]) assert.throws(() => cleanStagingConfig({ ...input, ...patch }))
})

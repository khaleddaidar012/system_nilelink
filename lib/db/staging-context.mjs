import { AsyncLocalStorage } from 'node:async_hooks'

// Shared across the outer Worker and Next's separately bundled server modules.
const key = Symbol.for('nilelink.isolated-staging.request-context')
function storage() {
  return globalThis[key] ??= new AsyncLocalStorage()
}
export function isIsolatedStagingRequest() {
  return storage().getStore() === 'authenticated-isolated-staging'
}
export function withIsolatedStagingRequest(callback) {
  return storage().run('authenticated-isolated-staging', callback)
}
export function isApprovedFirstLaunchRequest() {
  return storage().getStore() === 'approved-first-launch-live'
}
export function withApprovedFirstLaunchRequest(callback) {
  return storage().run('approved-first-launch-live', callback)
}

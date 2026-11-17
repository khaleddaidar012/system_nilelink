import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = '.private/d1-migration/first-launch'
const origin = 'https://nilelinklogistics.com'
const credentials = JSON.parse(await readFile(base + '/application/requested-admin-credentials.json', 'utf8'))
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials.email, password: credentials.password, rememberMe: false }), signal: AbortSignal.timeout(60000) })
assert.equal(login.status, 200, 'Existing administrator login')
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const call = (url, options = {}) => fetch(origin + url, { ...options, headers: { cookie, origin, ...options.headers }, signal: AbortSignal.timeout(60000) })
const report = { checkedAt: new Date().toISOString(), checks: [], status: 'running' }
for (const route of ['/ar/login', '/api/admin/requests', '/api/admin/notifications', '/api/admin/documents/expiring', '/api/admin/workspace-activity']) {
  const response = await call(route)
  assert.equal(response.status, 200, route)
  await response.arrayBuffer()
  report.checks.push({ route, status: response.status })
}
const build = JSON.parse(await readFile('.private/d1-migration/build-audit/worker.json', 'utf8'))
const buildId = (await readFile(build.workspace + '/.next/BUILD_ID', 'utf8')).trim()
const page = await fetch(origin + '/ar/login', { cache: 'no-store', signal: AbortSignal.timeout(60000) })
assert.equal(page.status, 200)
assert.ok((await page.text()).includes(buildId), 'Live build matches the new artifact')
report.newBuildVerified = true
const dashboard = await call('/en/admin')
assert.equal(dashboard.status, 200)
const dashboardHtml = await dashboard.text()
assert.ok(dashboardHtml.includes('Lock current sidebar position'), 'Sidebar lock control is present')
assert.ok(!dashboardHtml.includes('Expand and pin sidebar'), 'Extra sidebar size control was removed')
report.sidebarControlsPresent = true
const scan = await call('/api/cron/check-expiries', { method: 'POST' })
assert.equal(scan.status, 200, 'Initial expiry scan')
const data = await scan.json()
assert.equal(data.success, true)
assert.equal(data.results.conflicts, 0)
report.expiryScan = data.results
try {
  const affected = JSON.parse(await readFile('.private/affected-account-review.json', 'utf8'))
  const account = await (await call('/api/admin/customers/' + affected.id)).json()
  assert.equal(account.customer.accountStatus, 'active', 'Previously approved customer remains active after deployment and expiry scan')
  report.approvedAccountPreserved = true
} catch (error) { if (error.code !== 'ENOENT') throw error }
report.status = 'passed'
await writeFile(base + '/request-updates-live-validation.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

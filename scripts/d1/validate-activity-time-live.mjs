import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = '.private/d1-migration/first-launch'
const origin = 'https://nilelinklogistics.com'
const credentials = JSON.parse(await readFile(base + '/application/requested-admin-credentials.json', 'utf8'))
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: credentials.email, password: credentials.password }), signal: AbortSignal.timeout(60000) })
assert.equal(login.status, 200)
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const page = await fetch(origin + '/en/admin/activity', { headers: { cookie }, signal: AbortSignal.timeout(60000) })
assert.equal(page.status, 200)
const html = await page.text()
const build = JSON.parse(await readFile('.private/d1-migration/build-audit/worker.json', 'utf8'))
assert.ok(html.includes((await readFile(build.workspace + '/.next/BUILD_ID', 'utf8')).trim()))
const script = [...html.matchAll(/src="([^"]*\/admin\/activity\/page-[^"]+\.js)"/g)][0]?.[1]
assert.ok(script, 'Activity page script is present')
const asset = await fetch(new URL(script, origin), { signal: AbortSignal.timeout(60000) })
assert.equal(asset.status, 200)
const code = await asset.text()
assert.match(code, /hour12:\s*(?:true|!0)/)
assert.ok(code.includes('Africa/Cairo'))
const report = { status: 'passed', checkedAt: new Date().toISOString(), liveBuildVerified: true, activityHour12Enabled: true, cairoTimezonePreserved: true }
await writeFile(base + '/activity-time-live-validation.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

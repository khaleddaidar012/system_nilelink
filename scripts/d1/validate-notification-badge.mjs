import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../../', import.meta.url)), origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const config = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/application/wrangler.json'), 'utf8'))
assert.equal(config.account_id, 'f882b38e4571e0141cb6353f5a271af7'); assert.equal(config.name, 'nilelink-system')
const password = (await readFile(path.join(root, '.private/d1-migration/first-launch/application/manager-credentials.txt'), 'utf8')).match(/^Password: (.+)$/m)?.[1].trim()
assert.ok(password)
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'admin@nilelinklogistics.com', password, rememberMe: false }), signal: AbortSignal.timeout(60000) })
assert.equal(login.status, 200)
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const call = url => fetch(origin + url, { headers: { cookie }, signal: AbortSignal.timeout(60000) })
const me = await call('/api/auth/me'); assert.equal(me.status, 200)
const data = await me.json(); assert.equal(data.authenticated, true); assert.equal(data.unreadNotificationsCount, 0)
const response = await call('/api/portal/notifications?limit=5'); assert.equal(response.status, 200)
const notifications = await response.json(); assert.ok(notifications.notifications.every(note => note.isRead === true))
const report = { scope: 'independent-read-only-verification-after-browser-bell-open', checkedAt: new Date().toISOString(), unreadCount: data.unreadNotificationsCount, visibleNotifications: notifications.notifications.length, allVisibleRead: true, acknowledgementSubmittedByThisScript: false, businessRecordsModified: false }
const directory = path.join(root, '.private/d1-migration/first-launch/portal-ui')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(path.join(directory, 'notification-persistence.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
console.log(JSON.stringify(report))

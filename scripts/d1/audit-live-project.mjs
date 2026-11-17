import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { canonicalPublicOrigin } from '../../lib/deployment/public-origin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const app = path.join(root, '.private/d1-migration/first-launch/application')
const config = JSON.parse(await readFile(path.join(app, 'wrangler.json'), 'utf8'))
const origin = canonicalPublicOrigin
if (config.name !== 'nilelink-system' || config.account_id !== 'f882b38e4571e0141cb6353f5a271af7' || config.vars.NEXT_PUBLIC_APP_URL !== origin || config.d1_databases?.[0]?.database_id !== '515ee420-9ccb-4bbc-ba98-53ecb391bbeb') throw Error('Unexpected deployment target')
const password = (await readFile(path.join(app, 'manager-credentials.txt'), 'utf8')).match(/^Password: (.+)$/m)?.[1].trim()
if (!password) throw Error('Existing authorized credential unavailable')
const directory = path.join(root, '.private/d1-migration/first-launch/project-audit', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const report = { checkedAt: new Date().toISOString(), status: 'running', secretValuesIncluded: false, businessWritesRequested: false, loginUpdatesPossible: true, checks: [], configuration: { account: config.account_id, databaseBindings: config.d1_databases.map(({ binding, database_name }) => ({ binding, database_name })), storageBindings: config.r2_buckets.map(({ binding, bucket_name }) => ({ binding, bucket_name })), variableNames: Object.keys(config.vars).sort(), serviceBindings: (config.services || []).map(({ binding, service }) => ({ binding, service })) } }
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
const call = (url, cookie, input) => fetch(origin + url, { method: input ? 'POST' : 'GET', redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(input ? { 'content-type': 'application/json', origin } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(60000) })
try {
  const login = await call('/api/auth/login', undefined, { identifier: 'admin@nilelinklogistics.com', password, rememberMe: false })
  if (login.status !== 200) throw Error(`Login failed (${login.status})`)
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await login.arrayBuffer()
  const pages = ['/ar', '/en', '/ar/about', '/ar/services', '/ar/contact', '/ar/request-quote', '/ar/login', '/ar/register', '/ar/admin', '/ar/admin/customers', '/ar/admin/requests', '/ar/admin/documents/review', '/ar/admin/quotes', '/ar/admin/invoices', '/ar/admin/operations', '/ar/admin/pricing', '/ar/admin/notifications', '/ar/admin/staff', '/ar/admin/settings', '/ar/admin/system/backups']
  const apis = ['/api/auth/me', '/api/admin/customers', '/api/admin/requests', '/api/admin/documents/review', '/api/admin/documents/expiring', '/api/admin/quotes', '/api/admin/invoices', '/api/admin/operations', '/api/admin/pricing-rules', '/api/admin/notifications', '/api/admin/staff', '/api/admin/roles', '/api/admin/settings/categories', '/api/settings/document-categories', '/api/admin/analytics/overview', '/api/admin/overview', '/api/admin/system/d1-backups']
  const selected = process.argv.find(value => value.startsWith('--path='))?.slice(7)
  if (selected && ![...pages, ...apis].includes(selected)) throw Error('Unknown audit route')
  if (selected) report.recheckedPath = selected
  // Bounded batches avoid a traffic burst against the live database.
  for (const urls of [pages, apis].map(urls => selected ? urls.filter(url => url === selected) : urls)) for (let offset = 0; offset < urls.length; offset += 3) {
    const results = await Promise.all(urls.slice(offset, offset + 3).map(async url => {
      try {
        const response = await call(url, cookie)
        const contentType = response.headers.get('content-type') || ''
        await response.arrayBuffer() // Consume bodies; never persist customer data.
        return { url, status: response.status, passed: response.status === 200 && contentType.includes(url.startsWith('/api/') ? 'application/json' : 'text/html') }
      } catch (error) { return { url, passed: false, error: error.name } }
    }))
    report.checks.push(...results); await save()
  }
  report.status = report.checks.every(check => check.passed) ? 'all-live-project-reads-passed' : 'needs-review'
  report.completedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ directory, status: report.status, passed: report.checks.filter(check => check.passed).length, total: report.checks.length, failures: report.checks.filter(check => !check.passed) }))
  if (report.status === 'needs-review') process.exitCode = 1
} catch (error) { report.status = 'failed'; report.error = String(error.message).slice(0, 100); await save(); throw error }

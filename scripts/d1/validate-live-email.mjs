import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../../', import.meta.url)), origin = 'https://nilelink-system.mohamedznaty55.workers.dev'
const directory = path.join(root, '.private/d1-migration/first-launch/email-activation')
const file = path.join(directory, 'test-email.json'), recipient = 'info@nilelinklogistics.com'
const config = JSON.parse(await readFile(path.join(root, '.private/d1-migration/first-launch/application/wrangler.json'), 'utf8'))
assert.equal(config.vars.EMAIL_DELIVERY_ENABLED, 'true'); assert.equal(config.vars.EMAIL_TO, recipient)
const local = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8'))
const headers = { authorization: 'Bearer ' + local.RESEND_API_KEY }
let report
if (process.argv[2] === '--execute') {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  report = { scope: 'one-user-authorized-test-message-through-live-contact-api', recipient, name: 'NileLink test ' + randomUUID(), attemptedAt: new Date().toISOString(), status: 'attempt-recorded-no-automatic-resend' }
  await writeFile(file, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
  // One authorized message only. Existing receipts require --inspect, never another POST.
  const response = await fetch(origin + '/api/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ name: report.name, email: recipient, subject: 'Authorized NileLink deployment email test', message: 'This is the single email test authorized by the system owner. No customer or financial data is included.' }) })
  report.httpStatus = response.status; report.applicationAccepted = response.ok && (await response.json()).success === true
  report.status = report.applicationAccepted ? 'application-email-send-succeeded-provider-receipt-pending' : 'application-send-needs-review-no-automatic-resend'
  await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 })
} else if (process.argv[2] === '--inspect') report = JSON.parse(await readFile(file, 'utf8'))
else throw Error('Use --execute once, then --inspect for read-only provider status')
if (report.applicationAccepted) {
  if (!report.providerId) {
    const list = await fetch('https://api.resend.com/emails?limit=100', { headers, signal: AbortSignal.timeout(20000) })
    if (list.ok) {
      const rows = await list.json(), found = rows.data?.find(row => row.subject === 'New Contact Message from ' + report.name && row.to?.includes(recipient))
      if (found) report.providerId = found.id
    }
  }
  if (report.providerId) {
    const response = await fetch('https://api.resend.com/emails/' + encodeURIComponent(report.providerId), { headers, signal: AbortSignal.timeout(20000) })
    if (response.ok) { const receipt = await response.json(); report.lastEvent = receipt.last_event; report.status = receipt.last_event === 'delivered' ? 'provider-reports-delivered' : 'provider-accepted-delivery-status-' + String(receipt.last_event || 'unknown') }
  }
  report.checkedAt = new Date().toISOString(); await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 })
}
console.log(JSON.stringify({ file, status: report.status, applicationAccepted: report.applicationAccepted, httpStatus: report.httpStatus, providerId: report.providerId, lastEvent: report.lastEvent, recipient }))
if (!report.applicationAccepted) process.exitCode = 1

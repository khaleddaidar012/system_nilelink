import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const origin = 'https://nilelinklogistics.com'
const checks = []
for (const [url, file] of [['/favicon.ico?v=nilelink-20261025', 'app/favicon.ico'], ['/favicon-32.png?v=nilelink-20261025', 'public/favicon-32.png'], ['/apple-touch-icon.png?v=nilelink-20261025', 'public/apple-touch-icon.png']]) {
  const response = await fetch(origin + url, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200)
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  assert.equal(hash(new Uint8Array(await response.arrayBuffer())), hash(await readFile(file)))
  checks.push(url + ': deployed bytes match branded local asset')
}
for (const locale of ['en', 'ar', 'fr', 'de', 'it', 'zh', 'bg']) {
  const response = await fetch(origin + '/' + locale, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200)
  const html = await response.text(), messages = JSON.parse(await readFile('messages/' + locale + '.json', 'utf8'))
  assert.ok(html.includes(messages.contact.hqAddressStreet)); assert.ok(!html.includes('Awal Tareeq'))
  assert.ok(html.includes('/favicon.ico?v=nilelink-20261025'))
  if (locale === 'en') { assert.ok(html.includes('Land Freight')); assert.ok(!/Road Freight|road freight/.test(html)) }
  checks.push(locale + ': translated address and updated favicon metadata present')
}
const report = { status: 'passed', checkedAt: new Date().toISOString(), origin, checks, databaseModified: false }
await writeFile('.private/d1-migration/first-launch/brand-address-labels-validation.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

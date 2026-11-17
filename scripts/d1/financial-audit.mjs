import { createHash, randomUUID } from 'node:crypto'
import { realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateSnapshot, readRecords } from './snapshot.mjs'

/** Conservative decimal interpretation for auditing only. Never rounds source values. */
export function exactMinorUnits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Object.is(value, -0)) throw new Error('Unsupported monetary value')
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fractional = ''] = mantissa.split('.')
  const digits = BigInt(whole + fractional), scale = Number(exponent) - fractional.length + 2
  let units
  if (scale >= 0) units = digits * 10n ** BigInt(scale)
  else { const divisor = 10n ** BigInt(-scale); if (digits % divisor) throw new Error('Amount has more than two decimal places'); units = digits / divisor }
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds application precision')
  return units
}

export async function auditSnapshotFinances(directory) {
  const { manifest, files } = await validateSnapshot(directory)
  const tables = new Map(), issues = [], groups = new Map(), paymentsByInvoice = new Map()
  const add = (code, collection, id, field, severity = 'blocker') => issues.push({ code, collection, id, ...(field ? { field } : {}), severity })
  for (const collection of ['customers', 'invoices', 'payments', 'invoicesequences']) {
    const records = new Map(), entry = files.find(file => file.name === collection)
    if (entry) for await (const record of readRecords(entry.file)) {
      if (records.has(record.id)) add('DUPLICATE_IDENTITY', collection, record.id)
      records.set(record.id, record.document)
    }
    tables.set(collection, records)
  }
  const customers = tables.get('customers'), invoices = tables.get('invoices'), payments = tables.get('payments'), counters = tables.get('invoicesequences')
  const money = (value, collection, id, field) => { try { return exactMinorUnits(value) } catch { add('UNSUPPORTED_AMOUNT', collection, id, field); return null } }
  for (const payment of payments.values()) {
    const invoice = invoices.get(payment.invoiceId)
    if (!invoice) add('PAYMENT_INVOICE_MISSING', 'payments', payment._id)
    if (!customers.has(payment.customerId)) add('PAYMENT_CUSTOMER_MISSING', 'payments', payment._id)
    if (invoice && (invoice.customerId !== payment.customerId || invoice.currency !== payment.currency)) add('PAYMENT_RELATIONSHIP_MISMATCH', 'payments', payment._id)
    if (invoice && ['draft', 'cancelled'].includes(invoice.status)) add('PAYMENT_ON_UNPAYABLE_INVOICE', 'payments', payment._id)
    if (payment.status === 'cancelled') add('CANCELLED_PAYMENT_REQUIRES_REVERSAL_REVIEW', 'payments', payment._id)
    const amount = money(payment.amount, 'payments', payment._id, 'amount')
    const prior = paymentsByInvoice.get(payment.invoiceId) ?? { units: 0n, valid: true, records: 0 }
    prior.records++; if (amount === null) prior.valid = false; else prior.units += amount
    paymentsByInvoice.set(payment.invoiceId, prior)
  }
  const numbers = new Set(), maximumByYear = new Map()
  for (const invoice of invoices.values()) {
    if (invoice.customerId && !customers.has(invoice.customerId)) add('INVOICE_CUSTOMER_MISSING', 'invoices', invoice._id)
    if (!['EGP', 'USD', 'EUR'].includes(invoice.currency)) add('UNSUPPORTED_CURRENCY', 'invoices', invoice._id, 'currency')
    if (typeof invoice.invoiceNumber !== 'string' || !invoice.invoiceNumber || numbers.has(invoice.invoiceNumber)) add('INVALID_OR_DUPLICATE_INVOICE_NUMBER', 'invoices', invoice._id)
    numbers.add(invoice.invoiceNumber)
    const numeric = /^INV-(\d{4})-(\d+)$/.exec(invoice.invoiceNumber)
    if (numeric) { const value = BigInt(numeric[2]); if (value > (maximumByYear.get(numeric[1]) ?? 0n)) maximumByYear.set(numeric[1], value) }
    const total = money(invoice.totalAmount, 'invoices', invoice._id, 'totalAmount'), paid = money(invoice.paidAmount, 'invoices', invoice._id, 'paidAmount'), remaining = money(invoice.remainingAmount, 'invoices', invoice._id, 'remainingAmount')
    if (total !== null && paid !== null && remaining !== null && (paid > total || total - paid !== remaining)) add('INVOICE_BALANCE_MISMATCH', 'invoices', invoice._id)
    const recorded = paymentsByInvoice.get(invoice._id) ?? { units: 0n, valid: true, records: 0 }
    if (paid !== null && recorded.valid && recorded.units !== paid) add('PAYMENTS_DO_NOT_MATCH_PAID_BALANCE', 'invoices', invoice._id)
    if (['draft', 'cancelled'].includes(invoice.status) && (recorded.records || (paid !== null && paid !== 0n))) add('UNPAYABLE_INVOICE_HAS_CREDIT', 'invoices', invoice._id)
    if (invoice.status === 'paid' && remaining !== null && remaining !== 0n) add('PAID_STATUS_WITH_OUTSTANDING_BALANCE', 'invoices', invoice._id)
    const fields = ['subtotal', 'discount', 'additionalCharges', 'tax']
    const components = fields.map(field => money(invoice[field], 'invoices', invoice._id, field))
    if (components.every(value => value !== null) && total !== null) {
      const [subtotal, discount, charges, tax] = components
      if (discount > subtotal || subtotal - discount + charges + tax !== total) add('INVOICE_COMPONENTS_MISMATCH', 'invoices', invoice._id)
      if (!Array.isArray(invoice.items) || !invoice.items.length) add('INVOICE_ITEMS_MISSING', 'invoices', invoice._id)
      else {
        const lines = invoice.items.map((item, index) => money(item.total, 'invoices', invoice._id, `items/${index}/total`))
        if (lines.every(value => value !== null) && lines.reduce((sum, value) => sum + value, 0n) !== subtotal) add('LINE_TOTALS_DO_NOT_MATCH_SUBTOTAL', 'invoices', invoice._id)
      }
    }
    const key = JSON.stringify([invoice.customerId ?? null, invoice.currency ?? null, invoice.status ?? null])
    const group = groups.get(key) ?? { customerId: invoice.customerId ?? null, currency: invoice.currency ?? null, status: invoice.status ?? null, invoices: 0, totalMinor: 0n, paidMinor: 0n, remainingMinor: 0n, supported: true }
    group.invoices++
    if ([total, paid, remaining].includes(null)) group.supported = false
    else { group.totalMinor += total; group.paidMinor += paid; group.remainingMinor += remaining }
    groups.set(key, group)
  }
  const sequenceChecks = []
  for (const [year, maximum] of maximumByYear) {
    const counter = counters.get('INV_' + year)
    const valid = counter && Number.isSafeInteger(counter.seq) && counter.seq >= 0
    if (!valid || BigInt(counter.seq) < maximum) add('SEQUENCE_REQUIRES_MAXIMUM_RECONCILIATION', 'invoicesequences', 'INV_' + year, 'seq', 'warning')
    sequenceChecks.push({ year, maximumInvoiceSuffix: String(maximum), recordedCounter: valid ? String(counter.seq) : null })
  }
  for (const counter of counters.values()) if (!Number.isSafeInteger(counter.seq) || counter.seq < 0) add('UNSUPPORTED_SEQUENCE', 'invoicesequences', counter._id, 'seq')
  const final = await validateSnapshot(directory)
  if (JSON.stringify(final.manifest) !== JSON.stringify(manifest)) throw new Error('Source manifest changed during financial audit')
  return { formatVersion: 1, checkedAt: new Date().toISOString(), scope: 'read-only-source-financial-audit', sourceManifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    counts: { customers: customers.size, invoices: invoices.size, payments: payments.size, invoiceSequences: counters.size },
    groups: [...groups.values()].map(group => ({ ...group, totalMinor: group.supported ? String(group.totalMinor) : null, paidMinor: group.supported ? String(group.paidMinor) : null, remainingMinor: group.supported ? String(group.remainingMinor) : null })),
    sequenceChecks, issues, blockerCount: issues.filter(issue => issue.severity === 'blocker').length,
    historicalValuesRewritten: false, sourceModified: false, cutoverCertified: false,
    pending: ['per-record comparison with destination', 'tax and unit-price calculation parity', 'financial workflow tests on remote staging', 'source freeze consistency'] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv.includes('--help')) { console.log('node scripts/d1/financial-audit.mjs <snapshot-directory>'); process.exitCode = process.argv.includes('--help') ? 0 : 1 }
  else try {
    const directory = await realpath(process.argv[2]), report = await auditSnapshotFinances(directory), output = path.join(directory, `financial-audit-${randomUUID()}.json`)
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ report: output, ...report.counts, blockers: report.blockerCount, warnings: report.issues.length - report.blockerCount, cutoverCertified: false }))
    if (report.blockerCount) process.exitCode = 1
  } catch { console.error('Financial audit failed. Original source amounts were not changed.'); process.exitCode = 1 }
}

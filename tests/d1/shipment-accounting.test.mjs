import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { WorkflowStore, timestamped } from '../../lib/workflows/runtime.ts'
import { createD1WorkflowHandler } from '../../lib/workflows/d1-handlers.ts'
import { shipmentAccountingRoute } from '../../lib/shipments/accounting-route.ts'
import { minor, decimal, converted, totals, emptyAccounting, previewTotals, accountingDraft, customerInvoiceGroups } from '../../lib/shipments/accounting.ts'
import { shipmentInvoiceIndexes } from '../../lib/shipments/accounting-schema.mjs'
import { canAccessAccounts } from '../../lib/auth/accounts-access.ts'
import { requestInvoicesRoute } from '../../lib/shipments/request-invoices.ts'
import { workspaceActivity } from '../../lib/activity/workspace.ts'
import { formatInvoiceMoney } from '../../lib/shipments/money-display.ts'
import { GET as shipmentOptions } from '../../app/api/admin/shipments/route.ts'
import { GET as requestOptions } from '../../app/api/admin/shipment-invoices/request-options/route.ts'
import { shipmentOptionLabel } from '../../lib/shipments/accounting-options.ts'
import { PATCH as staffUpdate } from '../../app/api/admin/staff/[id]/route.ts'
import { NextRequest } from 'next/server'
import {serviceStages} from '../../lib/requests/tracking.ts'

let simulator, db, store, dispatch, invoice, admin, staff, customer, other, restricted
const id = n => n.toString(16).padStart(24, '0')
const shipmentId = randomUUID()
const oldEnv = { DATABASE_PROVIDER: process.env.DATABASE_PROVIDER, D1_MIGRATION_PREVIEW: process.env.D1_MIGRATION_PREVIEW, JWT_SECRET: process.env.JWT_SECRET }
const key = Symbol.for('__cloudflare-context__'), oldContext = globalThis[key]
async function insert(table, data) { await db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)`).bind(data._id, JSON.stringify(data)).run() }
async function actor(n, role, permissions = {}, customerId) {
  const user = timestamped({ _id: id(n), email: `${n}@example.test`, firstName: 'Accounting', lastName: 'Tester', status: 'active', role, customerId, staffPermissions: permissions })
  await insert('users', user)
  return `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: user._id, role, email: user.email })}`
}
function request(cookie, input, origin = 'http://localhost') {
  return new Request('http://localhost/api/admin/shipment-invoices', { method: input === undefined ? 'GET' : 'POST',
    headers: { cookie: cookie || '', origin, 'content-type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
}
const call = (action, cookie = admin, input, invoiceId = invoice?.id) => shipmentAccountingRoute(request(cookie, input), `shipment-invoice-${action}`, invoiceId)
async function value(res, status = 200) { assert.equal(res.status, status, await res.clone().text()); return res.json() }
function input(view, complete = false) {
  const draft = structuredClone(view.draft)
  delete draft.internalSellingPrice
  for (const stage of Object.values(draft.stages)) {
    stage.completed = complete
    stage.costs = stage.costs.map(({ createdAt, createdBy, updatedAt, updatedBy, ...cost }) => cost)
  }
  return { revision: view.revision, ...draft }
}
before(async () => {
  Object.assign(process.env, { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', JWT_SECRET: 'shipment-accounting-local-test-only' })
  simulator = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'accounting' }, d1Persist: false })
  db = await simulator.getD1Database('DB')
  await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  globalThis[key] = { env: { DB: db }, cf: {}, ctx: {} }
  store = new WorkflowStore(db); dispatch = createD1WorkflowHandler(db)
  for (const n of [1, 2]) await insert('customers', timestamped({ _id: id(n), companyName: `Registered ${n}`, commercialRegisterNumber: `CR${n}` }))
  for (const n of [20, 21, 22]) await insert('customer_requests', timestamped({ _id: id(n), customerId: id(n === 22 ? 2 : 1), trackingNumber: `REQ-${n}`, services: [], status: 'submitted' }))
  admin = await actor(3, 'super_admin')
  staff = await actor(4, 'staff', { canAccessAccounts: true, createInvoice: true, editInvoice: true })
  restricted = await actor(5, 'staff')
  customer = await actor(6, 'customer_admin', {}, id(1)); other = await actor(7, 'customer_admin', {}, id(2))
  await db.prepare(`INSERT INTO shipment_records(id,shipment_date,booking,number_46,shipping_line,container_count,container_size,export_invoice,broker,shipper,port_of_loading,port_of_discharge,item_name,hs_code,updated_by)
    VALUES(?,'2026-11-01','BOOK-EXISTING','','',1,'','','','Registered 1','Damietta','Casablanca','','',?)`).bind(shipmentId, id(3)).run()
})
after(async () => {
  await simulator?.dispose()
  if (oldContext === undefined) delete globalThis[key]; else globalThis[key] = oldContext
  for (const [k, v] of Object.entries(oldEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
})
test('decimal accounting rejects ambiguous inputs, converts line amounts exactly and supports negative profit', () => {
  assert.equal(formatInvoiceMoney('11000','EGP','en-GB'),'11,000.00 EGP')
  assert.equal(formatInvoiceMoney('12.5','USD','en-GB'),'12.50 USD')
  assert.equal(formatInvoiceMoney('12.5','EUR','en-GB'),'12.50 EUR')
  assert.equal(decimal(minor('0.10') + minor('0.20')), '0.30')
  assert.equal(decimal(converted({ amount: '0.01', currency: 'USD', exchangeRate: '1.5' }, 'EGP')), '0.02')
  assert.throws(() => minor('1e3')); assert.throws(() => minor('0.001')); assert.throws(() => minor('-1'))
  assert.throws(() => converted({ amount: '1', currency: 'EGP', exchangeRate: '2' }, 'EGP'))
  assert.throws(() => converted({ amount: '9999999999.99', currency: 'USD', exchangeRate: '100' }, 'EGP'))
  const draft = emptyAccounting().draft
  draft.stages.shipping.costs.push({ amount: '0.30', currency: 'EGP', exchangeRate: '1' })
  assert.equal(totals(draft, 'EGP').expectedProfit, '-0.30')
})
test('one customer selling price determines the invoice and profit, ignoring legacy independent totals', () => {
  const draft=emptyAccounting().draft
  draft.internalSellingPrice='15000.00'
  draft.stages.shipping.costs=[{amount:'10000.00',currency:'EGP',exchangeRate:'1'}]
  draft.customerItems=[{description:'Obsolete independent price',amount:'20000.00'}]
  assert.equal(totals(draft,'EGP').totalCosts,'10000.00')
  assert.equal(totals(draft,'EGP').customerTotal,'15000.00')
  assert.equal(totals(draft,'EGP').expectedProfit,'5000.00')
})

test('customer breakdown groups recorded lines, rounds conversion once and omits internal metadata', () => {
  const draft = emptyAccounting().draft
  draft.stages.shipping.costs = [{description:'Freight',amount:'10.01',currency:'USD',exchangeRate:'50.12345678',notes:'Private',createdBy:'staff-id'}]
  draft.stages.transportation.costs = [{description:'Truck',amount:'100',currency:'EGP',exchangeRate:'1'}, {description:'Loading',amount:'25.50',currency:'EGP',exchangeRate:'1'}]
  const groups = customerInvoiceGroups(draft,'EGP')
  assert.deepEqual(groups, [
    {stage:'shipping',items:[{description:'Freight',amount:'501.74'}],total:'501.74'},
    {stage:'transportation',items:[{description:'Truck',amount:'100.00'},{description:'Loading',amount:'25.50'}],total:'125.50'},
  ])
  assert.ok(!JSON.stringify(groups).includes('Private'))
  assert.ok(!JSON.stringify(groups).includes('staff-id'))
})
test('empty new rows do not freeze live totals, and publication history remains immutable', () => {
  const accounting=emptyAccounting()
  accounting.draft.internalSellingPrice='11000.00'
  accounting.draft.stages.shipping.costs=[{amount:'5000',currency:'EGP',exchangeRate:'1'},{amount:'',currency:'EGP',exchangeRate:'1'}]
  assert.equal(previewTotals(accounting.draft,'EGP').totalCosts,'5000.00')
  assert.equal(previewTotals(accounting.draft,'EGP').expectedProfit,'6000.00')
  assert.throws(()=>totals(accounting.draft,'EGP'))
  accounting.publications=[{version:1,total:'12500.00'}]
  assert.equal(accountingDraft(accounting).internalSellingPrice,'12500.00')
  assert.equal(accounting.draft.internalSellingPrice,'11000.00')
  assert.equal(accounting.publications[0].total,'12500.00')
})
test('accounts access defaults to the named staff and all active administrators; explicit staff choices win', () => {
  for (const email of ['mohamedzanaty@staff.nilelink.invalid','mahmoudzanaty@staff.nilelink.invalid']) {
    assert.equal(canAccessAccounts({email,role:'staff',status:'active'}),true)
    assert.equal(canAccessAccounts({email,role:'staff',staffPermissions:{canAccessAccounts:false}}),false)
  }
  assert.equal(canAccessAccounts({email:'admin@example.test',role:'super_admin',staffPermissions:{canAccessAccounts:false}}),true)
  assert.equal(canAccessAccounts({email:'other@example.test',role:'staff'}),false)
  assert.equal(canAccessAccounts({email:'other@example.test',role:'staff',staffPermissions:{canAccessAccounts:true}}),true)
  assert.equal(canAccessAccounts({email:'client@example.test',role:'customer',staffPermissions:{canAccessAccounts:true}}),false)
  assert.equal(canAccessAccounts({email:'admin@example.test',role:'super_admin',status:'suspended'}),false)
})
test('accounts-only employees can select a shipment without access to its operational details', async () => {
  const response=await shipmentOptions(new NextRequest('http://localhost/api/admin/shipments?forAccounting=1&id='+shipmentId,{headers:{cookie:staff}}))
  const data=await value(response)
  assert.equal(data.records.length,1)
  assert.deepEqual(Object.keys(data.records[0]).sort(),['booking','customerCode','customerId','customerName','id','requestId','requestNumber','shipper'])
  assert.equal(data.records[0].requestNumber,null)
  assert.equal((await shipmentOptions(new NextRequest('http://localhost/api/admin/shipments',{headers:{cookie:staff}}))).status,403)
})

test('invoice request picker is scoped to the selected customer and exposes only bounded option fields', async () => {
  const endpoint='http://localhost/api/admin/shipment-invoices/request-options?customerId='+id(1)
  assert.equal((await requestOptions(new Request(endpoint,{headers:{cookie:customer}}))).status,403)
  assert.equal((await requestOptions(new Request(endpoint,{headers:{cookie:restricted}}))).status,403)
  const options=await value(await requestOptions(new Request(endpoint,{headers:{cookie:staff}})))
  assert.deepEqual(options.requests.map(row=>row.id).sort(),[id(20),id(21)])
  for(const option of options.requests)assert.deepEqual(Object.keys(option).sort(),['id','subject','trackingNumber'])
  const other=await value(await requestOptions(new Request(endpoint.replace(id(1),id(2)),{headers:{cookie:staff}})))
  assert.deepEqual(other.requests.map(row=>row.id),[id(22)])
  const searched=await value(await requestOptions(new Request(endpoint+'&q=REQ-20',{headers:{cookie:staff}})))
  assert.deepEqual(searched.requests.map(row=>row.id),[id(20)])
  assert.equal((await requestOptions(new Request(endpoint.replace(id(1),'bad'),{headers:{cookie:staff}}))).status,400)
})

test('shipment option labels preserve carrier bookings and never infer a customer reference from shipper names', () => {
  const shipment={id:shipmentId,booking:'31649372',shipper:'Registered 1'}
  assert.match(shipmentOptionLabel(shipment,true),/بدون طلب مرتبط/)
  assert.ok(!shipmentOptionLabel(shipment,true).includes('NL2026'))
  const linked={...shipment,requestNumber:'NL20260001-2',customerCode:'NL20260001'}
  assert.match(shipmentOptionLabel(linked,true),/NL20260001-2/)
  assert.match(shipmentOptionLabel(linked,false),/Booking: 31649372/)
})
test('reviewed backup index matches the actual migration', async () => {
  const normalize = sql => sql.replace(/\s+/g, ' ').trim()
  const migrations = await readD1MigrationStatements()
  for (const index of shipmentInvoiceIndexes) assert.ok(migrations.some(sql => normalize(sql) === normalize(index)))
})
test('creation requires existing shipment, registered customer, role permission and correct origin', async () => {
  const data = { shipmentId, customerId: id(1), currency: 'EGP' }
  assert.equal((await call('create', restricted, data)).status, 403)
  assert.equal((await call('create', customer, data)).status, 403)
  assert.equal((await shipmentAccountingRoute(request(admin, data, 'https://other.test'), 'shipment-invoice-create')).status, 403)
  assert.equal((await call('create', admin, { ...data, shipmentId: randomUUID() })).status, 404)
  assert.equal((await call('create', admin, { ...data, dueDate: 'not-a-date' })).status, 400)
  assert.equal((await call('create', admin, { ...data, dueDate: '0000-01-01' })).status, 400)
  invoice = (await value(await call('create', admin, data), 201)).invoice
  assert.equal((await store.read('invoices', invoice.id)).data.dueDate, null)
  assert.equal(invoice.status, 'draft')
  assert.equal(invoice.draft.customerItems.length, 0)
  const retry = await value(await call('create', admin, data))
  assert.equal(retry.invoice.id, invoice.id)
  assert.equal((await call('create', admin, { ...data, customerId: id(2) })).status, 409)
  const duplicate = { ...(await store.read('invoices', invoice.id)).data, _id: id(99), invoiceNumber: 'DUPLICATE', token: 'different' }
  await assert.rejects(insert('invoices', duplicate), /UNIQUE/)
})
test('request linking validates tenant, permission and existing relationships and hides drafts from portal', async () => {
  const link = (parent, cookie=admin) => requestInvoicesRoute(request(cookie, {invoiceId:invoice.id}), id(parent))
  assert.equal((await link(20, restricted)).status,403)
  assert.equal((await link(22)).status,409)
  await value(await link(20))
  const revision = (await store.read('invoices',invoice.id)).revision
  await value(await link(20))
  assert.equal((await store.read('invoices',invoice.id)).revision,revision)
  assert.equal((await link(21)).status,409)
  const linked = await value(await requestInvoicesRoute(request(admin),id(20)))
  assert.equal(linked.invoices[0].id,invoice.id)
  assert.ok(!JSON.stringify(linked).includes('internalSellingPrice'))
  assert.equal((await value(await requestInvoicesRoute(request(customer),id(20),true))).invoices.length,0)
  assert.equal((await requestInvoicesRoute(request(other),id(20),true)).status,404)
  invoice = (await value(await call('detail'))).invoice
})

test('creating from a request links the new draft atomically and does not duplicate its base invoice', async () => {
  const newShipmentId=randomUUID()
  await db.prepare(`INSERT INTO shipment_records(id,shipment_date,booking,number_46,shipping_line,container_count,container_size,export_invoice,broker,shipper,port_of_loading,port_of_discharge,item_name,hs_code,updated_by)
    VALUES(?,'2026-11-01','BOOK-REQUEST','','',1,'','','','Registered 1','Damietta','Casablanca','','',?)`).bind(newShipmentId,id(3)).run()
  const create={shipmentId:newShipmentId,customerId:id(1),currency:'EGP',requestId:id(22)}
  assert.equal((await call('create',admin,create)).status,409)
  create.requestId=id(21)
  const created=(await value(await call('create',admin,create),201)).invoice
  assert.equal(created.relatedRequestId,id(21))
  assert.equal((await store.read('invoices',created.id)).data.relatedRequestId,id(21))
  const optionsUrl='http://localhost/api/admin/shipments?forAccounting=1&id='+newShipmentId
  const option=(await value(await shipmentOptions(new NextRequest(optionsUrl,{headers:{cookie:staff}})))).records[0]
  assert.equal(option.requestNumber,'REQ-21')
  assert.equal(option.customerId,id(1))
  assert.match(option.customerCode,/^NL\d{8,}$/)
  const otherCustomer=await value(await shipmentOptions(new NextRequest(optionsUrl+'&customerId='+id(2),{headers:{cookie:staff}})))
  assert.equal(otherCustomer.records.length,0)
  const otherRequest=await value(await shipmentOptions(new NextRequest(optionsUrl+'&requestId='+id(20),{headers:{cookie:staff}})))
  assert.equal(otherRequest.records.length,0)
  const searched=await value(await shipmentOptions(new NextRequest(optionsUrl+'&q='+option.customerCode,{headers:{cookie:staff}})))
  assert.equal(searched.records.length,1)
  assert.equal((await value(await call('create',admin,create))).invoice.id,created.id)
  assert.equal((await value(await requestInvoicesRoute(request(customer),id(21),true))).invoices.length,0)
  const secondShipmentId=randomUUID()
  await db.prepare(`INSERT INTO shipment_records(id,shipment_date,booking,number_46,shipping_line,container_count,container_size,export_invoice,broker,shipper,port_of_loading,port_of_discharge,item_name,hs_code,updated_by)
    VALUES(?,'2026-11-01','BOOK-REQUEST-REPLACEMENT','','',1,'','','','Registered 1','Damietta','Casablanca','','',?)`).bind(secondShipmentId,id(3)).run()
  const replacement=(await value(await call('create',admin,{...create,shipmentId:secondShipmentId}),201)).invoice
  assert.equal((await store.read('invoices',created.id)).data.relatedRequestId,null)
  assert.equal((await store.list('invoices','relatedRequestId=?',[id(21)])).length,1)
  assert.equal((await store.read('invoices',replacement.id)).data.relatedRequestId,id(21))
})

test('replacement is atomic, idempotent, concurrency-safe and preserves the previous financial document', async () => {
  const original = await store.read('invoices', invoice.id)
  const preserved = data => { const copy=structuredClone(data);delete copy.relatedRequestId;delete copy.updatedAt;return copy }
  for (const number of [90,91]) {
    const data={...structuredClone(original.data),_id:id(number),invoiceNumber:`REPLACE-${number}`,token:randomUUID(),shipmentRecordId:null,relatedRequestId:null}
    await insert('invoices',data)
  }
  const link = target => requestInvoicesRoute(request(admin,{invoiceId:target}),id(20))
  await value(await link(id(90)))
  assert.deepEqual(preserved((await store.read('invoices',invoice.id)).data),preserved(original.data))
  assert.equal((await store.read('invoices',invoice.id)).data.relatedRequestId,null)
  assert.equal((await store.list('invoices','relatedRequestId=?',[id(20)])).length,1)
  const count=(await store.list('invoice_activity_logs')).length
  await value(await link(id(90)))
  assert.equal((await store.list('invoice_activity_logs')).length,count)
  const duplicate={...(await store.read('invoices',id(91))).data,_id:id(92),token:randomUUID(),relatedRequestId:id(20),invoiceNumber:'DUPLICATE-REQUEST'}
  await assert.rejects(insert('invoices',duplicate),/UNIQUE/)
  await db.exec(`CREATE TRIGGER test_request_link_failure BEFORE INSERT ON invoice_activity_logs WHEN json_extract(NEW.data,'$.action')='invoice_request_linked' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;`)
  assert.equal((await link(id(91))).status,500)
  assert.equal((await store.read('invoices',id(90))).data.relatedRequestId,id(20))
  assert.equal((await store.read('invoices',id(91))).data.relatedRequestId,null)
  await db.exec('DROP TRIGGER test_request_link_failure')
  await value(await link(invoice.id))
  const results=await Promise.all([link(id(90)),link(id(91))])
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409])
  assert.equal((await store.list('invoices','relatedRequestId=?',[id(20)])).length,1)
  await value(await link(invoice.id))
  invoice=(await value(await call('detail'))).invoice
})

test('server recalculates costs, preserves authors, blocks forged money and stale writes', async () => {
  const data = input(invoice)
  data.sellingPrice = '1000.00'
  data.stages.shipping.costs = [{ id: randomUUID(), description: 'Freight', amount: '10.01', currency: 'USD', exchangeRate: '50.12345678', notes: 'Rate recorded manually' }]
  data.customerItems = [{ description: 'Freight service', amount: '900.10' }, { description: 'Documentation', amount: '0.20' }]
  const forged = structuredClone(data); forged.stages.shipping.costs[0].createdBy = 'forged'
  assert.equal((await call('save', admin, forged)).status, 400)
  const results = await Promise.all([call('save', admin, data), call('save', admin, data)])
  assert.deepEqual(results.map(res => res.status).sort(), [200, 409])
  invoice = (await value(await call('detail'))).invoice
  assert.equal(invoice.totals.totalCosts, '501.74')
  assert.equal(invoice.totals.expectedProfit, '498.26')
  assert.equal(invoice.totals.customerTotal, '1000.00')
  assert.equal(invoice.draft.stages.shipping.costs[0].createdBy, id(3))
  const staffView = (await value(await call('detail', staff))).invoice
  assert.equal(staffView.draft.internalSellingPrice, undefined)
  assert.equal(staffView.totals.expectedProfit, undefined)
  const denied = input(staffView); denied.internalSellingPrice = '1.00'
  assert.equal((await call('save', staff, denied)).status, 403)
  const edit = input(staffView); edit.stages.shipping.costs[0].notes = 'Staff update'
  await value(await call('save', staff, edit))
  invoice = (await value(await call('detail'))).invoice
  assert.equal(invoice.draft.sellingPrice, '1000.00')
  assert.equal(invoice.draft.stages.shipping.costs[0].createdBy, id(3))
  assert.equal(invoice.draft.stages.shipping.costs[0].updatedBy, id(4))
})
test('drafts stay invisible and legacy endpoints cannot disclose or bypass internal accounting', async () => {
  const raw = (await store.read('invoices', invoice.id)).data
  const portal = await value(await dispatch({ action: 'portal-financials', request: request(customer) }))
  assert.equal(portal.invoices.length, 0)
  assert.equal((await dispatch({ action: 'public-invoice', id: raw.token, request: request(customer) })).status, 404)
  const legacy = await value(await dispatch({ action: 'invoice-detail', id: invoice.id, request: request(staff) }))
  const serialized = JSON.stringify(legacy)
  assert.ok(!serialized.includes('internalSellingPrice'))
  assert.ok(!serialized.includes('expectedProfit'))
  assert.ok(!serialized.includes('501.74'))
  assert.equal((await dispatch({ action: 'invoice-confirm', id: invoice.id, request: request(admin, {}) })).status, 409)
  assert.equal((await call('publish', staff, { revision: invoice.revision })).status, 403)
  assert.equal((await call('preview', admin, { revision: invoice.revision })).status, 409)
})
test('publishing requires saved preview confirmation and creates immutable client-only snapshot', async () => {
  for (const selectedStage of ['shipping', 'transportation', 'customs']) {
    const singleStage = input(invoice)
    singleStage.stages[selectedStage].completed = true
    invoice = (await value(await call('save', admin, singleStage))).invoice
    assert.equal(Object.values(invoice.draft.stages).filter(stage => stage.completed).length, 1)
    await value(await call('preview', admin, { revision: invoice.revision }))
  }
  let preview = await value(await call('preview', admin, { revision: invoice.revision }))
  assert.equal(preview.snapshot.total, '1000.00')
  assert.deepEqual(preview.snapshot.groups, [{stage:'shipping',items:[{description:'Freight',amount:'501.74'}],total:'501.74'}])
  assert.ok(!JSON.stringify(preview).includes('internalSellingPrice'))
  assert.equal((await call('publish', admin, { revision: invoice.revision })).status, 409)
  const previous = preview
  const customsOnly = input(invoice); customsOnly.stages.customs.completed = true
  invoice = (await value(await call('save', admin, customsOnly))).invoice
  assert.equal((await call('publish', admin, { revision: previous.revision, previewKey: previous.previewKey })).status, 409)
  preview = await value(await call('preview', admin, { revision: invoice.revision }))
  invoice = (await value(await call('publish', admin, { revision: preview.revision, previewKey: preview.previewKey }))).invoice
  assert.equal(invoice.status, 'published')
  const requestView = await value(await requestInvoicesRoute(request(customer),id(20),true))
  assert.equal(requestView.invoices.length,1)
  assert.equal(requestView.invoices[0].id,invoice.id)
  assert.equal(requestView.invoices[0].total,'1000.00')
  assert.ok(!JSON.stringify(requestView).includes('expectedProfit'))
  assert.ok(!JSON.stringify(requestView).includes('stages'))
  const clientRequests=await value(await dispatch({action:'requests-list',request:request(customer)}))
  assert.equal(clientRequests.requests.find(row=>row._id===id(20)).publishedInvoice.id,invoice.id)
  assert.equal(clientRequests.requests.find(row=>row._id===id(21)).publishedInvoice,null)
  assert.equal(invoice.publications[0].publishedBy, id(3))
  const raw = (await store.read('invoices', invoice.id)).data
  const visible = await value(await dispatch({ action: 'public-invoice', id: raw.token, request: request(customer) }))
  assert.equal(visible.invoice.totalAmount, 1000)
  assert.equal(visible.invoice.items.length, 1)
  assert.equal(visible.invoice.items[0].total, 1000)
  assert.deepEqual(visible.invoice.groups, preview.snapshot.groups)
  assert.ok(!JSON.stringify(visible.invoice.groups).includes('Staff update'))
  assert.ok(!JSON.stringify(visible).includes('internalSellingPrice'))
  assert.ok(!JSON.stringify(visible).includes('exchangeRate'))
  assert.ok(!JSON.stringify(visible).includes('shipmentAccounting'))
  assert.equal((await dispatch({ action: 'public-invoice', id: raw.token, request: request(other) })).status, 404)
  assert.equal((await dispatch({ action: 'public-invoice', id: raw.token, request: request() })).status, 401)
  assert.equal((await call('save', admin, input(invoice, true))).status, 409)
  assert.equal((await call('publish', admin, { revision: invoice.revision, previewKey: preview.previewKey })).status, 409)
})
test('explicit revision preserves previous publication until a new preview is published', async () => {
  const oldSnapshot = structuredClone(invoice.publications[0])
  invoice = (await value(await call('revise', admin, { revision: invoice.revision, reason: 'Customer requested additional service' }))).invoice
  assert.equal(invoice.pendingRevision, true)
  const data = input(invoice, true); data.sellingPrice = '1100.00'
  invoice = (await value(await call('save', admin, data))).invoice
  const raw = (await store.read('invoices', invoice.id)).data
  const beforePublish = await value(await dispatch({ action: 'public-invoice', id: raw.token, request: request(customer) }))
  assert.equal(beforePublish.invoice.totalAmount, 1000)
  const preview = await value(await call('preview', admin, { revision: invoice.revision }))
  invoice = (await value(await call('publish', admin, { revision: preview.revision, previewKey: preview.previewKey }))).invoice
  assert.equal(invoice.publications.length, 2)
  assert.deepEqual(invoice.publications[0], oldSnapshot)
  assert.equal(invoice.publications[1].total, '1100.00')
  const audit = (await value(await call('detail'))).audit
  assert.ok(audit.some(log => log.action === 'shipment_revision_started'))
  assert.ok(audit.some(log => log.action === 'shipment_invoice_published'))
})
test('recorded payments prevent a revision and revoked database permissions override a stale token', async () => {
  const payment = await dispatch({ action: 'payment-record', request: new Request('http://localhost/api/admin/payments', {
    method: 'POST', headers: { cookie: admin, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ customerId: id(1), invoiceId: invoice.id, amount: 1, currency: 'EGP' }),
  }) })
  await value(payment, 201)
  invoice = (await value(await call('detail'))).invoice
  assert.equal((await call('revise', admin, { revision: invoice.revision, reason: 'Attempt after payment' })).status, 409)
  const user = await store.read('users', id(4))
  await store.commit({ updates: [{ before: user, patch: { staffPermissions: { canAccessAccounts: false, editInvoice: true } } }] })
  assert.equal((await call('list', staff)).status, 403)
})
test('the staff permission API persists accounts grants and revocations independently', async () => {
  for (const enabled of [true,false]) {
    const response=await staffUpdate(new NextRequest('http://localhost/api/admin/staff/'+id(4),{method:'PATCH',headers:{cookie:admin,'content-type':'application/json'},body:JSON.stringify({staffPermissions:{canAccessAccounts:enabled}})}),{params:Promise.resolve({id:id(4)})})
    await value(response)
    assert.equal((await store.read('users',id(4))).data.staffPermissions.canAccessAccounts,enabled)
    assert.equal((await call('list',staff)).status,enabled?200:403)
  }
})

test('direct non-customs processing is optional for assigned staff while historical quote decisions stay protected', async () => {
  await insert('customer_requests',timestamped({_id:id(40),customerId:id(1),trackingNumber:'DIRECT-TEST',services:[],status:'quote_provided',operationType:'import',assignedStaffId:id(4),complianceType:null,complianceNumber:''}))
  await insert('quotes',timestamped({_id:id(42),requestId:id(40),customerId:id(1),quoteNumber:'HISTORICAL-QUOTE',status:'sent',currency:'EGP',validUntil:'2099-01-01'}))
  const history=(await store.read('quotes',id(42))).data
  const workflow=(cookie,data)=>dispatch({action:'admin-request-workflow',id:id(40),request:request(cookie,data)})
  let settings=await value(await workflow(admin))
  assert.equal(settings.quoteRequired,true)
  assert.equal((await workflow(restricted,{quoteRequired:false,revision:settings.revision})).status,403)
  assert.equal((await workflow(customer,{quoteRequired:false,revision:settings.revision})).status,403)
  await value(await workflow(staff,{quoteRequired:false,revision:settings.revision}))
  assert.equal((await store.read('customer_requests',id(40))).data.quoteRequired,false)
  assert.equal((await store.read('customer_requests',id(40))).data.status,'submitted')
  assert.deepEqual((await store.read('quotes',id(42))).data,history)
  assert.equal((await workflow(admin,{quoteRequired:true,revision:settings.revision})).status,409)
  assert.equal((await dispatch({action:'admin-request-confirm',id:id(40),request:request(admin,{})})).status,200)
  assert.equal((await dispatch({action:'quote-accept',id:id(42),request:request(customer,{})})).status,409)
  await value(await dispatch({action:'admin-request-compliance',id:id(40),request:request(admin,{complianceType:'ACID',complianceNumber:'TEST-COMPLIANCE-ONLY'})}))
  assert.equal((await dispatch({action:'admin-request-confirm',id:id(40),request:request(staff,{})})).status,409)
  assert.equal((await store.read('customer_requests',id(40))).data.status,'processing')
  settings=await value(await workflow(admin))
  assert.equal((await workflow(admin,{quoteRequired:true,revision:settings.revision})).status,409)
  await insert('customer_requests',timestamped({_id:id(41),customerId:id(1),trackingNumber:'LEGACY-QUOTED',services:[],status:'submitted',operationType:'none'}))
  assert.equal((await dispatch({action:'admin-request-confirm',id:id(41),request:request(admin,{})})).status,409)
})

test('service progress requires completed execution stages and preserves scoped, audited corrections', async () => {
  for(const n of [50,51])await insert('request_services',timestamped({_id:id(n),requestId:id(40),serviceKey:n===50?'inland_transportation':'customs_clearance',status:'pending',details:{},timeline:[]}))
  const parent=await store.read('customer_requests',id(40))
  await store.commit({updates:[{before:parent,patch:{services:[id(50),id(51)]}}]})
  async function update(n,status,cookie=staff,comment='Customer-visible progress'){
    const row=await store.read('request_services',id(n))
    return dispatch({action:'service-status',id:id(n),request:request(cookie,{status,revision:row.revision,comment})})
  }
  assert.equal((await update(50,'active',restricted)).status,403)
  assert.equal((await update(50,'active',customer)).status,403)
  assert.equal((await update(50,'arbitrary-status')).status,400)
  assert.equal((await update(50,'completed')).status,409)
  await value(await update(50,'active'))
  async function completeStages(n) {
    const initial=await store.read('request_services',id(n))
    for(const stage of serviceStages(initial.data)) {
      const current=await store.read('request_services',id(n))
      await value(await dispatch({action:'admin-request-tracking',id:id(40),request:request(staff,{serviceId:id(n),stageKey:stage.stageKey,status:'completed',revision:current.revision,staffNote:'Completed fixture stage'})}))
    }
  }
  await completeStages(50)
  await value(await update(50,'completed'))
  assert.equal((await store.read('customer_requests',id(40))).data.status,'processing')
  await value(await update(51,'active'))
  const stale=(await store.read('request_services',id(51))).revision
  await value(await dispatch({action:'admin-request-compliance',id:id(40),request:request(admin,{complianceType:'UCR',complianceNumber:'TEST-UCR-STAGES'})}))
  await completeStages(51)
  await value(await update(51,'completed'))
  assert.equal((await store.read('customer_requests',id(40))).data.status,'completed')
  assert.equal((await update(51,'active',staff,'Please reopen')).status,403)
  assert.equal((await update(51,'active',admin,'')).status,403)
  await value(await update(51,'active',admin,'Corrected operational status'))
  assert.equal((await store.read('customer_requests',id(40))).data.status,'processing')
  assert.equal((await dispatch({action:'service-status',id:id(51),request:request(admin,{status:'completed',revision:stale,comment:'Stale update'})})).status,409)
  const notes=await store.list('notifications','recipientCustomerId=?',[id(1)])
  assert.ok(notes.some(row=>row.data.relatedRequestId===id(40)&&row.data.actionUrl==='/portal/requests/'+id(40)))
})

test('invoice assignment notifications are published-only, tenant scoped and idempotent',async()=>{
  const count=async()=> (await store.list('notifications',"json_extract(data,'$.type')='invoice_assigned'")).length
  const before=await count()
  await value(await requestInvoicesRoute(request(admin,{invoiceId:id(90)}),id(20)))
  assert.equal(await count(),before)
  await value(await requestInvoicesRoute(request(admin,{invoiceId:invoice.id}),id(20)))
  assert.equal(await count(),before+1)
  await value(await requestInvoicesRoute(request(admin,{invoiceId:invoice.id}),id(20)))
  assert.equal(await count(),before+1)
  const visible=await value(await dispatch({action:'portal-notifications',request:request(customer)}))
  assert.ok(visible.notifications.some(row=>row.type==='invoice_assigned'&&row.relatedInvoiceId===invoice.id))
  assert.ok(!visible.notifications.some(row=>row.requiredPermission==='accounts'))
  const foreign=await value(await dispatch({action:'portal-notifications',request:request(other)}))
  assert.ok(!foreign.notifications.some(row=>row.relatedInvoiceId===invoice.id))
})

test('accounts reading markers preserve concurrent arrivals and isolate readers and permissions',async()=>{
  const user=await store.read('users',id(4))
  await store.commit({updates:[{before:user,patch:{staffPermissions:{canAccessAccounts:true}}}]})
  const callWorkspace=(cookie,input)=>workspaceActivity(db,new Request('http://localhost/api/admin/workspace-activity?section=shipment-invoices',{
    method:input?'POST':'GET',headers:{cookie,origin:'http://localhost','content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})
  }))
  const first=await value(await callWorkspace(admin))
  assert.ok(first.count>0)
  const staffBefore=await value(await callWorkspace(staff))
  const add=async meaningfulChange=>insert('invoice_activity_logs',timestamped({invoiceId:invoice.id,action:'shipment_draft_saved',actorName:'Test operator',meaningfulChange,newState:{profit:'DO-NOT-EXPOSE'}}))
  await add(true)
  await value(await callWorkspace(admin,{section:'shipment-invoices',through:first.through}))
  const next=await value(await callWorkspace(admin))
  assert.equal(next.count,1)
  assert.ok(!JSON.stringify(next).includes('DO-NOT-EXPOSE'))
  assert.equal((await value(await callWorkspace(staff))).count,staffBefore.count+1)
  assert.equal((await callWorkspace(admin,{section:'shipment-invoices',through:next.through+1000})).status,400)
  await value(await callWorkspace(admin,{section:'shipment-invoices',through:next.through}))
  await add(false)
  assert.equal((await value(await callWorkspace(admin))).count,0)
  const revoke=await store.read('users',id(4))
  await store.commit({updates:[{before:revoke,patch:{staffPermissions:{canAccessAccounts:false}}}]})
  assert.equal((await callWorkspace(staff)).status,403)
  const notices=await value(await dispatch({action:'admin-notifications',request:request(staff)}))
  assert.ok(!notices.notifications.some(row=>row.requiredPermission==='accounts'))
})

test('export confirmation permits pending UCR while the customs stage requires it and responsibility remains scoped',async()=>{
  await insert('customer_requests',timestamped({_id:id(43),customerId:id(1),trackingNumber:'EXPORT-DIRECT',services:[id(143)],status:'submitted',operationType:'export',quoteRequired:false,assignedStaffId:id(4),complianceNumber:''}))
  await insert('request_services',timestamped({_id:id(143),requestId:id(43),serviceKey:'customs_clearance',status:'pending'}))
  const confirm=cookie=>dispatch({action:'admin-request-confirm',id:id(43),request:request(cookie,{})})
  await value(await confirm(staff))
  const finishUcr=async()=>{
    const service=await store.read('request_services',id(143))
    return dispatch({action:'admin-request-tracking',id:id(43),request:request(staff,{serviceId:service.id,stageKey:serviceStages(service.data)[0].stageKey,status:'completed',revision:service.revision,staffNote:'UCR stage fixture'})})
  }
  assert.equal((await finishUcr()).status,409)
  await value(await dispatch({action:'admin-request-compliance',id:id(43),request:request(admin,{complianceType:'ACID',complianceNumber:'TEST-ONLY'})}))
  assert.equal((await confirm(staff)).status,409) // It is already processing; confirmation is not repeated.
  await value(await dispatch({action:'admin-request-compliance',id:id(43),request:request(admin,{complianceType:'UCR',complianceNumber:'TEST-UCR-ONLY'})}))
  await value(await finishUcr())
  const row=await store.read('customer_requests',id(43))
  assert.equal((await dispatch({action:'admin-request-workflow',id:id(43),request:request(staff,{assignedStaffId:id(5),revision:row.revision})})).status,403)
  await value(await dispatch({action:'admin-request-workflow',id:id(43),request:request(admin,{assignedStaffId:id(5),revision:row.revision})}))
  assert.equal((await confirm(staff)).status,403)
  const nextService=await store.read('request_services',id(143))
  await value(await dispatch({action:'admin-request-tracking',id:id(43),request:request(restricted,{serviceId:nextService.id,stageKey:serviceStages(nextService.data)[1].stageKey,status:'in_progress',revision:nextService.revision,staffNote:'New responsible employee starts the next stage'})}))
  assert.equal((await store.read('users',id(5))).data.staffPermissions.canAccessAccounts,undefined)
})

test('batch notification reads apply only to the displayed, authorized IDs',async()=>{
  for(const n of [60,61,62])await insert('notifications',timestamped({_id:id(n),recipientCustomerId:id(n===62?2:1),recipientUserId:null,targetAudience:'customer',type:'request_update',title:'Test notification',message:'Test only',isRead:false,readBy:[],channel:'in_app',severity:'normal'}))
  const mark=ids=>dispatch({action:'notifications-read',request:request(customer,{notificationIds:ids})})
  assert.equal((await mark([id(60),id(62)])).status,404)
  assert.deepEqual((await store.read('notifications',id(60))).data.readBy,[])
  await value(await mark([id(60),id(61)]))
  assert.deepEqual((await store.read('notifications',id(60))).data.readBy,[id(6)])
  assert.deepEqual((await store.read('notifications',id(61))).data.readBy,[id(6)])
  assert.deepEqual((await store.read('notifications',id(62))).data.readBy,[])
})

test('per-line sale workflow recalculates prices on save and publishes only immutable customer sale amounts', async()=>{
 const pricingStaff=await actor(8,'staff',{canAccessAccounts:true,createInvoice:true,editInvoice:true})
 const shipment=randomUUID()
 await db.prepare(`INSERT INTO shipment_records(id,shipment_date,booking,number_46,shipping_line,container_count,container_size,export_invoice,broker,shipper,port_of_loading,port_of_discharge,item_name,hs_code,updated_by)
   VALUES(?,'2026-11-11','LINE-PRICE-TEST','','',1,'','','','Registered 1','Damietta','Casablanca','','',?)`).bind(shipment,id(3)).run()
 let local=(await value(await call('create',admin,{shipmentId:shipment,customerId:id(1),currency:'EGP'}),201)).invoice
 const data=input(local,true);data.pricingMode='per-item-v1';data.sellingPrice='999999'
 data.stages.shipping.costs=[{id:randomUUID(),description:'نولون',amount:'12000',currency:'EGP',exchangeRate:'1',notes:'PRIVATE-COST-NOTE',saleEqualsCost:false,sellingPrice:'15000'}]
 data.stages.transportation.costs=[{id:randomUUID(),description:'نقل',amount:'1000',currency:'EGP',exchangeRate:'1',notes:'PRIVATE-TRANSPORT',saleEqualsCost:true,sellingPrice:'7'}]
 const invalid=structuredClone(data);delete invalid.stages.shipping.costs[0].sellingPrice
 assert.equal((await call('save',pricingStaff,invalid,local.id)).status,400)
 local=(await value(await call('save',pricingStaff,data,local.id))).invoice
 assert.equal(local.totals.customerTotal,'16000.00');assert.equal(local.totals.totalCosts,'13000.00')
 assert.equal(local.draft.stages.transportation.costs[0].sellingPrice,'1000')
 let edit=input(local,true);edit.stages.transportation.costs[0].amount='2000'
 local=(await value(await call('save',pricingStaff,edit,local.id))).invoice
 assert.equal(local.totals.customerTotal,'17000.00')
 edit=input(local,true);edit.stages.transportation.costs[0].saleEqualsCost=false;edit.stages.transportation.costs[0].sellingPrice='1800'
 local=(await value(await call('save',pricingStaff,edit,local.id))).invoice
 assert.equal(local.totals.customerTotal,'16800.00')
 const preview=await value(await call('preview',admin,{revision:local.revision},local.id))
 assert.equal(preview.snapshot.total,'16800.00')
 assert.deepEqual(preview.snapshot.groups.map(g=>g.total),['15000.00','1800.00'])
 assert.deepEqual(preview.snapshot.items.map(i=>i.amount),['15000.00','1800.00'])
 assert.ok(!JSON.stringify(preview.snapshot).includes('12000'));assert.ok(!JSON.stringify(preview.snapshot).includes('PRIVATE'))
 local=(await value(await call('publish',admin,{revision:local.revision,previewKey:preview.previewKey},local.id))).invoice
 const raw=(await store.read('invoices',local.id)).data
 const visible=await value(await dispatch({action:'public-invoice',id:raw.token,request:request(customer)}))
 assert.equal(visible.invoice.totalAmount,16800)
 assert.deepEqual(visible.invoice.items.map(row=>row.total),[15000,1800])
 assert.deepEqual(visible.invoice.groups,preview.snapshot.groups)
 assert.ok(!JSON.stringify(visible).includes('PRIVATE'));assert.ok(!JSON.stringify(visible).includes('saleEqualsCost'))
 const published=structuredClone(visible.invoice.groups)
 local=(await value(await call('revise',admin,{revision:local.revision,reason:'Sale price amendment'},local.id))).invoice
 edit=input(local,true);edit.stages.shipping.costs[0].sellingPrice='16000'
 await value(await call('save',pricingStaff,edit,local.id))
 const stillVisible=await value(await dispatch({action:'public-invoice',id:raw.token,request:request(customer)}))
 assert.deepEqual(stillVisible.invoice.groups,published);assert.equal(stillVisible.invoice.totalAmount,16800)
})


test('tier editing requires explicit permission and published customer totals retain tier details',async()=>{
 const shipment=randomUUID()
 await db.prepare("INSERT INTO shipment_records(id,shipment_date,booking,number_46,shipping_line,container_count,container_size,export_invoice,broker,shipper,port_of_loading,port_of_discharge,item_name,hs_code,updated_by) VALUES(?,'2026-11-16','TIER-FIXTURE','','',1,'','','','Registered 1','','','','',?)").bind(shipment,id(3)).run()
 let view=(await value(await call('create',admin,{shipmentId:shipment,customerId:id(1),currency:'EGP'}),201)).invoice
 const payload=input(view,true);payload.pricingMode='per-item-v1'
 payload.stages.shipping.costs=[{id:randomUUID(),description:'Tiered freight',amount:'4000',currency:'EGP',exchangeRate:'1',notes:'PRIVATE COST',isTiered:true,saleEqualsCost:false,tiers:[{label:'First unit',quantity:'1',unitPrice:'500'},{label:'Next units',quantity:'4',unitPrice:'750'},{label:'Last units',quantity:'3',unitPrice:'1200'}]}]
 assert.equal((await call('save',staff,payload,view.id)).status,403)
 view=(await value(await call('save',admin,payload,view.id))).invoice
 assert.equal(view.totals.customerTotal,'7100.00')
 const preview=await value(await call('preview',admin,{revision:view.revision},view.id))
 assert.equal(preview.snapshot.groups[0].items[0].tiers[1].subtotal,'3000.00')
 assert.ok(!JSON.stringify(preview.snapshot).includes('PRIVATE COST'))
 assert.equal((await call('save',staff,{...payload,revision:view.revision,stages:{...payload.stages,shipping:{...payload.stages.shipping,costs:[]}}},view.id)).status,403)
})

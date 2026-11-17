import assert from 'node:assert/strict'
import {shipmentAccountingRoute} from '../../lib/shipments/accounting-route.ts'
import { before, after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { createD1WorkflowHandler } from '../../lib/workflows/d1-handlers.ts'
import { WorkflowStore, WorkflowError, timestamped } from '../../lib/workflows/runtime.ts'
import { defaultStorage, documentHealth } from '../../lib/workflows/documents.ts'
import { D1AccountsRepository } from '../../lib/db/repositories/accounts.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { POST as createRequestRoute } from '../../app/api/portal/requests/route.ts'
import { POST as uploadRoute } from '../../app/api/portal/documents/upload/route.ts'
import { POST as reviewRoute } from '../../app/api/admin/documents/[id]/verify/route.ts'
import { POST as saveQuoteRoute } from '../../app/api/admin/quotes/route.ts'
import { POST as acceptQuoteRoute } from '../../app/api/portal/quotes/[id]/accept/route.ts'
import { POST as markReadRoute } from '../../app/api/portal/notifications/mark-read/route.ts'

let simulator, db, store, dispatch, a, a2, b, manager, restricted
let initialRequest, editableRequest, editableQuote, uploadRequest, uploaded
let putCount = 0, getCount = 0, failPutAt = null
const objects = new Map(), removed = []
const identifier = n => n.toString(16).padStart(24, '0')
const environmentKeys = ['DATABASE_PROVIDER', 'D1_ACCOUNTS_PREVIEW', 'D1_MIGRATION_PREVIEW', 'NODE_ENV', 'JWT_SECRET']
const originalEnv = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]))
const contextKey = Symbol.for('__cloudflare-context__'), originalContext = globalThis[contextKey]
const originalStorage = { ...defaultStorage }
const storage = {
  async put(bytes, key) {
    putCount++
    objects.set(key, Buffer.from(bytes))
    if (putCount === failPutAt) throw new Error('Simulated uncertain object upload')
    return { fileHash: createHash('sha256').update(bytes).digest('hex'), fileSize: bytes.length }
  },
  async get(key) {
    getCount++
    if (!objects.has(key)) throw new Error('Missing fixture object')
    return { body: objects.get(key), contentType: 'application/pdf', contentLength: objects.get(key).length }
  },
  async remove(key) { removed.push(key); objects.delete(key); return true },
}
function request(path = '/', cookie, input, method) {
  return new Request('http://localhost' + path, {
    method: method || (input === undefined ? 'GET' : 'POST'),
    headers: { ...(cookie ? { cookie } : {}), ...(input === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  })
}
function run(action, actor = a, input, id, url = '/') {
  return dispatch({ action, request: request(url, actor?.cookie), ...(input === undefined ? {} : { input }), id })
}
async function actor(id, customerId, role = 'customer_admin', permissions = {}) {
  const data = { _id: identifier(id), email: `fixture-${id}@example.test`, firstName: 'Test', lastName: 'User', role, status: 'active', customerId, staffPermissions: permissions, emailVerified: true, whatsappVerified: true }
  await insert('users', data)
  return { data, cookie: `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: data._id, email: data.email, firstName: data.firstName, lastName: data.lastName, role, customerId, staffPermissions: permissions })}` }
}
async function insert(table, data) {
  await db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).bind(data._id, JSON.stringify(data)).run()
}
async function data(table, id) { return (await store.read(table, id))?.data }
async function count(table) { return (await db.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count }
function requestInput(overrides = {}) {
  return { services: [{ serviceKey: 'sea_freight', details: { origin: 'Cairo', destination: 'Rome', legacyExtra: { preserve: [3, 2, 1] } } }], operationType: 'import', subject: 'Shipping inquiry', description: 'Please arrange shipment', priority: 'medium', ...overrides }
}
async function createRequest(input = requestInput()) {
  const result = await createRequestRoute(request('/api/portal/requests', a.cookie, input))
  assert.equal(result.status, 201, JSON.stringify(await result.clone().json()))
  return (await result.json()).request
}
function quoteInput(parent, overrides = {}) {
  return { requestId: parent._id, customerId: parent.customerId, currency: 'EUR', items: parent.services.map((id, index) => ({ requestServiceId: id, serviceKey: index ? 'air_freight' : 'sea_freight', basePrice: 100 + index, additionalCharges: 10, discount: 5, finalPrice: 105 + index, breakdown: [{ description: 'Shipping', basePrice: 100 + index, additionalCharges: 10 }] })), ...overrides }
}
async function createQuote(parent, overrides = {}) {
  const result = await saveQuoteRoute(request('/api/admin/quotes', manager.cookie, quoteInput(parent, overrides)))
  assert.equal(result.status, 201, JSON.stringify(await result.clone().json()))
  return (await result.json()).quote
}
function uploadHttp(files, entityId, cookie = a.cookie) {
  const form = new FormData()
  for (const file of files) { form.append('files', file); form.append('categories', 'commercial_register'); form.append('titles', file.name) }
  if (entityId) form.append('entityId', entityId)
  return new Request('http://localhost/api/portal/documents/upload', { method: 'POST', headers: { cookie }, body: form })
}
const pdf = name => new File([`%PDF-1.7 fixture ${name}`], name, { type: 'application/pdf' })

before(async () => {
  Object.assign(process.env, { DATABASE_PROVIDER: 'd1', D1_MIGRATION_PREVIEW: 'true', NODE_ENV: 'test', JWT_SECRET: 'local-workflow-fixtures-secret-only' })
  simulator = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture"); } }', compatibilityDate: '2025-04-01', d1Databases: { DB: 'workflow-tests' }, d1Persist: false })
  db = await simulator.getD1Database('DB')
  await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
  globalThis[contextKey] = { env: { DB: db }, cf: {}, ctx: {} }
  Object.assign(defaultStorage, storage)
  store = new WorkflowStore(db)
  dispatch = createD1WorkflowHandler(db, { storage })
  for (const id of [11, 12]) await insert('customers', timestamped({ _id: identifier(id), companyName: `Company ${id}`, contactEmail: `company${id}@example.test`, contactPhone: '+201000000000', commercialRegisterNumber: `CR-${id}`, taxCardNumber: `TAX-${id}`, accountStatus: 'active', maxAllowedDocuments: 20 }))
  a = await actor(1, identifier(11)); a2 = await actor(2, identifier(11)); b = await actor(3, identifier(12))
  manager = await actor(4, null, 'super_admin', { canReviewDocuments: true, canSendAlerts: true })
  restricted = await actor(5, null, 'staff', { canReviewDocuments: false, canSendAlerts: false })
  await insert('customer_requests', timestamped({ _id: identifier(101), customerId: a.data.customerId, requestedBy: a.data._id, trackingNumber: `NL-REQ-${new Date().getUTCFullYear()}-9400`, services: [], timeline: [], status: 'completed' }))
})
after(async () => {
  Object.assign(defaultStorage, originalStorage)
  if (originalContext === undefined) delete globalThis[contextKey]; else globalThis[contextKey] = originalContext
  await simulator?.dispose()
  for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
})

test('public categories are available without writing defaults into the source settings', async () => {
  const result = await run('categories-public', null)
  assert.equal(result.status, 200)
  assert.ok((await result.json()).categories.some(category => category.key === 'tax_card'))
  assert.equal(await count('system_settings'), 0)
})

test('real request route creates request, ordered services and notifications atomically', async () => {
  initialRequest = await createRequest()
  assert.equal(initialRequest.trackingNumber, "TAX-11-1")
  assert.equal(initialRequest.requestSequence, 1)
  assert.equal(initialRequest.customerId, a.data.customerId)
  assert.equal(initialRequest.services.length, 1)
  const service = await data('request_services', initialRequest.services[0])
  assert.equal(service.requestId, initialRequest._id)
  assert.deepEqual(service.details.legacyExtra.preserve, [3, 2, 1])
  assert.equal((await store.list('notifications', "json_extract(data, '$.relatedRequestId') = ?", [initialRequest._id])).length, 2)
  const result = await run('requests-list')
  const created = (await result.json()).requests.find(row => row._id === initialRequest._id)
  assert.equal(created.services[0]._id, service._id)
})

test('request numbers remain unique under concurrent allocations and invalid services do not create partial records', async () => {
  assert.equal((await run('request-create', a, requestInput({operationType:'none'}))).status,400)
  assert.equal((await run('request-create', a, requestInput({operationType:undefined}))).status,400)
  const responses = await Promise.all(Array.from({ length: 4 }, () => run('request-create', a, requestInput())))
  const numbers = await Promise.all(responses.map(async result => { assert.equal(result.status, 201); return (await result.json()).request.trackingNumber }))
  assert.equal(new Set(numbers).size, numbers.length)
  const before = await count('customer_requests')
  assert.equal((await run('request-create', a, requestInput({ services: [{ serviceKey: 'not-a-service' }] }))).status, 400)
  assert.equal(await count('customer_requests'), before)
})

test('customer cannot submit or inspect another tenant through stale JWT customer claims', async () => {
  const stale = { ...a, cookie: `${ACCESS_COOKIE_NAME}=${await createAccessToken({ userId: a.data._id, email: a.data.email, role: 'super_admin', customerId: b.data.customerId, firstName: 'Forged', lastName: 'Claims' })}` }
  const result = await run('request-create', stale, requestInput())
  assert.equal(result.status, 201)
  assert.equal((await result.json()).request.customerId, a.data.customerId)
  assert.equal((await run('admin-requests-list', stale)).status, 403)
})

test('failed child relationship rolls back request and notification inserts', async () => {
  const candidate = timestamped({ customerId: a.data.customerId, requestedBy: a.data._id, trackingNumber: 'must-roll-back', status: 'submitted', services: [] })
  await assert.rejects(store.commit({ inserts: [
    { table: 'customer_requests', data: candidate },
    { table: 'request_services', data: timestamped({ requestId: 'missing-parent', serviceKey: 'sea_freight' }) },
    { table: 'notifications', data: timestamped({ title: 'must-roll-back' }) },
  ] }), WorkflowError)
  assert.equal(await data('customer_requests', candidate._id), undefined)
})

test('quote issuance requires live staff privileges and verifies customer/service relationships', async () => {
  assert.equal((await saveQuoteRoute(request('/api/admin/quotes', a.cookie, quoteInput(initialRequest)))).status, 403)
  assert.equal((await run('admin-quote-save', manager, quoteInput(initialRequest, { customerId: b.data.customerId }))).status, 403)
  assert.equal((await run('admin-quote-save', manager, quoteInput(initialRequest, { items: [{ serviceKey: 'sea_freight', requestServiceId: 'foreign-service', finalPrice: 1 }] }))).status, 400)
  editableRequest = await createRequest(requestInput({ services: [{ serviceKey: 'sea_freight', details: {} }, { serviceKey: 'air_freight', details: {} }] }))
  editableQuote = await createQuote(editableRequest)
  assert.equal(editableQuote.totalAmount, 211)
  assert.equal((await data('customer_requests', editableRequest._id)).status, 'quote_provided')
})

test('quote edits preserve existing line identity and full audit history; removed lines are retained', async () => {
  const lines = await store.list('quote_items', 'quoteId = ?', [editableQuote._id])
  const keep = lines.find(row => row.data.serviceKey === 'sea_freight'), retire = lines.find(row => row.data.serviceKey === 'air_freight')
  const result = await run('admin-quote-save', manager, quoteInput(editableRequest, { quoteId: editableQuote._id, currency: undefined, items: [{ ...keep.data, id: keep.id, finalPrice: 150 }] }))
  assert.equal(result.status, 200)
  const current = await data('quote_items', keep.id)
  assert.equal(current._id, keep.id)
  assert.equal(current.auditTrail.length, 2)
  assert.equal(current.auditTrail[1].previousPrice, 105)
  assert.equal(current.auditTrail[1].newPrice, 150)
  assert.equal((await data('quote_items', retire.id)).isArchived, true)
  assert.equal((await data('quote_items', retire.id)).auditTrail.length, 1)
  const visible = await run('quote-get', a, undefined, editableQuote._id)
  assert.equal((await visible.json()).items.length, 1)
  assert.equal((await data('quotes', editableQuote._id)).currency, 'EUR')
})

test('quote reads and decisions reject a different tenant without modifying its data', async () => {
  const before = await data('quotes', editableQuote._id)
  assert.equal((await run('quote-get', b, undefined, editableQuote._id)).status, 404)
  assert.equal((await run('quote-accept', b, undefined, editableQuote._id)).status, 404)
  assert.equal((await run('request-quotes', b, undefined, editableRequest._id)).status, 404)
  assert.deepEqual(await data('quotes', editableQuote._id), before)
})

test('accepting a quotation atomically activates its services, updates the request and prevents replay', async () => {
  const result = await acceptQuoteRoute(request('/api/portal/quotes/' + editableQuote._id + '/accept', a.cookie, {}), { params: Promise.resolve({ id: editableQuote._id }) })
  assert.equal(result.status, 200)
  assert.equal((await data('quotes', editableQuote._id)).status, 'accepted')
  assert.equal((await data('customer_requests', editableRequest._id)).status, 'quote_accepted')
  for (const [index,id] of editableRequest.services.entries()) assert.equal((await data('request_services', id)).status, index ? 'cancelled' : 'active')
  assert.equal((await run('quote-reject', a, undefined, editableQuote._id)).status, 409)
  assert.equal((await run('admin-quote-save', manager, quoteInput(editableRequest))).status, 409)
  assert.equal((await run('admin-request-confirm', manager, undefined, editableRequest._id)).status, 200)
  assert.equal((await data('customer_requests', editableRequest._id)).status, 'processing')
})

test('simultaneous accept/reject has exactly one winner and no contradictory final state', async () => {
  const parent = await createRequest(), quote = await createQuote(parent)
  const before = (await store.list('notifications', "json_extract(data, '$.relatedRequestId') = ?", [parent._id])).length
  const results = await Promise.all([run('quote-accept', a, undefined, quote._id), run('quote-reject', a, undefined, quote._id)])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  const stored = await data('quotes', quote._id), current = await data('customer_requests', parent._id)
  assert.equal(current.status, stored.status === 'accepted' ? 'quote_accepted' : 'quote_pending')
  assert.equal((await store.list('notifications', "json_extract(data, '$.relatedRequestId') = ?", [parent._id])).length, before + (stored.status==='accepted'?2:1))
})

test('accepted quote returns its issued customs reference rather than a later request value', async()=>{
 const parent=await createRequest(requestInput({operationType:'export'}))
 let snapshot=await store.read('customer_requests',parent._id)
 await store.commit({updates:[{before:snapshot,patch:{complianceType:'UCR',complianceNumber:'UCR-THIS-QUOTE'}}]})
 const quote=await createQuote(parent);assert.equal(quote.complianceReference.number,'UCR-THIS-QUOTE')
 snapshot=await store.read('customer_requests',parent._id)
 await store.commit({updates:[{before:snapshot,patch:{complianceNumber:'UCR-LATER-REQUEST-VALUE'}}]})
 const response=await run('quote-accept',a,undefined,quote._id);assert.equal(response.status,200)
 assert.equal((await response.json()).complianceReference.number,'UCR-THIS-QUOTE')
 const notes=await store.list('notifications',"json_extract(data,'$.relatedRequestId')=?",[parent._id])
 assert.ok(notes.some(n=>n.data.recipientUserId===a.data._id&&n.data.message.includes('UCR-THIS-QUOTE')))
})

test('new quotes default to EGP while edits preserve the original stored currency',async()=>{
 const parent=await createRequest(),quote=await createQuote(parent,{currency:undefined})
 assert.equal(quote.currency,'EGP')
 const result=await run('admin-quote-save',manager,quoteInput(parent,{quoteId:quote._id,currency:undefined}))
 assert.equal(result.status,200);assert.equal((await result.json()).quote.currency,'EGP')
})

test('partial acceptance validates selections and activates only the selected priced services',async()=>{
 const parent=await createRequest(requestInput({services:[{serviceKey:'sea_freight'},{serviceKey:'air_freight'}]})),quote=await createQuote(parent)
 for(const acceptedServices of [[],['unknown'],['sea_freight','sea_freight']])assert.equal((await run('quote-action',a,{action:'accept',acceptedServices},quote._id)).status,400)
 assert.equal((await run('quote-action',b,{action:'accept',acceptedServices:['sea_freight']},quote._id)).status,404)
 const result=await run('quote-action',a,{action:'accept',acceptedServices:['sea_freight'],acceptedAmount:1},quote._id);assert.equal(result.status,200)
 const saved=(await result.json()).quote;assert.equal(saved.status,'partially_accepted');assert.equal(saved.acceptedAmount,105);assert.deepEqual(saved.rejectedServices,['air_freight'])
 assert.equal((await data('request_services',parent.services[0])).status,'active');assert.equal((await data('request_services',parent.services[1])).status,'cancelled')
 assert.equal((await run('admin-request-confirm',manager,undefined,parent._id)).status,200)
 const declined=await store.read('request_services',parent.services[1])
 const update=request('/api/admin/services/'+declined.id+'/status',manager.cookie,{status:'pending',revision:declined.revision,comment:'Cannot revive declined service'});update.headers.set('origin','http://localhost')
 assert.equal((await dispatch({action:'service-status',request:update,id:declined.id})).status,409)
})

test('UCR follows accepted customs scope and customer requests are optional after acceptance',async()=>{
 const get=async(parent,actor=a,admin=false)=>{const r=await run(admin?'admin-request-ucr':'request-ucr',actor,undefined,parent._id);assert.equal(r.status,200);return r.json()}
 const post=async(action,actor,parent,input)=>{const req=request('/api/requests/'+parent._id+'/ucr',actor.cookie,input);req.headers.set('origin','http://localhost');return dispatch({action,request:req,id:parent._id})}
 const customs=await createRequest(requestInput({services:[{serviceKey:'customs_clearance'}]}));
 let state=await get(customs,manager,true);assert.equal(state.required,false);
 assert.equal((await post('admin-request-ucr',manager,customs,{revision:state.revision,mode:'provide',value:'EARLY'})).status,409);
 const quote=await createQuote(customs,{items:[{requestServiceId:customs.services[0],serviceKey:'customs_clearance',finalPrice:100}]});await run('quote-accept',a,undefined,quote._id);
 state=await get(customs,manager,true);assert.equal(state.canProvide,true);assert.equal(state.canRequest,false);
 assert.equal((await post('admin-request-ucr',manager,customs,{revision:state.revision,mode:'request'})).status,409);
 assert.equal((await post('admin-request-ucr',manager,customs,{revision:state.revision,mode:'provide',value:'UCR-TEAM'})).status,200);
 assert.equal((await get(customs)).value,'UCR-TEAM');assert.equal((await run('request-ucr',b,undefined,customs._id)).status,404);
 const freight=await createRequest();const fq=await createQuote(freight);await run('quote-accept',a,undefined,fq._id);
 assert.equal((await get(freight)).required,false);state=await get(freight,manager,true);assert.equal(state.canRequest,true);
 assert.equal((await post('admin-request-ucr',manager,freight,{revision:state.revision,mode:'provide',value:'NOT-ALLOWED'})).status,409);
 assert.equal((await post('admin-request-ucr',manager,freight,{revision:state.revision,mode:'request'})).status,200);state=await get(freight);
 assert.equal((await post('request-ucr',a,freight,{revision:state.revision,value:'UCR-CUSTOMER'})).status,200);
 assert.equal((await data('quotes',fq._id)).complianceReference.number,'UCR-CUSTOMER');
 assert.equal((await post('request-ucr',a,freight,{revision:state.revision,value:'REPLAY'})).status,409);
})

test('execution stages enforce ordering, ownership, optimistic revisions and customer-visible notes',async()=>{
 const parent=await createRequest(),quote=await createQuote(parent)
 await run('quote-accept',a,undefined,quote._id);await run('admin-request-confirm',manager,undefined,parent._id)
 const get=async()=>{const result=await run('request-tracking',a,undefined,parent._id);assert.equal(result.status,200);return(await result.json()).serviceTracking[0]}
 let row=await get();assert.equal(row.stages.length,6)
 assert.equal((await run('request-tracking',b,undefined,parent._id)).status,404)
 const update=async(stageKey,status,revision,actor=manager)=>{const req=request('/api/admin/requests/'+parent._id+'/tracking',actor.cookie,{serviceId:row.serviceId,stageKey,status,revision,staffNote:'Cargo checked by team'});req.headers.set('origin','http://localhost');return dispatch({action:'admin-request-tracking',request:req,id:parent._id})}
 assert.equal((await update(row.stages[1].stageKey,'completed',row.revision)).status,409)
 assert.equal((await update(row.stages[0].stageKey,'completed',row.revision,a)).status,403)
 const race=await Promise.all([update(row.stages[0].stageKey,'in_progress',row.revision),update(row.stages[0].stageKey,'completed',row.revision)])
 assert.deepEqual(race.map(response=>response.status).sort(),[200,409])
 row=await get();assert.equal(row.stages[0].staffNote,'Cargo checked by team')
 for(const stage of row.stages){row=await get();assert.equal((await update(stage.stageKey,'completed',row.revision)).status,200)}
 row=await get();assert.equal(row.isCompleted,true);assert.equal((await data('customer_requests',parent._id)).status,'completed')
})

test('request invoices are created without fake shipments, seed accepted sales and remain private drafts until reviewed',async()=>{
 const parent=await createRequest(requestInput({services:[{serviceKey:'sea_freight'},{serviceKey:'air_freight'}]})),quote=await createQuote(parent)
 await run('quote-action',a,{action:'accept',acceptedServices:['sea_freight']},quote._id)
 const before=(await db.prepare('SELECT count(*) AS n FROM shipment_records').first()).n
 const create=async(actor=manager)=>{const req=request('/api/admin/requests/'+parent._id+'/invoices/create',actor.cookie,{});req.headers.set('origin','http://localhost');return shipmentAccountingRoute(req,'shipment-invoice-from-request',parent._id)}
 assert.equal((await create(a)).status,403);assert.equal((await create(restricted)).status,403)
 const created=await create();assert.equal(created.status,201);const invoiceId=(await created.json()).invoice.id
 assert.equal((await db.prepare('SELECT count(*) AS n FROM shipment_records').first()).n,before)
 const stored=await data('invoices',invoiceId);assert.equal(stored.requestAccounting,true);assert.equal(stored.relatedRequestId,parent._id);assert.equal(stored.relatedQuoteId,quote._id);assert.equal(stored.status,'draft')
 assert.equal(stored.shipmentAccounting.draft.stages.shipping.costs.length,1);assert.equal(stored.shipmentAccounting.draft.stages.shipping.costs[0].sellingPrice,'105.00');assert.equal(stored.shipmentAccounting.draft.stages.shipping.costs[0].amount,'0.00')
 assert.equal((await create()).status,200);assert.equal((await(await create()).json()).invoice.id,invoiceId)
 const mutate=async(action,input,actor=manager)=>{const req=request('/api/admin/shipment-invoices/'+invoiceId,actor.cookie,input);req.headers.set('origin','http://localhost');return shipmentAccountingRoute(req,'shipment-invoice-'+action,invoiceId)}
 let view=(await(await mutate('detail')).json()).invoice
 const payload={revision:view.revision,pricingMode:'per-item-v1',notes:'Customer notes',stages:structuredClone(stored.shipmentAccounting.draft.stages)}
 for(const stage of Object.values(payload.stages)){stage.costs=stage.costs.map(({createdAt,createdBy,updatedAt,updatedBy,...cost})=>cost)}
 payload.stages.shipping.completed=true
 const saved=await mutate('save',payload);assert.equal(saved.status,200);view=(await saved.json()).invoice
 const preview=await mutate('preview',{revision:view.revision});assert.equal(preview.status,200);const review=await preview.json();assert.equal(review.snapshot.total,'105.00')
 assert.equal((await mutate('publish',{revision:view.revision,previewKey:review.previewKey})).status,200)
 const published=await data('invoices',invoiceId);assert.equal(published.totalAmount,105)
 const client=await dispatch({action:'public-invoice',id:published.token,request:request('/api/invoice/'+published.token,a.cookie)});assert.equal(client.status,200)
 const publicData=await client.json();assert.equal(publicData.invoice.groups[0].total,'105.00');assert.ok(!JSON.stringify(publicData).includes('shipmentAccounting'))
 assert.equal((await dispatch({action:'public-invoice',id:published.token,request:request('/api/invoice/'+published.token)})).status,401)
 assert.equal((await run('invoice-update',manager,{notes:'Bypass'},invoiceId)).status,409)
})

test('direct invoice creation ignores unaccepted quote currency and concurrent retries cannot create duplicates',async()=>{
 const parent=await createRequest();await createQuote(parent,{currency:'USD'})
 const snapshot=await store.read('customer_requests',parent._id)
 await store.commit({updates:[{before:snapshot,patch:{quoteRequired:false,status:'submitted'}}]})
 const create=()=>{const req=request('/api/admin/requests/'+parent._id+'/invoices/create',manager.cookie,{});req.headers.set('origin','http://localhost');return shipmentAccountingRoute(req,'shipment-invoice-from-request',parent._id)}
 const results=await Promise.all([create(),create()]);assert.equal(results.filter(result=>result.status===201).length,1);assert.ok(results.every(result=>[200,201,409].includes(result.status)))
 const opened=await create();assert.equal(opened.status,200)
 const stored=await data('invoices',(await opened.json()).invoice.id);assert.equal(stored.currency,'EGP');assert.equal(stored.relatedQuoteId,null)
 assert.equal((await store.list('invoices','relatedRequestId=?',[parent._id])).length,1)
})

test('progressive quote rows are recalculated by the server, retained for the customer and carried into the invoice',async()=>{
 const parent=await createRequest()
 const progressivePricing={unit:'shipment',quantity:3,tiers:[{from:1,to:1,unitPrice:'5000'},{from:2,to:null,unitPrice:'1000'}]}
 const night={unit:'night',quantity:4,tiers:[{from:1,to:1,unitPrice:'200'},{from:2,to:null,unitPrice:'50'}]}
 const payload=quoteInput(parent,{currency:'EGP',items:[{requestServiceId:parent.services[0],serviceKey:'sea_freight',finalPrice:1,basePrice:1,breakdown:[{description:'Freight',basePrice:1,additionalCharges:0,progressivePricing},{description:'Overnight',basePrice:1,additionalCharges:0,progressivePricing:night}]}]})
 const invalid=structuredClone(payload);invalid.items[0].breakdown[0].progressivePricing.tiers[1].from=3
 assert.equal((await run('admin-quote-save',manager,invalid)).status,400)
 const created=await run('admin-quote-save',manager,payload);assert.equal(created.status,201);const quote=(await created.json()).quote;assert.equal(quote.totalAmount,7350)
 const visible=await run('quote-get',a,undefined,quote._id);assert.equal(visible.status,200);const items=(await visible.json()).items
 assert.equal(items[0].finalPrice,7350);assert.equal(items[0].breakdown[1].progressivePricing.unit,'night');assert.equal(items[0].tiers.length,4)
 const accepted=await run('quote-action',a,{action:'accept',acceptedServices:['sea_freight']},quote._id);assert.equal(accepted.status,200);assert.equal((await accepted.json()).quote.acceptedAmount,7350)
 const req=request('/api/admin/requests/'+parent._id+'/invoices/create',manager.cookie,{});req.headers.set('origin','http://localhost')
 const invoiceResponse=await shipmentAccountingRoute(req,'shipment-invoice-from-request',parent._id);assert.equal(invoiceResponse.status,201)
 const invoice=await data('invoices',(await invoiceResponse.json()).invoice.id),line=invoice.shipmentAccounting.draft.stages.shipping.costs[0]
 assert.equal(line.sellingPrice,'7350.00');assert.equal(line.isTiered,true);assert.deepEqual(line.tiers.map(tier=>tier.quantity),['1','2','1','3'])
})

test('expired quotations cannot be accepted and stale versions roll back every dependent mutation', async () => {
  const parent = await createRequest(), quote = await createQuote(parent)
  const loaded = await store.read('quotes', quote._id)
  await store.commit({ updates: [{ before: loaded, patch: { validUntil: '2000-01-01T00:00:00.000Z' } }] })
  assert.equal((await run('quote-accept', a, undefined, quote._id)).status, 409)
  const requestSnapshot = await store.read('customer_requests', parent._id)
  await assert.rejects(store.commit({ updates: [{ before: requestSnapshot, patch: { status: 'processing' } }, { before: loaded, patch: { status: 'accepted' } }] }), WorkflowError)
  assert.equal((await data('customer_requests', parent._id)).status, 'quote_provided')
  assert.equal((await data('quotes', quote._id)).status, 'sent')
})

test('pricing and operations enforce staff access and route-specific rules take precedence', async () => {
  assert.equal((await run('pricing-list', a)).status, 403)
  assert.equal((await run('service-status', a, { status: 'completed', title: 'not allowed' }, initialRequest.services[0])).status, 403)
  for (const rule of [{ serviceKey: 'sea_freight', pricingType: 'fixed', defaultPrice: 20, currency: 'EUR' }, { serviceKey: 'sea_freight', pricingType: 'route_based', defaultPrice: 30, currency: 'EUR', routeInfo: { origin: 'CAIRO', destination: 'rome' } }]) assert.equal((await run('pricing-create', manager, rule)).status, 201)
  const prices = await run('admin-request-price', manager, undefined, initialRequest._id)
  assert.equal((await prices.json()).data[0].suggestedPrice, 30)
})

test('all upload files are validated before any object or database metadata is written', async () => {
  uploadRequest = await createRequest(requestInput({ operationType: 'import' }))
  const before = await count('documents'), calls = putCount
  const result = await uploadRoute(uploadHttp([pdf('valid.pdf'), new File(['invalid'], 'script.exe', { type: 'application/octet-stream' })], uploadRequest._id))
  assert.equal(result.status, 400)
  assert.equal(putCount, calls)
  assert.equal(await count('documents'), before)
  assert.equal((await count('_nilelink_storage_pending')), 0)
})

test('actual upload route atomically links files, audit logs, review state and notifications', async () => {
  const result = await uploadRoute(uploadHttp([pdf('first.pdf'), pdf('second.pdf')], uploadRequest._id))
  assert.equal(result.status, 201, JSON.stringify(await result.clone().json()))
  uploaded = (await result.json()).documents
  assert.equal(uploaded.length, 2)
  assert.equal((await data('customer_requests', uploadRequest._id)).status, 'document_under_review')
  for (const item of uploaded) {
    const doc = await data('documents', item.id)
    assert.ok(objects.has(doc.storageKey))
    assert.equal(doc.fileHash, createHash('sha256').update(objects.get(doc.storageKey)).digest('hex'))
    assert.equal(doc.entityId, uploadRequest._id)
    assert.equal((await store.list('document_activity_logs', 'documentId = ?', [item.id])).length, 1)
    const unified = await store.list('system_audit_logs', "json_extract(data,'$.activityVersion')=1 AND json_extract(data,'$.target.id')=?", [item.id])
    assert.equal(unified.length, 1)
    assert.equal(unified[0].data.actor.id, a.data._id)
    assert.equal(unified[0].data.category, 'upload')
  }
  assert.equal(await count('_nilelink_storage_pending'), 0)
})

test('downloads check live tenant ownership before touching object storage', async () => {
  const calls = getCount
  const denied = await run('document-download', b, undefined, uploaded[0].id)
  assert.equal(denied.status, 404)
  assert.equal(getCount, calls)
  const result = await run('document-download', a, undefined, uploaded[0].id)
  assert.equal(result.status, 200)
  const doc = await data('documents', uploaded[0].id)
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), objects.get(doc.storageKey))
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff')
})

test('a changed object fails integrity verification before a successful-download audit is written', async () => {
  const doc = await data('documents', uploaded[0].id)
  const original = objects.get(doc.storageKey)
  const before = (await store.list('document_activity_logs', 'documentId = ?', [doc._id])).length
  try {
    objects.set(doc.storageKey, Buffer.alloc(original.length, 0))
    assert.equal((await run('document-download', a, undefined, doc._id)).status, 409)
    assert.equal((await store.list('document_activity_logs', 'documentId = ?', [doc._id])).length, before)
  } finally { objects.set(doc.storageKey, original) }
})

test('pending review never produces phantom rejection notifications or request rejection', async () => {
  const before = (await store.list('notifications', "type = 'document_rejected'")).length
  const result = await reviewRoute(request('/api/admin/documents/' + uploaded[0].id + '/verify', manager.cookie, { status: 'pending_review' }), { params: Promise.resolve({ id: uploaded[0].id }) })
  assert.equal(result.status, 200)
  assert.equal((await store.list('notifications', "type = 'document_rejected'")).length, before)
  assert.equal((await data('customer_requests', uploadRequest._id)).status, 'document_under_review')
})

test('all submitted request documents must be reviewed before quotation and health updates commit with review', async () => {
  const expiryDate = new Date(Date.now() + 365 * 86400000).toISOString()
  assert.equal((await run('admin-document-verify', restricted, { status: 'approved', title: 'Forbidden', expiryDate }, uploaded[0].id)).status, 403)
  for (let index = 0; index < uploaded.length; index++) {
    const result = await reviewRoute(request('/api/admin/documents/' + uploaded[index].id + '/verify', manager.cookie, { status: 'approved', title: `Reviewed ${index}`, expiryDate }), { params: Promise.resolve({ id: uploaded[index].id }) })
    assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
    assert.equal((await data('customer_requests', uploadRequest._id)).status, index ? 'quote_pending' : 'document_under_review')
  }
  assert.equal((await data('customers', a.data.customerId)).accountStatus, 'active')
})

test('concurrent uploads cannot exceed quota; only uncommitted objects are cleaned up', async () => {
  await store.commit({ updates: [{ before: await store.read('customers', a.data.customerId), patch: { maxAllowedDocuments: 3 } }] })
  const before = objects.size
  const results = await Promise.all([uploadRoute(uploadHttp([pdf('race1.pdf')])), uploadRoute(uploadHttp([pdf('race2.pdf')]))])
  assert.equal(results.filter(result => result.status === 201).length, 1)
  assert.ok(results.some(result => [400, 409].includes(result.status)))
  assert.equal((await store.list('documents', 'customerId = ? AND isArchived = 0', [a.data.customerId])).length, 3)
  assert.equal(objects.size, before + 1)
  for (const item of uploaded) assert.ok(objects.has((await data('documents', item.id)).storageKey))
  assert.equal(await count('_nilelink_storage_pending'), 0)
  await store.commit({ updates: [{ before: await store.read('customers', a.data.customerId), patch: { maxAllowedDocuments: 20 } }] })
})

test('partial object-upload failure does not leave partial document metadata or untracked blobs', async () => {
  const before = await count('documents'), objectCount = objects.size
  failPutAt = putCount + 2
  try {
    const result = await uploadRoute(uploadHttp([pdf('partial1.pdf'), pdf('partial2.pdf')]))
    assert.equal(result.status, 500)
  } finally { failPutAt = null }
  assert.equal(await count('documents'), before)
  assert.equal(objects.size, objectCount)
  assert.equal(await count('_nilelink_storage_pending'), 0)
})

test('an uncertain response after metadata commits never deletes a successfully committed file', async () => {
  let failOnce = true
  const binding = { prepare: db.prepare.bind(db), async batch(statements) { const result = await db.batch(statements); if (failOnce) { failOnce = false; throw new Error('timeout after commit') } return result } }
  const uncertain = createD1WorkflowHandler(binding, { storage })
  const removedBefore = removed.length
  const result = await uncertain({ action: 'document-upload', request: uploadHttp([pdf('committed-timeout.pdf')]) })
  assert.equal(result.status, 201)
  const document = await data('documents', (await result.json()).documents[0].id)
  assert.ok(objects.has(document.storageKey))
  assert.equal(removed.length, removedBefore)
})

test('failed database reconciliation keeps new objects journaled instead of guessing whether to delete', async () => {
  let down = false
  const binding = { prepare(sql) { if (down) throw new Error('database unavailable'); return db.prepare(sql) }, async batch() { down = true; throw new Error('database unavailable before commit') } }
  const unavailable = createD1WorkflowHandler(binding, { storage })
  const removedBefore = removed.length
  const result = await unavailable({ action: 'document-upload', request: uploadHttp([pdf('requires-reconciliation.pdf')]) })
  assert.equal(result.status, 500)
  assert.equal(removed.length, removedBefore)
  const journal = (await db.prepare('SELECT storageKey FROM _nilelink_storage_pending').all()).results
  assert.equal(journal.length, 1)
  assert.ok(objects.has(journal[0].storageKey))
  assert.equal((await store.list('documents', 'storageKey = ?', [journal[0].storageKey])).length, 0)
})

test('document archive preserves the file, original metadata and immutable audit history', async () => {
  const original = await data('documents', uploaded[0].id)
  const result = await run('admin-document-delete', manager, undefined, original._id)
  assert.equal(result.status, 200)
  const archived = await data('documents', original._id)
  assert.equal(archived.isArchived, true)
  assert.equal(archived.fileHash, original.fileHash)
  assert.ok(objects.has(archived.storageKey))
  assert.ok((await store.list('document_activity_logs', 'documentId = ?', [original._id])).length >= 3)
  assert.equal((await run('document-download', a, undefined, original._id)).status, 404)
})

test('manual warnings are pending delivery, never falsely marked as sent', async () => {
  assert.equal((await run('admin-document-warning', restricted, { channel: 'email' }, uploaded[1].id)).status, 403)
  const result = await run('admin-document-warning', manager, { channel: 'multi' }, uploaded[1].id)
  assert.equal(result.status, 202)
  const note = await data('notifications', (await result.json()).notificationId)
  assert.equal(note.emailStatus, 'pending')
  assert.equal(note.whatsappStatus, 'pending')
  assert.equal(note.emailDeliveredAt, undefined)
})

test('category updates preserve nested IDs and extra source fields; only managers can change them', async () => {
  assert.equal((await run('category-create', restricted, { key: 'forbidden', nameEn: 'No', nameAr: 'ممنوع' })).status, 403)
  assert.equal((await run('category-create', manager, { key: 'extra_docs', nameEn: 'Extra', nameAr: 'إضافية' })).status, 200)
  const settings = (await store.list('system_settings'))[0]
  const custom = settings.data.documentCategories.find(category => category.key === 'extra_docs')
  await store.commit({ updates: [{ before: settings, patch: { legacyExtra: { keep: true } } }] })
  assert.equal((await run('category-update', manager, { description: 'New description' }, 'extra_docs')).status, 200)
  const after = (await store.list('system_settings'))[0].data
  assert.equal(after.documentCategories.find(category => category.key === 'extra_docs')._id, custom._id)
  assert.deepEqual(after.legacyExtra, { keep: true })
})

test('notification read state is tenant scoped and simultaneous readers do not overwrite each other', async () => {
  const shared = timestamped({ title: 'Broadcast', message: 'For customers', recipientUserId: null, recipientCustomerId: null, targetAudience: 'customer', isRead: false, readBy: [] })
  const privateB = timestamped({ title: 'Private B', recipientUserId: b.data._id, recipientCustomerId: a.data.customerId, targetAudience: 'customer', isRead: false, readBy: [] })
  await insert('notifications', shared); await insert('notifications', privateB)
  assert.equal((await run('notifications-read', a, { notificationId: privateB._id })).status, 404)
  const listing = await run('notifications-list', a, undefined, undefined, '/?limit=200')
  assert.equal((await listing.json()).notifications.some(note => note._id === privateB._id), false)
  const results = await Promise.all([run('notifications-read', a, { notificationId: shared._id }), run('notifications-read', a2, { notificationId: shared._id })])
  assert.deepEqual(results.map(result => result.status), [200, 200])
  const stored = await data('notifications', shared._id)
  assert.deepEqual(new Set(stored.readBy), new Set([a.data._id, a2.data._id]))
  assert.equal(stored.isRead, false)
  assert.deepEqual((await data('notifications', privateB._id)).readBy, [])
})

test('actual mark-all route accepts the existing empty-body client and agrees with unread counters', async () => {
  const repository = new D1AccountsRepository(db)
  assert.ok(await repository.unreadCount(a.data) > 0)
  const result = await markReadRoute(request('/api/portal/notifications/mark-read', a.cookie, undefined, 'POST'))
  assert.equal(result.status, 200)
  assert.equal(await repository.unreadCount(a.data), 0)
  assert.ok(await repository.unreadCount(b.data) > 0)
})

test('health considers expiry at the exact timestamp and foreign-key/transaction guards remain consistent', async () => {
  assert.equal(documentHealth([{ _id: 'expired', title: 'Expired now', status: 'approved', expiryDate: new Date(1000).toISOString() }], 1000).status, 'inactive')
  assert.equal(documentHealth([{ _id: 'pending', status: 'pending_review' }]).status, 'under_review')
  assert.equal(await count('_nilelink_write_guards'), 0)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  assert.equal(Object.values(await db.prepare('PRAGMA quick_check').first())[0], 'ok')
})

test('legacy stored filename downloads retain the exact source document and reject unsafe fallback paths', async () => {
  const bytes = Buffer.from('%PDF-legacy-source'), key = `clients/${a.data.customerId}/documents/legacy-original.pdf`
  const legacy = timestamped({ _id: identifier(9901), customerId: a.data.customerId, uploadedBy: a.data._id, title: 'Legacy source', storedFileName: 'legacy-original.pdf', fileName: 'original.pdf', fileSize: bytes.length, fileHash: createHash('sha256').update(bytes).digest('hex'), mimeType: 'application/pdf', status: 'approved', isArchived: false, extraSourceField: { preserve: true } })
  await insert('documents', legacy); objects.set(key, bytes)
  const before = getCount
  assert.equal((await run('document-download', b, undefined, legacy._id)).status, 404)
  assert.equal(getCount, before)
  const response = await run('document-download', a, undefined, legacy._id)
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  assert.deepEqual(await data('documents', legacy._id), legacy)
  assert.equal(Object.hasOwn(await data('documents', legacy._id), 'storageKey'), false)
  const unsafe = { ...legacy, _id: identifier(9902), storedFileName: '../escape.pdf' }
  await insert('documents', unsafe)
  const calls = getCount
  assert.equal((await run('document-download', a, undefined, unsafe._id)).status, 409)
  assert.equal(getCount, calls)
})

test('request attachments include only shipment invoices and exclude linked account documents', async()=>{
 const parent=await createRequest();
 const invoice=timestamped({customerId:a.data.customerId,entityId:parent._id,entityType:'CustomerRequest',title:'Shipment invoice',category:'other',fileName:'invoice.pdf',fileUrl:'https://example.test/invoice.pdf',status:'approved',isArchived:false});
 const account=timestamped({...invoice,_id:identifier(99981),entityId:null,entityType:'Customer',title:'Tax card',category:'tax_card'});
 const other=timestamped({...invoice,_id:identifier(99982),title:'Packing list'});
 for(const row of [invoice,account,other])await insert('documents',row);
 await store.commit({updates:[{before:await store.read('customer_requests',parent._id),patch:{details:{accountDocumentIds:[account._id]}}}]});
 const response=await run('admin-request-documents',manager,undefined,parent._id);assert.equal(response.status,200);
 assert.deepEqual((await response.json()).documents.map(d=>d.id),[invoice._id]);
})

test('unassigned staff can operate unassigned requests while other employee assignments stay protected',async()=>{
 const parent=await createRequest();
 const state=await run('admin-request-workflow',restricted,undefined,parent._id);assert.equal(state.status,200);const settings=await state.json();assert.equal(settings.canManage,true);assert.equal(settings.canAssign,false);
 const req=request('/api/admin/requests/'+parent._id+'/workflow',restricted.cookie,{revision:settings.revision,quoteRequired:false});req.headers.set('origin','http://localhost');assert.equal((await dispatch({action:'admin-request-workflow',request:req,id:parent._id})).status,200);
 assert.equal((await run('admin-request-confirm',restricted,undefined,parent._id)).status,200);
 assert.equal((await run('admin-request-workflow',a,undefined,parent._id)).status,403);
 await store.commit({updates:[{before:await store.read('customer_requests',parent._id),patch:{assignedStaffId:manager.data._id}}]});
 assert.equal((await (await run('admin-request-workflow',restricted,undefined,parent._id)).json()).canManage,false);
})

test('customer quotation list immediately reflects full and partial acceptance',async()=>{
 for(const partial of [false,true]){
  const parent=await createRequest(requestInput({services:[{serviceKey:'sea_freight'},{serviceKey:'air_freight'}]}));
  const quote=await createQuote(parent,{items:[{requestServiceId:parent.services[0],serviceKey:'sea_freight',finalPrice:100},{requestServiceId:parent.services[1],serviceKey:'air_freight',finalPrice:200}]});
  assert.equal((await run('quote-action',a,{action:'accept',acceptedServices:partial?['sea_freight']:['sea_freight','air_freight']},quote._id)).status,200);
  const list=await run('quotes-list',a);assert.equal(list.status,200);assert.equal((await list.json()).quotes.find(q=>q._id===quote._id).status,partial?'partially_accepted':'accepted');
 }
})

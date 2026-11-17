import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { WorkflowStore, timestamped } from '../../lib/workflows/runtime.ts'
import { activityFeed } from '../../lib/activity/query.ts'
import { activityStatement } from '../../lib/activity/record.ts'
import { cairoDayBoundary } from '../../lib/activity/time.ts'
import { createAccessToken, ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { D1AccountsRepository } from '../../lib/db/repositories/accounts.ts'
import { handleMailboxRequest } from '../../lib/mailbox/handler.ts'

let simulator, db, store
const originalSecret = process.env.JWT_SECRET
const admin = { _id:'activity-manager', firstName:'Mohamed', lastName:'Zanaty', username:'mohamedzanaty', email:'manager@example.test', role:'super_admin', status:'active' }
const customer = { ...admin, _id:'activity-customer', username:'customer_1', email:'customer@example.test', role:'customer_admin' }
const employee = { ...admin, _id:'activity-employee', username:'employee_1', email:'employee@example.test', role:'staff' }
async function insert(table, data) { await db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)`).bind(data._id,JSON.stringify(data)).run() }
async function request(user, query='') {
  const token = user ? await createAccessToken({ userId:user._id, email:user.email, role:user.role, firstName:user.firstName, lastName:user.lastName }) : ''
  return new Request('http://localhost/api/admin/activity'+query,{headers:token?{cookie:`${ACCESS_COOKIE_NAME}=${token}`}:{}})
}
before(async()=>{
  process.env.JWT_SECRET='activity-tests-only-secret'
  simulator=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2025-04-01',d1Databases:{DB:'activity-tests'},d1Persist:false})
  db=await simulator.getD1Database('DB');store=new WorkflowStore(db)
  await db.batch((await readD1MigrationStatements()).map(sql=>db.prepare(sql)))
  await insert('customers',{_id:'activity-company',companyName:'Activity company',commercialRegisterNumber:'ACTIVITY-CR',taxCardNumber:'ACTIVITY-TAX'})
  for(const user of [admin,customer,employee])await insert('users',user)
})
after(async()=>{await simulator?.dispose();if(originalSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=originalSecret})
test('activity is atomic, attributed from the server, safe and repeatable',async()=>{
  const workflow=new WorkflowStore(db);workflow.activity={user:customer,action:'document-upload'}
  const doc=timestamped({title:'Customer document', customerId:'activity-company', fileName:'real.pdf', password:'NEVER_LOG', secret:'NEVER_LOG', status:'pending_review'})
  await workflow.commit({inserts:[{table:'documents',data:doc}]})
  const before=(await db.prepare('SELECT count(*) AS n FROM system_audit_logs').first()).n
  await assert.rejects(workflow.commit({inserts:[{table:'documents',data:doc}]}))
  assert.equal((await db.prepare('SELECT count(*) AS n FROM system_audit_logs').first()).n,before)
  const reviewed=await store.read('documents',doc._id)
  workflow.activity={user:admin,action:'admin-document-verify'}
  await workflow.commit({updates:[{before:reviewed,patch:{status:'approved'}}]})
  await assert.rejects(workflow.commit({updates:[{before:reviewed,patch:{status:'rejected'}}]}))
  workflow.activity={user:employee,action:'admin-document-delete'}
  await workflow.commit({updates:[{before:await store.read('documents',doc._id),patch:{isArchived:true, password:'NEVER_LOG'}}]})
  const feed=await activityFeed(db,await request(admin));assert.equal(feed.status,200)
  const data=await feed.json();assert.equal(data.total,3)
  assert.equal(data.events[0].actor.id,employee._id)
  assert.equal(data.events[0].category,'delete')
  assert.deepEqual(data.events[0].changedFields,['isArchived'])
  assert.equal(data.events[0].target.label,'Customer document')
  assert.ok(!JSON.stringify(data).includes('NEVER_LOG'))
  assert.equal(data.events.find(event=>event.category==='upload').actor.role,'customer_admin')
})
test('account writes and their audit roll back together on stale revision',async()=>{
  const repository=new D1AccountsRepository(db);repository.activity={user:admin,action:'staff-update'}
  const original=await repository.findUser('id',employee._id)
  await repository.patchUser(original,{jobTitle:'Operations',passwordHash:'NEVER_LOG_HASH'})
  const before=(await db.prepare('SELECT count(*) AS n FROM system_audit_logs').first()).n
  await assert.rejects(repository.patchUser(original,{jobTitle:'Stale'}))
  assert.equal((await db.prepare('SELECT count(*) AS n FROM system_audit_logs').first()).n,before)
  const data=await (await activityFeed(db,await request(admin,'?q=employee_1'))).json()
  assert.ok(data.events.some(event=>event.action==='staff-update'))
  assert.ok(!JSON.stringify(data).includes('NEVER_LOG_HASH'))
})
test('feed rejects customers, anonymous and inactive staff and rechecks current role',async()=>{
  assert.equal((await activityFeed(db,await request(null))).status,401)
  assert.equal((await activityFeed(db,await request(customer))).status,403)
  const forged={...customer,role:'super_admin'}
  assert.equal((await activityFeed(db,await request(forged))).status,403)
  assert.equal((await activityFeed(db,await request(employee))).status,200)
  const suspended={...employee,status:'suspended'}
  await db.prepare('UPDATE users SET data=? WHERE id=?').bind(JSON.stringify(suspended),employee._id).run()
  assert.equal((await activityFeed(db,await request(employee))).status,401)
})
test('filters escape wildcards, reject invalid inputs and use Cairo dates',async()=>{
  const all=await (await activityFeed(db,await request(admin,'?category=upload&role=customer'))).json()
  assert.equal(all.total,1)
  assert.equal((await (await activityFeed(db,await request(admin,'?q=%25'))).json()).total,0)
  for(const query of ['?page=0','?page=NaN','?role=owner','?category=evil','?from=2026-02-31','?to=bad'])assert.equal((await activityFeed(db,await request(admin,query))).status,400)
  const reference=await activityStatement(db,{user:admin,action:'login'},{type:'users',id:admin._id,label:admin.username}).run()
  assert.equal(reference.success,true)
  const from=cairoDayBoundary('2026-10-28')
  assert.equal(from,'2026-10-27T21:00:00.000Z')
  assert.equal(cairoDayBoundary('2026-12-01'),'2026-11-30T22:00:00.000Z')
  assert.equal(cairoDayBoundary('2026-04-24'),'2026-04-23T22:00:00.000Z')
  const feed=await activityFeed(db,await request(admin,'?q=MOHAMED'))
  assert.equal(feed.headers.get('cache-control'),'private, no-store')
  assert.ok((await feed.json()).total>0)
})
test('mailbox profile changes persist with their audit without exposing credentials',async()=>{
  const env={MAILBOX_AGENT_URL:'https://mail.example.test',MAILBOX_AGENT_HMAC_KEY:'ab'.repeat(32),MAILBOX_ENCRYPTION_KEY:'cd'.repeat(32)}
  const overrides={db,session:{userId:admin._id,tokenType:'access'},env,gateway:async()=>({connected:true})}
  for(const action of ['connect','disconnect']) {
    const input=action==='connect'?{action,email:'employee@nilelinklogistics.com',password:'NEVER_LOG_MAILBOX'}:{action}
    const response=await handleMailboxRequest(new Request('http://localhost/api/admin/mailbox',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(input)}),overrides)
    assert.equal(response.status,200)
    const row=await db.prepare("SELECT data FROM system_audit_logs WHERE json_extract(data,'$.action')=?").bind(`mailbox-${action}`).first()
    assert.ok(row)
    assert.equal(JSON.parse(row.data).actor.id,admin._id)
    assert.ok(!row.data.includes('NEVER_LOG_MAILBOX'))
    assert.ok(!row.data.includes('ciphertext'))
  }
  assert.equal(JSON.parse((await db.prepare('SELECT data FROM users WHERE id=?').bind(admin._id).first()).data).mailbox,undefined)
})

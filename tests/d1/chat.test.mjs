import assert from 'node:assert/strict'
import { before,after,test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { chatRequest } from '../../lib/chat/handler.ts'
import { createAccessToken,ACCESS_COOKIE_NAME } from '../../lib/auth/token-service.ts'
import { chatSchema,chatTables } from '../../lib/chat/schema.mjs'
import { reviewedBackupSchema } from '../../scripts/d1/backup-schema.mjs'
import { previousShipmentSchema } from '../../lib/shipments/schema.mjs'
import { messageReceipt } from '../../lib/chat/receipts.ts'
let simulator,db,dm,secondDm,group
const old=process.env.JWT_SECRET
const actors={}
async function put(table,data){await db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)`).bind(data._id,JSON.stringify(data)).run()}
async function call(who,body,query=''){
  return chatRequest(db,new Request('http://localhost/api/chat'+query,{method:body?'POST':'GET',headers:{...(who?{cookie:actors[who].cookie}:{}),origin:'http://localhost',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}))
}
async function create(who,userIds,kind='direct',title){const response=await call(who,{action:'create',kind,userIds,...(title?{title}:{})});assert.ok([200,201].includes(response.status),JSON.stringify(await response.clone().json()));return(await response.json()).id}
async function send(who,room,text,key=randomUUID(),replyTo){return call(who,{action:'send',conversationId:room,text,clientMessageId:key,...(replyTo?{replyTo}:{})})}
before(async()=>{
  process.env.JWT_SECRET='chat-tests-secret-only'
  simulator=new Miniflare({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2025-04-01',d1Databases:{DB:'chat-tests'},d1Persist:false})
  db=await simulator.getD1Database('DB');await db.batch((await readD1MigrationStatements()).map(sql=>db.prepare(sql)))
  for(const id of ['company-a','company-b'])await put('customers',{_id:id,companyName:id})
  for(const [id,role,company] of [['manager','super_admin'],['employee','staff'],['employee-2','staff'],['employee-3','staff'],['alice','customer_admin','company-a'],['bob','customer_admin','company-b']]){
    const data={_id:id,email:id+'@example.test',username:id,firstName:id,lastName:'Account',role,status:'active',...(company?{customerId:company}:{})}
    await put('users',data);actors[id]={data,cookie:`${ACCESS_COOKIE_NAME}=${await createAccessToken({userId:id,email:data.email,firstName:id,lastName:'Account',role})}`}
  }
})
after(async()=>{await simulator?.dispose();if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old})
test('directory and conversation creation enforce staff/customer separation',async()=>{
  assert.equal((await call(null)).status,401)
  assert.equal((await call('alice',undefined,'?action=directory')).status,403)
  const directory=await(await call('manager',undefined,'?action=directory')).json()
  assert.ok(directory.people.some(p=>p.id==='alice'));assert.ok(!JSON.stringify(directory).includes('@example.test'))
  const staff=await(await call('manager',undefined,'?action=directory&group=true')).json()
  assert.ok(staff.people.every(p=>['staff','super_admin'].includes(p.role)))
  assert.equal((await call('alice',{action:'create',kind:'direct',userIds:['manager']})).status,403)
  assert.equal((await call('manager',{action:'create',kind:'group',title:'Client group',userIds:['alice']})).status,400)
  dm=await create('manager',['alice']);assert.equal(await create('manager',['alice']),dm)
  secondDm=await create('employee',['alice'])
  group=await create('manager',['employee','employee-2'],'group','Operations')
  assert.notEqual(group,await create('manager',['employee'],'group','Finance'))
})
test('customer inbox has separate conversations per employee and no internal groups',async()=>{
  const inbox=await(await call('alice')).json()
  assert.equal(inbox.conversations.length,2)
  assert.ok(inbox.conversations.every(room=>room.kind==='direct'))
  assert.equal((await(await call('bob')).json()).conversations.length,0)
  for(const id of [dm,group])assert.equal((await call('bob',undefined,`?action=messages&conversationId=${id}`)).status,404)
  assert.equal((await call('alice',undefined,`?action=messages&conversationId=${group}`)).status,404)
})
test('message retries are idempotent, sender identity is server derived and replies remain private',async()=>{
  const key=randomUUID(),first=await send('manager',dm,'Hello Alice',key)
  assert.equal(first.status,201);const message=(await first.json()).message
  assert.equal(message.sender.id,'manager')
  assert.equal((await send('manager',dm,'Hello Alice',key)).status,200)
  assert.equal((await send('manager',dm,'Changed content',key)).status,409)
  const reply=await send('alice',dm,'Thanks',randomUUID(),message._id);assert.equal(reply.status,201)
  assert.equal((await reply.json()).message.replyTo.id,message._id)
  assert.equal((await send('employee',secondDm,'Cross room',randomUUID(),message._id)).status,400)
  assert.equal((await call('alice',{action:'send',conversationId:dm,text:'spoof',clientMessageId:randomUUID(),senderId:'manager'})).status,400)
  assert.equal((await send('bob',dm,'not a member')).status,404)
  assert.equal((await send('alice',dm,' '.repeat(10))).status,400)
  assert.equal((await send('alice',dm,'x'.repeat(4001))).status,400)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM chat_messages WHERE conversationId=?').bind(dm).first()).n,2)
})
test('concurrent sends retain ordered unique messages and safe retry IDs',async()=>{
  const keys=[randomUUID(),randomUUID()]
  const results=await Promise.all([send('manager',dm,'First concurrent',keys[0]),send('alice',dm,'Second concurrent',keys[1])])
  for(let i=0;i<2;i++){assert.ok([201,409].includes(results[i].status));if(results[i].status===409)assert.ok([200,201].includes((await send(i?'alice':'manager',dm,i?'Second concurrent':'First concurrent',keys[i])).status))}
  const data=await(await call('alice',undefined,`?action=messages&conversationId=${dm}`)).json()
  assert.deepEqual(data.messages.map(m=>m.sequence),[1,2,3,4])
  assert.equal(new Set(data.messages.map(m=>m._id)).size,4)
})
test('unread counts and read receipts are per member and never move backwards',async()=>{
  const before=await(await call('alice',undefined,'?action=unread')).json();assert.ok(before.unread>=0)
  assert.equal((await call('alice',{action:'read',conversationId:dm,sequence:4})).status,200)
  assert.equal((await call('alice',{action:'read',conversationId:dm,sequence:2})).status,200)
  const member=await db.prepare('SELECT data FROM chat_members WHERE conversationId=? AND userId=?').bind(dm,'alice').first()
  assert.equal(JSON.parse(member.data).lastReadSequence,4)
  assert.equal((await call('alice',{action:'read',conversationId:dm,sequence:999})).status,400)
  const thread=await(await call('manager',undefined,`?action=messages&conversationId=${dm}&after=2`)).json()
  assert.deepEqual(thread.messages.map(m=>m.sequence),[3,4]);assert.equal(thread.readBy.find(m=>m.userId==='alice').sequence,4)
})
test('lost response after commit resolves to the same message without a duplicate send',async()=>{
  const key=randomUUID()
  const ambiguous={prepare:db.prepare.bind(db),async batch(statements){await db.batch(statements);throw Error('Simulated response loss after commit')}}
  const response=await chatRequest(ambiguous,new Request('http://localhost/api/chat',{method:'POST',headers:{origin:'http://localhost',cookie:actors.manager.cookie,'content-type':'application/json'},body:JSON.stringify({action:'send',conversationId:dm,text:'Exactly once',clientMessageId:key})}))
  assert.equal(response.status,200);assert.equal((await response.json()).replayed,true)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM chat_messages WHERE senderId=? AND clientMessageId=?').bind('manager',key).first()).n,1)
})
test('message history and incremental cursors return bounded ordered pages',async()=>{
  const id=await create('manager',['employee-2'])
  const statements=[]
  for(let sequence=1;sequence<=60;sequence++){
    const message={_id:`pagination-${sequence}`,conversationId:id,senderId:'manager',sender:{id:'manager',name:'Manager'},sequence,text:`Message ${sequence}`,clientMessageId:randomUUID(),createdAt:new Date().toISOString()}
    statements.push(db.prepare('INSERT INTO chat_messages(id,data) VALUES(?,?)').bind(message._id,JSON.stringify(message)))
  }
  statements.push(db.prepare("UPDATE chat_conversations SET data=json_set(data,'$.lastSequence',60) WHERE id=?").bind(id));await db.batch(statements)
  const latest=await(await call('employee-2',undefined,`?action=messages&conversationId=${id}`)).json()
  assert.equal(latest.messages.length,50);assert.equal(latest.messages[0].sequence,11);assert.equal(latest.messages.at(-1).sequence,60)
  const older=await(await call('employee-2',undefined,`?action=messages&conversationId=${id}&before=11`)).json()
  assert.deepEqual(older.messages.map(m=>m.sequence),[1,2,3,4,5,6,7,8,9,10])
  const incremental=await(await call('employee-2',undefined,`?action=messages&conversationId=${id}&after=5`)).json()
  assert.equal(incremental.messages[0].sequence,6);assert.equal(incremental.messages.at(-1).sequence,55)
  assert.equal((await call('employee-2',undefined,`?action=messages&conversationId=${id}&after=-1`)).status,400)
})
test('receipts distinguish offline, delivered without opening, and actually read',async()=>{
  const response=await send('manager',dm,'Receipt lifecycle'),message=(await response.json()).message
  const state=async()=>{const thread=await(await call('manager',undefined,`?action=messages&conversationId=${dm}`)).json();return messageReceipt(message.sequence,message.senderId,thread.readBy,message.recipientIds)}
  assert.deepEqual(message.recipientIds,['alice'])
  assert.equal(await state(),'sent')
  const before=await db.prepare('SELECT data FROM chat_members WHERE conversationId=? AND userId=?').bind(dm,'alice').first()
  const checkpoint=(await(await call('alice',undefined,'?action=unread')).json()).deliveryReceipts.find(item=>item.conversationId===dm)
  assert.equal(checkpoint.sequence,message.sequence)
  // Merely fetching the inbox doesn't falsely acknowledge a failed response.
  assert.equal(await state(),'sent')
  assert.equal((await call('manager',{action:'delivered',receipts:[checkpoint]})).status,200)
  assert.equal(await state(),'sent','Sender cannot acknowledge for the recipient')
  assert.equal((await call('bob',{action:'delivered',receipts:[checkpoint]})).status,404)
  assert.equal((await call('alice',{action:'delivered',receipts:[checkpoint],userId:'bob'})).status,400)
  assert.equal((await call('alice',{action:'delivered',receipts:[{...checkpoint,sequence:message.sequence+1}]})).status,400)
  assert.equal((await call('alice',{action:'delivered',receipts:[checkpoint]})).status,200)
  assert.equal(await state(),'delivered')
  const delivered=JSON.parse((await db.prepare('SELECT data FROM chat_members WHERE conversationId=? AND userId=?').bind(dm,'alice').first()).data)
  assert.equal(delivered.lastReadSequence,JSON.parse(before.data).lastReadSequence)
  const inbox=(await(await call('alice')).json()).conversations.find(item=>item.id===dm)
  assert.ok(inbox.unread>0,'Delivery must not mark the conversation read')
  assert.equal((await call('alice',{action:'delivered',receipts:[{...checkpoint,sequence:message.sequence-1}]})).status,200)
  assert.equal(await state(),'delivered')
  assert.equal((await call('alice',{action:'read',conversationId:dm,sequence:message.sequence})).status,200)
  assert.equal(await state(),'read')
  const next=(await(await send('manager',dm,'Sent while recipient has closed the app')).json()).message
  let thread=await(await call('manager',undefined,`?action=messages&conversationId=${dm}`)).json()
  assert.equal(messageReceipt(next.sequence,next.senderId,thread.readBy,next.recipientIds),'sent')
  assert.equal(messageReceipt(message.sequence,message.senderId,thread.readBy,message.recipientIds),'read','Closing an account never erases earlier receipts')
  assert.equal((await call('alice',{action:'read',conversationId:dm,sequence:next.sequence})).status,200)
  thread=await(await call('manager',undefined,`?action=messages&conversationId=${dm}`)).json()
  assert.ok(thread.readBy.find(item=>item.userId==='alice').deliveredSequence>=next.sequence,'Reading implies delivery')
})
test('group double ticks require all original recipients, not just one reader or a later member',async()=>{
  const message=(await(await send('manager',group,'Group receipt lifecycle')).json()).message
  const checkpoint={conversationId:group,sequence:message.sequence}
  const state=async()=>{const data=await(await call('manager',undefined,`?action=messages&conversationId=${group}`)).json();return messageReceipt(message.sequence,'manager',data.readBy,message.recipientIds)}
  assert.deepEqual([...message.recipientIds].sort(),['employee','employee-2'])
  assert.equal((await call('employee',{action:'delivered',receipts:[checkpoint]})).status,200)
  assert.equal(await state(),'sent')
  assert.equal((await call('employee-2',{action:'delivered',receipts:[checkpoint]})).status,200)
  assert.equal(await state(),'delivered')
  assert.equal((await call('employee',{action:'read',conversationId:group,sequence:message.sequence})).status,200)
  assert.equal(await state(),'delivered')
  assert.equal((await call('employee-2',{action:'read',conversationId:group,sequence:message.sequence})).status,200)
  assert.equal(await state(),'read')
  assert.equal((await call('manager',{action:'manage',conversationId:group,add:['employee-3']})).status,200)
  assert.equal(await state(),'read')
})
test('invalid or revoked delivery batches cannot partially advance acknowledgements',async()=>{
  const message=(await(await send('manager',dm,'Atomic receipt')).json()).message
  const before=JSON.parse((await db.prepare('SELECT data FROM chat_members WHERE conversationId=? AND userId=?').bind(dm,'alice').first()).data)
  assert.equal((await call('alice',{action:'delivered',receipts:[{conversationId:dm,sequence:message.sequence},{conversationId:group,sequence:1}]})).status,404)
  assert.equal(JSON.parse((await db.prepare('SELECT data FROM chat_members WHERE conversationId=? AND userId=?').bind(dm,'alice').first()).data).lastDeliveredSequence,before.lastDeliveredSequence)
  await db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=?').bind(JSON.stringify({...actors.alice.data,status:'suspended'}),'alice').run()
  assert.equal((await call('alice',{action:'delivered',receipts:[{conversationId:dm,sequence:message.sequence}]})).status,401)
  await db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(actors.alice.data),'alice').run()
})
test('rejoining a group skips old unread counts without inventing read receipts',async()=>{
  const message=(await(await send('manager',group,'Unread before rejoining')).json()).message
  assert.equal((await call('manager',{action:'manage',conversationId:group,remove:['employee-2']})).status,200)
  assert.equal((await call('manager',{action:'manage',conversationId:group,add:['employee-2']})).status,200)
  const thread=await(await call('manager',undefined,`?action=messages&conversationId=${group}`)).json()
  assert.ok(thread.readBy.find(item=>item.userId==='employee-2').sequence<message.sequence)
  assert.equal((await(await call('employee-2')).json()).conversations.find(item=>item.id===group).unread,0)
})
test('group ownership, member removal and role revocation are enforced immediately',async()=>{
  assert.equal((await call('employee',{action:'manage',conversationId:group,title:'Unauthorized'})).status,403)
  assert.equal((await call('manager',{action:'manage',conversationId:group,add:['alice']})).status,400)
  assert.equal((await call('manager',{action:'manage',conversationId:group,remove:['manager']})).status,400)
  assert.equal((await call('manager',{action:'manage',conversationId:group,title:'Operations updated',remove:['employee-2']})).status,200)
  assert.equal((await send('employee-2',group,'Removed')).status,404)
  const revoked={...actors.employee.data,role:'customer_admin'}
  await db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(revoked),'employee').run()
  assert.equal((await call('employee',undefined,`?action=messages&conversationId=${group}`)).status,404)
  assert.equal((await call('employee',undefined,'?action=directory')).status,403)
  assert.equal((await call('alice',undefined,`?action=messages&conversationId=${secondDm}`)).status,404)
  assert.ok(!(await(await call('alice')).json()).conversations.some(room=>room.id===secondDm))
})
test('reviewed backup schema includes chat and refuses partial or arbitrary additions',async()=>{
  const ddl=(await readD1MigrationStatements()).filter(sql=>!previousShipmentSchema.includes(sql) && !sql.startsWith('ALTER TABLE shipment_records '))
  assert.deepEqual(ddl.slice(-chatSchema.length),chatSchema)
  const tables=ddl.map(sql=>/^CREATE TABLE ([a-z_]+)\s*\(/.exec(sql)?.[1]).filter(Boolean).map(name=>({name,columns:['id','data','revision']}))
  const base={ddl:ddl.slice(0,-chatSchema.length),tables:tables.filter(t=>!chatTables.includes(t.name))}
  assert.equal(reviewedBackupSchema(base,ddl).tables.length,26)
  assert.equal(reviewedBackupSchema({...base,ddl,tables},base.ddl).tables.length,23)
  assert.throws(()=>reviewedBackupSchema(base,[...base.ddl,chatSchema[0]]))
  assert.throws(()=>reviewedBackupSchema(base,[...base.ddl,'CREATE TABLE unknown_table(id TEXT)']))
})

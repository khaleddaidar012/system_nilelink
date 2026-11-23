import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createQuickQuoteHandler} from '../../lib/public/quick-quote.ts'

const key='f5816e3c-2f17-46c5-82a1-b1ec04a17c49'
const data={from:'دمياط',to:'Rotterdam',shipmentType:'FCL 40’ HC',phone:'+20 100 001 8549'}
const request=(body=data,id=key)=>new Request('https://preview.test/api/quick-quote',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:typeof body==='string'?body:JSON.stringify(body)})

test('accepts four real fields, waits for receiver and sends no invented identity',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve}),messages=[]
 const handler=createQuickQuoteHandler(async message=>{messages.push(message);await gate;return 'test-receipt'})
 let completed=false;const response=handler(request()).then(value=>{completed=true;return value})
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(completed,false);release()
 assert.equal((await response).status,200);assert.equal(messages.length,1)
 assert.match(messages[0].text,/Origin: دمياط/);assert.match(messages[0].text,/Phone: \+20 100 001 8549/)
 assert.doesNotMatch(messages[0].text,/Name:|Email:/)
})
test('rejects missing, whitespace, oversized, unexpected fields and invalid phone without dispatch',async()=>{
 let sends=0;const handler=createQuickQuoteHandler(async()=>{sends++;return 'receipt'})
 for(const body of [{...data,to:''},{...data,from:'  '},{...data,shipmentType:'x'.repeat(101)},{...data,phone:'abc1234567'},{...data,email:'invented@example.test'},{from:'x'}])assert.equal((await handler(request(body))).status,400)
 assert.equal(sends,0)
})
test('rejects malformed JSON, oversized body and invalid idempotency key',async()=>{
 const handler=createQuickQuoteHandler(async()=>{throw Error('must not dispatch')})
 assert.equal((await handler(request('{'))).status,400)
 assert.equal((await handler(request(' '.repeat(4097)))).status,413)
 assert.equal((await handler(request(data,'invalid'))).status,400)
})
test('escapes HTML while preserving requester data in plain text',async()=>{
 let captured;const handler=createQuickQuoteHandler(async message=>{captured=message;return 'receipt'})
 assert.equal((await handler(request({...data,to:'<img src=x onerror=alert(1)>'}))).status,200)
 assert.doesNotMatch(captured.html,/<img/);assert.match(captured.html,/&lt;img/);assert.match(captured.text,/<img/)
})
test('provider failure and missing/mock receipts never report success or expose errors',async()=>{
 for(const deliver of [async()=>{throw Error('secret-key')},async()=>'',async()=>'mock-id-dev',async()=>{throw new SyntaxError('provider JSON')}]){
 const response=await createQuickQuoteHandler(deliver)(request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{success:false,code:'DELIVERY_UNAVAILABLE'})
 }
})
test('same submitted request keeps its provider deduplication key; changed payload differs',async()=>{
 const keys=[];const receiver=new Set();const handler=createQuickQuoteHandler(async message=>{keys.push(message.idempotencyKey);receiver.add(message.idempotencyKey);return 'receipt'})
 await handler(request());await handler(request());assert.equal(keys[0],keys[1]);assert.equal(receiver.size,1)
 await handler(request({...data,to:'Alexandria'}));assert.notEqual(keys[0],keys[2])
})
test('accepts Arabic phone digits and never returns submitted PII',async()=>{
 const response=await createQuickQuoteHandler(async()=>'receipt')(request({...data,phone:'+٢٠١٠٠٠٠١٨٥٤٩'}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{success:true})
})

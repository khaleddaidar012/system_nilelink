import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Miniflare } from 'miniflare'
import { readD1MigrationStatements } from '../../scripts/d1/migrations.mjs'
import { newCustomerCode, ensureCustomerCode, newRequestNumber, newInvoiceReference } from '../../lib/references/numbering.ts'

test('customer hierarchy backfills deterministically and reservations isolate tenants and survive concurrency', async () => {
  const simulator = new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2025-04-01',d1Databases:{DB:'references'}})
  try {
    const db = await simulator.getD1Database('DB')
    await db.batch((await readD1MigrationStatements()).map(sql=>db.prepare(sql)))
    const insert=async(table,data)=>db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)`).bind(data._id,JSON.stringify(data)).run()
    const read=async(table,id)=>{const r=await db.prepare(`SELECT data,revision FROM ${table} WHERE id=?`).bind(id).first();return {id,revision:r.revision,data:JSON.parse(r.data)}}
    await insert('customers',{_id:'c1',companyName:'First',createdAt:'2026-01-01T00:00:00Z'})
    await insert('customers',{_id:'c2',companyName:'Second',createdAt:'2026-01-02T00:00:00Z'})
    await insert('customer_requests',{_id:'r1',customerId:'c1',trackingNumber:'NL-REQ-2026-000008',createdAt:'2026-02-01'})
    await insert('customer_requests',{_id:'r2',customerId:'c1',trackingNumber:'NL-REQ-2026-000009',createdAt:'2026-02-02'})
    await insert('customer_requests',{_id:'r3',customerId:'c2',trackingNumber:'NL-REQ-2026-000010',createdAt:'2026-02-03'})
    for (const [id,customerId,requestId] of [['i1','c1','r1'],['i2','c1','r2'],['i3','c2','r3']]) {
      await insert('invoices',{_id:id,customerId,relatedRequestId:requestId,invoiceNumber:`INV-${id}`,status:'confirmed',totalAmount:100,token:`token-${id}`,createdAt:'2026-02-04',shipmentAccounting:{publications:[{invoiceNumber:`INV-${id}`,total:'100.00'}]}})
    }
    const sql=await readFile(new URL('../../migrations/d1/0011_customer_references.sql',import.meta.url),'utf8')
    const migrate=()=>db.batch(sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)))
    await migrate()
    assert.equal((await read('customers','c1')).data.customerCode,'NL20260001')
    assert.equal((await read('customers','c2')).data.customerCode,'NL20260002')
    assert.equal((await read('customer_requests','r2')).data.trackingNumber,'NL20260001-2')
    assert.equal((await read('customer_requests','r1')).data.legacyTrackingNumber,'NL-REQ-2026-000008')
    const original=await read('invoices','i1')
    assert.equal(original.data.referenceNumber,'NL20260001-1-I1')
    assert.equal((await read('invoices','i2')).data.referenceNumber,'NL20260001-2-I1')
    assert.equal(original.data.invoiceNumber,'INV-i1')
    assert.equal(original.data.token,'token-i1')
    assert.equal(original.data.totalAmount,100)
    assert.equal(original.data.shipmentAccounting.publications[0].invoiceNumber,'INV-i1')
    await migrate()
    assert.deepEqual(await read('invoices','i1'),original)
    const customer=await read('customers','c1'), other=await read('customers','c2')
    const requests=await Promise.all(Array.from({length:8},()=>newRequestNumber(db,customer)))
    assert.equal(new Set(requests.map(r=>r.trackingNumber)).size,8)
    assert.deepEqual(requests.map(r=>r.requestSequence).sort((a,b)=>a-b),[3,4,5,6,7,8,9,10])
    assert.equal((await newRequestNumber(db,other)).trackingNumber,'NL20260002-2')
    assert.equal((await newInvoiceReference(db,customer,await read('customer_requests','r1'))).referenceNumber,'NL20260001-1-I2')
    assert.equal((await newInvoiceReference(db,customer,await read('customer_requests','r2'))).referenceNumber,'NL20260001-2-I2')
    const parent=await read('customer_requests','r1')
    const invoices=await Promise.all(Array.from({length:4},()=>newInvoiceReference(db,customer,parent)))
    assert.equal(new Set(invoices.map(row=>row.referenceNumber)).size,4)
    assert.deepEqual(invoices.map(row=>row.invoiceSequence).sort((a,b)=>a-b),[3,4,5,6])
    await assert.rejects(newInvoiceReference(db,other,await read('customer_requests','r1')),/mismatch/)
    assert.equal((await newCustomerCode(db,2026)).customerCode,'NL20260003')
    assert.equal((await newCustomerCode(db,2027)).customerCode,'NL20270001')
    await insert('customers',{_id:'c3',companyName:'Imported',createdAt:'2026-03-01'})
    const snapshots=await Promise.all([read('customers','c3'),read('customers','c3')])
    const codes=await Promise.all(snapshots.map(c=>ensureCustomerCode(db,c)))
    assert.equal(codes[0],codes[1])
    assert.equal(snapshots[0].revision,1)
  } finally { await simulator.dispose() }
})

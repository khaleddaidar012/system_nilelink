import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Miniflare} from 'miniflare'
import {readD1MigrationStatements} from '../../scripts/d1/migrations.mjs'
import {taxReferenceKey,taxCustomerReference} from '../../lib/references/tax-reference.ts'
import {newRequestNumber,newInvoiceReference,ensureCustomerCode} from '../../lib/references/numbering.ts'

test('tax references normalize comparison without discarding displayed formatting or leading zeroes',()=>{
 assert.equal(taxReferenceKey(' ٠١٢-٣٤٥ ٦٧٨ '),'012345678')
 assert.equal(taxReferenceKey('۰۱۲-۳۴۵-۶۷۸'),'012345678')
 assert.equal(taxCustomerReference(' 012-345-678 ').customerCode,'012-345-678')
 assert.throws(()=>taxCustomerReference(' - '))
})
test('tax migration preserves original invoices, relationships and aliases and prevents duplicate tax references',async()=>{
 const sim=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2025-04-01',d1Databases:{DB:'tax-references'}})
 try{
  const db=await sim.getD1Database('DB');await db.batch((await readD1MigrationStatements()).map(sql=>db.prepare(sql)))
  const insert=(table,data)=>db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?)`).bind(data._id,JSON.stringify(data)).run()
  const read=async(table,id)=>{const row=await db.prepare(`SELECT data,revision FROM ${table} WHERE id=?`).bind(id).first();return{id,revision:row.revision,data:JSON.parse(row.data)}}
  await insert('customers',{_id:'c1',companyName:'First',taxCardNumber:'012-345-678',customerCode:'NL20260001'})
  await insert('customers',{_id:'c2',companyName:'Second',taxCardNumber:'٩٨٧٦٥٤٣٢١',customerCode:'NL20260002'})
  await insert('customer_requests',{_id:'r1',customerId:'c1',customerCode:'NL20260001',requestSequence:3,trackingNumber:'NL20260001-3',legacyTrackingNumber:'NL-REQ-2026-000003'})
  const original={_id:'i1',customerId:'c1',relatedRequestId:'r1',numberingRequestId:'r1',customerCode:'NL20260001',invoiceSequence:2,invoiceNumber:'INV-2026-000001',referenceNumber:'NL20260001-3-I2',token:'existing-token',totalAmount:15000,paidAmount:500,remainingAmount:14500,shipmentAccounting:{publications:[{invoiceNumber:'INV-2026-000001',total:'15000.00'}]}}
  await insert('invoices',original)
  const sql=await readFile(new URL('../../migrations/d1/0012_tax_customer_references.sql',import.meta.url),'utf8')
  const migrate=()=>db.batch(sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)))
  await migrate()
  const first=await read('customers','c1');assert.equal(first.data.customerCode,'012-345-678');assert.equal(first.data.legacyCustomerCode,'NL20260001')
  const request=await read('customer_requests','r1');assert.equal(request.data.trackingNumber,'012-345-678-3');assert.equal(request.data.legacyTrackingNumber,'NL-REQ-2026-000003');assert.deepEqual(request.data.previousTrackingNumbers,['NL20260001-3'])
  const invoice=await read('invoices','i1');assert.equal(invoice.data.referenceNumber,'012-345-678-3-I2');assert.deepEqual(invoice.data.previousReferenceNumbers,['NL20260001-3-I2'])
  for(const key of ['_id','customerId','relatedRequestId','numberingRequestId','invoiceSequence','invoiceNumber','token','totalAmount','paidAmount','remainingAmount','shipmentAccounting'])assert.deepEqual(invoice.data[key],original[key])
  await migrate();assert.deepEqual(await read('invoices','i1'),invoice)
  assert.equal((await newRequestNumber(db,first)).trackingNumber,'012-345-678-4')
  assert.equal((await newInvoiceReference(db,first,request)).referenceNumber,'012-345-678-3-I3')
  await insert('customers',{_id:'duplicate',companyName:'Duplicate',taxCardNumber:'٠١٢٣٤٥٦٧٨',customerCode:'NL20260003'})
  const duplicate=await read('customers','duplicate')
  await assert.rejects(migrate());assert.deepEqual(await read('customers','duplicate'),duplicate)
  await assert.rejects(ensureCustomerCode(db,duplicate));assert.deepEqual(await read('customers','duplicate'),duplicate)
 }finally{await sim.dispose()}
})

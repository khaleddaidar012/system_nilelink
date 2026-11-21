import test from 'node:test'
import assert from 'node:assert/strict'
import {accountHealth,accountDocumentStats,effectiveAccountDocuments,expiryInstant,complianceState} from '../../lib/compliance/account-health.ts'
const now=Date.parse('2026-11-21T12:00:00Z'),doc=(category,status='approved',extra={})=>({_id:category,category,status,title:category,expiryDate:'2027-11-21',...extra})
test('account health and counts use effective company documents, not request files or stale copies',()=>{
 const docs=[doc('commercial_register'),doc('tax_card'),doc('commercial_register','expired',{_id:'old',expiryDate:'2020-01-01'}),doc('tax_card','pending_review',{_id:'renew'}),doc('other','expired',{entityType:'CustomerRequest',expiryDate:'4026-01-01'}),doc('license','rejected')]
 assert.equal(accountHealth(docs,{},now).status,'active');assert.equal(accountDocumentStats(docs,now).expiredDocs,0);assert.equal(effectiveAccountDocuments(docs,now).length,3)
 assert.equal(accountHealth(docs,{accountStatus:'inactive',administrativeHold:true,statusReason:'Staff hold'},now).reason,'Staff hold')
 assert.equal(accountHealth([doc('commercial_register','approved',{expiryDate:'2020-01-01'}),doc('tax_card')],{},now).status,'inactive')
 assert.equal(accountHealth([doc('tax_card','pending_review')],{},now).status,'under_review')
 assert.equal(accountHealth([doc('tax_card','approved',{expiryDate:'4026-01-01'})],{},now).status,'under_review')
 assert.equal(complianceState(doc('tax_card','approved',{expiryDate:'bad'}),now),'pending_review')
 assert.equal(expiryInstant({expiryDate:'2026-11-21'}),Date.parse('2026-11-21T21:59:59.999Z'))
 assert.equal(expiryInstant({expiryDate:'2026-07-21'}),Date.parse('2026-07-21T20:59:59.999Z'))
 assert.ok(Number.isNaN(expiryInstant({expiryDate:'2026-02-30'})))
})

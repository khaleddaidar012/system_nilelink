import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {costSchema,emptyAccounting,totals,customerInvoiceGroups,customerSaleItems,draftBusinessKey,tierSubtotal} from '../../lib/shipments/accounting.ts'
import {LineSalePrice} from '../../components/admin/shipments/LineSalePrice.tsx'
const cost=(patch={})=>({id:randomUUID(),description:'نولون',amount:'12000',currency:'EGP',exchangeRate:'1',notes:'PRIVATE',...patch})

test('tier prices sum exact decimal subtotals without exposing internal costs',()=>{
 const draft=emptyAccounting().draft;draft.pricingMode='per-item-v1'
 draft.stages.transportation.costs=[cost({amount:'4000',isTiered:true,saleEqualsCost:false,tiers:[{label:'Day 1',quantity:'1',unitPrice:'500'},{label:'Days 2-5',quantity:'4',unitPrice:'750'},{label:'Days 6+',quantity:'3',unitPrice:'1200'}]})]
 assert.equal(totals(draft,'EGP').customerTotal,'7100.00');assert.equal(totals(draft,'EGP').expectedProfit,'3100.00')
 assert.equal(tierSubtotal({label:'Fractional quantity',quantity:'1.25',unitPrice:'0.10'}),'0.13')
 const groups=customerInvoiceGroups(draft,'EGP');assert.equal(groups[0].items[0].tiers[1].subtotal,'3000.00');assert.ok(!JSON.stringify(groups).includes('4000'));assert.ok(!JSON.stringify(groups).includes('PRIVATE'))
 assert.equal(costSchema.safeParse(cost({isTiered:true,tiers:[]})).success,false)
 assert.throws(()=>tierSubtotal({label:'Invalid',quantity:'0',unitPrice:'1'}))
 const previous=draftBusinessKey(draft);draft.stages.transportation.costs[0].tiers[0].unitPrice='501';assert.notEqual(draftBusinessKey(draft),previous)
})
test('line pricing defaults to cost, supports overrides and reconciles customer groups with invoice total',()=>{
 const draft=emptyAccounting().draft;draft.pricingMode='per-item-v1';draft.internalSellingPrice='999999'
 draft.stages.shipping.costs=[cost({saleEqualsCost:false,sellingPrice:'15000'})]
 draft.stages.transportation.costs=[cost({description:'نقل',amount:'1000',saleEqualsCost:true,sellingPrice:'7'})]
 draft.stages.customs.costs=[cost({description:'تخليص',amount:'200',currency:'USD',exchangeRate:'50',saleEqualsCost:false,sellingPrice:'250'})]
 const summary=totals(draft,'EGP');assert.equal(summary.customerTotal,'28500.00');assert.equal(summary.totalCosts,'23000.00');assert.equal(summary.expectedProfit,'5500.00')
 const groups=customerInvoiceGroups(draft,'EGP');assert.deepEqual(groups.map(g=>g.total),['15000.00','1000.00','12500.00'])
 assert.equal(customerSaleItems(draft,'EGP').reduce((sum,row)=>sum+Number(row.amount),0),28500)
 assert.ok(!JSON.stringify(groups).includes('PRIVATE'));assert.ok(!JSON.stringify(groups).includes('12000'))
 const before=draftBusinessKey(draft);draft.stages.shipping.costs[0].sellingPrice='15100';assert.notEqual(draftBusinessKey(draft),before)
 draft.stages.shipping.costs[0].sellingPrice='10000';assert.equal(totals(draft,'EGP').expectedProfit,'500.00')
})
test('disabled manual sale requires a valid explicit price, while automatic sale ignores stale overrides',()=>{
 assert.equal(costSchema.safeParse(cost({saleEqualsCost:false})).success,false)
 for(const sellingPrice of ['','-1','1.001','1e4'])assert.equal(costSchema.safeParse(cost({saleEqualsCost:false,sellingPrice})).success,false)
 assert.equal(costSchema.safeParse(cost({saleEqualsCost:false,sellingPrice:'0'})).success,true)
 const draft=emptyAccounting().draft;draft.pricingMode='per-item-v1';draft.stages.shipping.costs=[cost({amount:'0.01',currency:'USD',exchangeRate:'1.5',saleEqualsCost:false,sellingPrice:'0.03'})]
 assert.equal(totals(draft,'EGP').customerTotal,'0.05')
 draft.stages.shipping.costs[0].saleEqualsCost=true;assert.equal(totals(draft,'EGP').customerTotal,'0.02')
})
test('sale entry is disabled and checked by default, and enables an independent customer price',()=>{
 for(const ar of [true,false]){
  const automatic=renderToStaticMarkup(createElement(LineSalePrice,{cost:cost(),ar,disabled:false,onChange(){}}))
  assert.match(automatic,/<input[^>]*inputMode="decimal"[^>]*value="12000"/)
  assert.match(automatic,/<input[^>]*disabled=""/);assert.match(automatic,/checked=""/)
  const manual=renderToStaticMarkup(createElement(LineSalePrice,{cost:cost({saleEqualsCost:false,sellingPrice:'15000'}),ar,disabled:false,onChange(){}}))
  assert.ok(!manual.includes('disabled=""'));assert.ok(!manual.includes('checked=""'));assert.match(manual,/value="15000"/)
 }
})

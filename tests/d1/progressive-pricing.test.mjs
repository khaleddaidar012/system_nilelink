import {test} from 'node:test'
import assert from 'node:assert/strict'
import {calculateProgressivePricing,progressivePricingSchema,priceQuoteRows} from '../../lib/finance/progressive-pricing.ts'
const pricing=(quantity=5,unit='shipment')=>({unit,quantity,tiers:[{from:1,to:1,unitPrice:'5000'},{from:2,to:null,unitPrice:'1000'}]})
test('first shipment and every later shipment use the configured rates independently',()=>{
 assert.equal(calculateProgressivePricing(pricing()).total,'9000.00')
 assert.deepEqual(calculateProgressivePricing(pricing()).tiers.map(tier=>tier.quantity),[1,4])
 const first=calculateProgressivePricing(pricing(1));assert.equal(first.total,'5000.00');assert.equal(first.tiers[1].quantity,0);assert.equal(first.tiers[1].unitPrice,'1000')
})
test('days, overnight stays and multiple consecutive brackets are priced exactly',()=>{
 const overnight={unit:'night',quantity:4,tiers:[{from:1,to:1,unitPrice:'200'},{from:2,to:null,unitPrice:'50'}]}
 assert.equal(calculateProgressivePricing(overnight).total,'350.00')
 assert.equal(calculateProgressivePricing({unit:'day',quantity:7,tiers:[{from:1,to:2,unitPrice:'500'},{from:3,to:5,unitPrice:'300'},{from:6,to:null,unitPrice:'100'}]}).total,'2100.00')
 const result=priceQuoteRows([{description:'Shipping',basePrice:1,additionalCharges:50,progressivePricing:pricing(3)},{description:'Overnight',basePrice:0,additionalCharges:0,progressivePricing:overnight},{description:'Insurance',basePrice:100,additionalCharges:25}],75)
 assert.equal(result.finalPrice,7450);assert.equal(result.tiers.length,7)
 assert.equal(calculateProgressivePricing({unit:'hour',quantity:3,tiers:[{from:1,to:1,unitPrice:'0.10'},{from:2,to:null,unitPrice:'0.20'}]}).total,'0.50')
})
test('gaps, overlapping brackets, invalid quantities and uncovered units cannot be saved',()=>{
 for(const quantity of [0,-1,1.5,1000001])assert.equal(progressivePricingSchema.safeParse(pricing(quantity)).success,false)
 assert.equal(progressivePricingSchema.safeParse({...pricing(),tiers:[{from:1,to:1,unitPrice:'1'},{from:3,to:null,unitPrice:'2'}]}).success,false)
 assert.equal(progressivePricingSchema.safeParse({...pricing(),tiers:[{from:1,to:null,unitPrice:'1'},{from:2,to:null,unitPrice:'2'}]}).success,false)
 assert.equal(progressivePricingSchema.safeParse({...pricing(),tiers:[{from:1,to:3,unitPrice:'1'}]}).success,false)
 assert.equal(progressivePricingSchema.safeParse({...pricing(),unit:'other'}).success,false)
 assert.throws(()=>calculateProgressivePricing({unit:'shipment',quantity:1000000,tiers:[{from:1,to:null,unitPrice:'9999999999'}]}))
})

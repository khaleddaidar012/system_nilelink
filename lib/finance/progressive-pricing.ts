import {z} from "zod"
import {minor,decimal,type PricingTier} from "../shipments/accounting"
const price=z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
export const progressivePricingSchema=z.object({
 unit:z.enum(["shipment","day","night","hour","container","other"]),unitLabel:z.string().trim().max(40).optional(),
 quantity:z.number().int().min(1).max(1000000),
 tiers:z.array(z.object({from:z.number().int().min(1).max(1000000),to:z.number().int().min(1).max(1000000).nullable(),unitPrice:price,label:z.string().trim().max(160).optional()}).strict()).min(1).max(30),
}).strict().superRefine((input,context)=>{
 let next=1
 for(const [index,tier] of input.tiers.entries()){
  if(tier.from!==next)context.addIssue({code:"custom",path:["tiers",index,"from"],message:"Tiers must start at one and cover consecutive units without gaps or overlaps"})
  if(tier.to!==null&&tier.to<tier.from)context.addIssue({code:"custom",path:["tiers",index,"to"],message:"Tier end must follow its start"})
  if(tier.to===null&&index!==input.tiers.length-1)context.addIssue({code:"custom",path:["tiers",index,"to"],message:"Only the last tier can be open ended"})
  next=(tier.to??1000000)+1
 }
 const last=input.tiers.at(-1)
 if(last?.to!==null&&input.quantity>(last?.to??0))context.addIssue({code:"custom",path:["quantity"],message:"Pricing tiers must cover the full quantity"})
 if(input.unit==="other"&&!input.unitLabel)context.addIssue({code:"custom",path:["unitLabel"],message:"Enter the unit name"})
})
export type ProgressivePricing=z.infer<typeof progressivePricingSchema>
export const progressiveUnitLabels={shipment:["شحنة","shipment"],day:["يوم","day"],night:["ليلة بياتة","overnight stay"],hour:["ساعة","hour"],container:["حاوية","container"],other:["وحدة","unit"]} as const
export function calculateProgressivePricing(value:ProgressivePricing){
 const input=progressivePricingSchema.parse(value)
 const tiers=input.tiers.map(tier=>{const quantity=Math.max(0,Math.min(input.quantity,tier.to??input.quantity)-tier.from+1);return {...tier,quantity,subtotal:decimal(minor(tier.unitPrice)*BigInt(quantity)),label:tier.label||`${tier.from}${tier.to===null?"+":tier.to===tier.from?"":`–${tier.to}`}`}})
 const total=decimal(tiers.reduce((sum,tier)=>sum+minor(tier.subtotal),BigInt(0)));minor(total)
 return {total,tiers}
}
export type QuotePriceRow={description:string;basePrice:number;additionalCharges:number;progressivePricing?:ProgressivePricing}
/** The server, rather than the submitted line total, prices each configured row. */
export function priceQuoteRows(rows:QuotePriceRow[],discount=0){
 let base=BigInt(0),extra=BigInt(0);const tiers:PricingTier[]=[]
 const breakdown=rows.map(row=>{
  const result=row.progressivePricing?calculateProgressivePricing(row.progressivePricing):null
  const basePrice=result?Number(result.total):row.basePrice
  base+=minor(String(basePrice));extra+=minor(String(row.additionalCharges))
  if(result)tiers.push(...result.tiers.filter(tier=>tier.quantity>0).map(tier=>({label:`${row.description} · ${tier.label}`.slice(0,160),quantity:String(tier.quantity),unitPrice:tier.unitPrice})))
  else if(basePrice>0)tiers.push({label:row.description.slice(0,160),quantity:"1",unitPrice:decimal(minor(String(basePrice)))})
  if(row.additionalCharges>0)tiers.push({label:`${row.description} · رسوم إضافية / Extra charges`.slice(0,160),quantity:"1",unitPrice:decimal(minor(String(row.additionalCharges)))})
  return {...row,basePrice}
 })
 const total=base+extra-minor(String(discount));if(total<BigInt(0))throw new Error("Discount exceeds row prices")
 const finalPrice=decimal(total);minor(finalPrice)
 return {breakdown,basePrice:Number(decimal(base)),additionalCharges:Number(decimal(extra)),finalPrice:Number(finalPrice),tiers}
}

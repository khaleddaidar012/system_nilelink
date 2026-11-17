"use client"
import {decimal,minor,tierSubtotal,type CostInput,type PricingTier} from "@/lib/shipments/accounting"
export function TieredPricingEditor({cost,stage,ar,disabled,allowed,onChange}:{cost:CostInput;stage:string;ar:boolean;disabled:boolean;allowed:boolean;onChange:(patch:Partial<CostInput>)=>void}){
 if(!allowed&&!cost.isTiered)return null
 const tiers=cost.tiers||[]
 const update=(next:PricingTier[])=>{
  let sellingPrice:string|undefined
  try{sellingPrice=decimal(next.reduce((sum,tier)=>sum+minor(tierSubtotal(tier)),BigInt(0)))}catch{}
  onChange({tiers:next,saleEqualsCost:false,...(sellingPrice?{sellingPrice}:{})})
 }
 const toggle=(enabled:boolean)=>{
  if(!enabled){onChange({isTiered:false,tiers:undefined});return}
  const labels=stage==="transportation"?(ar?["اليوم الأول","اليوم 2–5","اليوم 6+"]:["First day","Days 2–5","Day 6+"]):stage==="customs"?(ar?["الشحنة الأولى","الشحنة الثانية","الشحنة الثالثة+"]:["First shipment","Second shipment","Third shipment+"]):(ar?["الحاوية الأولى","الحاوية الثانية","الحاوية الثالثة+"]:["First container","Second container","Third container+"])
  onChange({isTiered:true,saleEqualsCost:false,sellingPrice:"0.00",tiers:labels.map((label,index)=>({label,quantity:stage==="transportation"?["1","4","3"][index]:"1",unitPrice:"0"}))})
 }
 return <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:col-span-2 lg:col-span-4 dark:border-sky-900 dark:bg-sky-950/20">
  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={cost.isTiered===true} disabled={disabled||!allowed} onChange={event=>toggle(event.target.checked)} />{ar?"تفعيل التسعير المتدرج":"Enable tiered pricing"}</label>
  {cost.isTiered&&<><p className="text-xs text-slate-500">{ar?"الشرائح تحدد سعر البيع للعميل. تكلفة البند الداخلية تُسجل منفصلة بالأعلى.":"Tiers set the customer's selling price. Record the internal item cost separately above."}</p><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-start text-xs"><thead><tr>{(ar?["وصف الشريحة","الكمية","سعر الوحدة","الإجمالي",""]:["Tier description","Quantity","Unit price","Subtotal",""]).map((label,index)=><th key={index} className="p-2 text-start">{label}</th>)}</tr></thead><tbody>{tiers.map((tier,index)=>{let subtotal="—";try{subtotal=tierSubtotal(tier)}catch{};return <tr key={index}><td className="p-1"><input aria-label={ar?"وصف الشريحة":"Tier description"} className="w-full rounded border bg-transparent p-2" value={tier.label} maxLength={160} disabled={disabled||!allowed} onChange={event=>update(tiers.map((row,i)=>i===index?{...row,label:event.target.value}:row))} /></td>{(["quantity","unitPrice"] as const).map(key=><td key={key} className="w-24 p-1"><input aria-label={ar?key==="quantity"?"كمية الشريحة":"سعر وحدة الشريحة":key==="quantity"?"Tier quantity":"Tier unit price"} className="w-full rounded border bg-transparent p-2" inputMode="decimal" value={tier[key]} disabled={disabled||!allowed} onChange={event=>update(tiers.map((row,i)=>i===index?{...row,[key]:event.target.value}:row))} /></td>)}<td className="p-2"><bdi>{subtotal} {cost.currency}</bdi></td><td><button type="button" disabled={disabled||!allowed||tiers.length<=1} onClick={()=>update(tiers.filter((_,i)=>i!==index))} className="p-2 text-rose-600 disabled:opacity-30">{ar?"حذف":"Delete"}</button></td></tr>})}</tbody></table></div><button type="button" disabled={disabled||!allowed||tiers.length>=30} onClick={()=>update([...tiers,{label:ar?"شريحة جديدة":"New tier",quantity:"1",unitPrice:"0"}])} className="rounded-lg border border-sky-300 px-3 py-2 text-xs disabled:opacity-40">{ar?"+ إضافة شريحة":"+ Add tier"}</button></>}
 </div>
}

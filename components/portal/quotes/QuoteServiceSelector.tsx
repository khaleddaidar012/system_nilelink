"use client"
import {Dialog} from "@headlessui/react"
import {useState} from "react"
import {ListTree,ChevronRight,X} from "lucide-react"
import {serviceLabels} from "@/lib/requests/progress"
import {formatMoney} from "@/lib/finance/currency"
import {calculateProgressivePricing,progressiveUnitLabels} from "@/lib/finance/progressive-pricing"

type DetailRow={description:string;quantity:number|null;unitPrice:number|null;amount:number;hint?:string}
function detailRows(item:any,ar:boolean):DetailRow[]{
 const result:DetailRow[]=[]
 const breakdown=Array.isArray(item.breakdown)?item.breakdown:[]
 if(breakdown.length){
  for(const row of breakdown){
   if(row.progressivePricing){
    try{
     const pricing=row.progressivePricing,calculated=calculateProgressivePricing(pricing),unit=pricing.unit==='other'?pricing.unitLabel:progressiveUnitLabels[pricing.unit as keyof typeof progressiveUnitLabels]?.[ar?0:1]
     for(const tier of calculated.tiers){
      const range=ar?(tier.to===null?'من '+tier.from+' فما فوق':tier.to===tier.from?'الوحدة '+tier.from:'من '+tier.from+' إلى '+tier.to):(tier.to===null?'From '+tier.from+' onwards':tier.to===tier.from?'Unit '+tier.from:tier.from+'–'+tier.to)
      result.push({description:[row.description,tier.label!==String(tier.from)?tier.label:''].filter(Boolean).join(' · '),quantity:tier.quantity,unitPrice:Number(tier.unitPrice),amount:Number(tier.subtotal),hint:range+' · '+unit})
     }
    }catch{result.push({description:row.description,quantity:1,unitPrice:Number(row.basePrice||0),amount:Number(row.basePrice||0)})}
   }else result.push({description:row.description||row.label||item.serviceKey,quantity:1,unitPrice:Number(row.basePrice??row.amount??0),amount:Number(row.basePrice??row.amount??0)})
   if(Number(row.additionalCharges)>0)result.push({description:ar?'رسوم إضافية':'Extra charges',quantity:1,unitPrice:Number(row.additionalCharges),amount:Number(row.additionalCharges)})
  }
 }else if(item.isTiered&&Array.isArray(item.tiers)&&item.tiers.length){
  for(const tier of item.tiers)result.push({description:tier.label,quantity:Number(tier.quantity),unitPrice:Number(tier.unitPrice),amount:Number(tier.quantity)*Number(tier.unitPrice)})
 }else result.push({description:serviceLabels[item.serviceKey]?.[ar?0:1]||item.serviceKey,quantity:1,unitPrice:Number(item.basePrice??item.finalPrice??0),amount:Number(item.basePrice??item.finalPrice??0)})
 if(!breakdown.length&&Number(item.additionalCharges)>0)result.push({description:ar?'رسوم إضافية':'Extra charges',quantity:1,unitPrice:Number(item.additionalCharges),amount:Number(item.additionalCharges)})
 if(Number(item.discount)>0)result.push({description:ar?'خصم':'Discount',quantity:null,unitPrice:null,amount:-Number(item.discount)})
 const adjustment=Math.round((Number(item.finalPrice||0)-result.reduce((sum,row)=>sum+row.amount,0))*100)/100
 if(adjustment)result.push({description:ar?'تسوية السعر':'Price adjustment',quantity:null,unitPrice:null,amount:adjustment})
 return result
}
export function QuoteServiceSelector({items,currency,ar,selected,onChange,editable}:{items:any[];currency:string;ar:boolean;selected:string[];onChange:(keys:string[])=>void;editable:boolean}){
 const [details,setDetails]=useState<string|null>(null)
 const keys=[...new Set(items.map(item=>String(item.serviceKey)))],label=(key:string)=>serviceLabels[key]?.[ar?0:1]||key.replaceAll('_',' ')
 const rows=items.filter(item=>item.serviceKey===details)
 return <div className="space-y-3">
  {keys.map(key=><div key={key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!editable} checked={selected.includes(key)} onChange={event=>onChange(event.target.checked?[...selected,key]:selected.filter(value=>value!==key))} />{label(key)}</label><button type="button" onClick={()=>setDetails(key)} aria-label={(ar?'عرض تفاصيل ':'View details: ')+label(key)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"><ListTree className="h-4 w-4" /><span>{ar?'عرض التفاصيل':'View details'}</span><ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" /></button></div>)}
  {editable&&!selected.length&&<p role="status" className="text-xs text-amber-700">{ar?'اختر خدمة واحدة على الأقل للقبول.':'Choose at least one service to accept.'}</p>}
  <Dialog open={details!==null} onClose={()=>setDetails(null)} className="relative z-[90]" dir={ar?'rtl':'ltr'}>
   <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" aria-hidden="true" />
   <div className="fixed inset-0 flex items-center justify-center p-3"><Dialog.Panel className="max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
    <div className="mb-5 flex items-center justify-between"><Dialog.Title className="flex items-center gap-2 font-bold"><ListTree className="h-5 w-5 text-sky-600" />{ar?'تفاصيل ':'Details: '}{details&&label(details)}</Dialog.Title><button aria-label={ar?'إغلاق':'Close'} onClick={()=>setDetails(null)}><X className="h-5 w-5" /></button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-sm"><thead className="bg-slate-50 text-xs dark:bg-slate-800"><tr>{(ar?['البند والشرائح','الكمية','سعر الوحدة','المبلغ']:['Item and tiers','Quantity','Unit price','Amount']).map((heading,index)=><th key={index} className="p-3 text-start">{heading}</th>)}</tr></thead><tbody>{rows.flatMap((item,index)=>[...detailRows(item,ar).map((row,i)=><tr key={index+'-'+i} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3"><p>{row.description}</p>{row.hint&&<p className="mt-1 text-xs text-slate-500">{row.hint}</p>}</td><td className="p-3"><bdi>{row.quantity??'—'}</bdi></td><td className="p-3"><bdi>{row.unitPrice===null?'—':formatMoney(row.unitPrice,currency)}</bdi></td><td className="p-3 text-end font-semibold"><bdi>{formatMoney(row.amount,currency)}</bdi></td></tr>),...(item.note?[<tr key={index+'-note'}><td colSpan={4} className="p-3 text-xs text-slate-500">{item.note}</td></tr>]:[])])}</tbody><tfoot><tr className="border-t bg-sky-50 font-bold dark:bg-sky-950/30"><td colSpan={3} className="p-3">{ar?'إجمالي الخدمة':'Service subtotal'}</td><td className="p-3 text-end"><bdi>{formatMoney(rows.reduce((sum,item)=>sum+Number(item.finalPrice||0),0),currency)}</bdi></td></tr></tfoot></table></div>
    <div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border px-4 py-2 text-sm" onClick={()=>setDetails(null)}>{ar?'إغلاق':'Close'}</button>{editable&&details&&!selected.includes(details)&&<button className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white" onClick={()=>{onChange([...selected,details]);setDetails(null)}}>{ar?'تضمين هذه الخدمة':'Include this service'}</button>}</div>
   </Dialog.Panel></div>
  </Dialog>
 </div>
}

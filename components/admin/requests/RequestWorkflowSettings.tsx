"use client"
import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
export function RequestWorkflowSettings({ request, onUpdated }: { request: { _id: string; updatedAt?: string; status: string; quoteRequired?: boolean; assignedStaffId?: string|null }; onUpdated: () => void }) {
  const ar=useLocale()==="ar",label=(a:string,e:string)=>ar?a:e
  const [state,setState]=useState<{canManage:boolean;canAssign:boolean;staffOptions:{_id:string;name:string}[];revision:number;quoteRequired:boolean}|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState("")
  useEffect(()=>{let active=true;fetch(`/api/admin/requests/${request._id}/workflow`,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(active){setState(data);setError("")}}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[request._id,request.updatedAt])
  async function choose(input:{quoteRequired?:boolean;assignedStaffId?:string|null}){
    if(!state)return
    setBusy(true);setError("")
    try {const response=await fetch(`/api/admin/requests/${request._id}/workflow`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...input,revision:state.revision})});const data=await response.json();if(!response.ok)throw Error(data.error);onUpdated()}
    catch(error){setError((error as Error).message)}finally{setBusy(false)}
  }
  const locked=["processing","completed","cancelled","quote_accepted"].includes(request.status)
  return <section className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <h3 className="font-bold">{label("مسار الطلب وعرض السعر","Request workflow & quotation")}</h3>
    <p className="text-xs text-slate-500">{label("اختر عرض سعر عند الحاجة، أو تنفيذًا مباشرًا للعميل الحالي. لا يغير الاختيار الأرقام الجمركية أو العروض السابقة.","Choose a quotation when required, or direct processing for an existing customer. Existing compliance numbers and quotation history are retained.")}</p>
    <div className="flex flex-wrap gap-2">{[true,false].map(required=><button key={String(required)} type="button" aria-pressed={(request.quoteRequired!==false)===required} disabled={busy||!state?.canManage||locked} onClick={()=>void choose({quoteRequired:required})} className={"rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-60 "+((request.quoteRequired!==false)===required?"border-primary-600 bg-primary-600 text-white":"border-slate-300")}>
      {required?label("بعرض سعر","Quotation required"):label("تنفيذ مباشر دون عرض سعر","Direct processing, no quotation")}
    </button>)}</div>
    {locked&&<p className="text-xs text-slate-500">{label("المسار محفوظ؛ لا يتغير بعد قبول العرض أو بدء التنفيذ.","The workflow is locked after quotation acceptance or processing starts.")}</p>}
    {state?.canAssign&&<label className="block text-sm">{label("الموظف المسؤول عن التنفيذ","Employee responsible for processing")}<select className="mt-2 w-full rounded-xl border bg-white p-2 dark:bg-slate-900" value={request.assignedStaffId??""} disabled={busy} onChange={event=>void choose({assignedStaffId:event.target.value||null})}><option value="">{label("لم يتم التعيين","Unassigned")}</option>{state.staffOptions.map(user=><option key={user._id} value={user._id}>{user.name}</option>)}</select></label>}
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
  </section>
}

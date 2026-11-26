"use client"
import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { canonicalServiceStatus, serviceLabels, serviceStatuses, serviceStatusLabels } from "@/lib/requests/progress"
import { localizeTimelineTitle } from "@/lib/requests/timeline-i18n"
type Service={_id:string;serviceKey:string;status:string;revision:number;timeline:{createdAt:string;title:string}[]}
export function ServiceProgressEditor({requestId,updatedAt,onUpdated}:{requestId:string;updatedAt?:string;onUpdated:()=>void}) {
  const ar=useLocale()==="ar",lang=ar?0:1
  const [services,setServices]=useState<Service[]>([]),[canManage,setCanManage]=useState(false)
  const [edits,setEdits]=useState<Record<string,{status:string;comment:string}>>({}),[busy,setBusy]=useState(false),[error,setError]=useState("")
  useEffect(()=>{let active=true;fetch(`/api/admin/requests/${requestId}/workflow`,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(active){setServices(data.services);setCanManage(data.canManage);setEdits({});setError("")}}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[requestId,updatedAt])
  async function save(service:Service){
    const edit=edits[service._id];if(!edit)return
    setBusy(true);setError("")
    try{const response=await fetch(`/api/admin/services/${service._id}/status`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...edit,revision:service.revision})});const data=await response.json();if(!response.ok)throw Error(data.error);onUpdated()}
    catch(error){setError((error as Error).message)}finally{setBusy(false)}
  }
  return <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <h2 className="font-bold">{ar?"متابعة تنفيذ الخدمات":"Service progress"}</h2>
    <p className="text-xs text-slate-500">{ar?"كل خدمة مستقلة. تحديث التنفيذ لا ينشر الفاتورة ولا يغير تكاليفها.":"Each service is independent. Progress updates do not publish invoices or change costs."}</p>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {services.map(service=>{const current=canonicalServiceStatus(service.status);const edit=edits[service._id]??{status:current,comment:""};return <div key={service._id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{serviceLabels[service.serviceKey]?.[lang]??service.serviceKey}</h3><span className="text-xs">{serviceStatusLabels[service.status]?.[lang]??service.status}</span></div>
      {canManage&&<><label className="block text-xs">{ar?"الحالة":"Status"}<select className="mt-1 w-full rounded-lg border bg-white p-2 dark:bg-slate-900" value={edit.status} disabled={busy} onChange={event=>setEdits({...edits,[service._id]:{...edit,status:event.target.value}})}>{!serviceStatuses.includes(current as typeof serviceStatuses[number])&&<option value={current}>{service.status}</option>}{serviceStatuses.map(value=><option key={value} value={value}>{serviceStatusLabels[value][lang]}</option>)}</select></label>
      <label className="block text-xs">{ar?"ملاحظة تظهر للعميل (وسبب التصحيح عند إعادة الفتح)":"Customer-visible note (correction reason when reopening)"}<input maxLength={1000} className="mt-1 w-full rounded-lg border bg-white p-2 dark:bg-slate-900" value={edit.comment} disabled={busy} onChange={event=>setEdits({...edits,[service._id]:{...edit,comment:event.target.value}})}/></label>
      <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={busy||edit.status===current} onClick={()=>void save(service)}>{ar?"تحديث الخدمة":"Update service"}</button></>}
      {service.timeline.at(-1)&&<p className="text-xs text-slate-500">{localizeTimelineTitle(service.timeline.at(-1)?.title, ar ? "ar" : "en")} · {new Date(service.timeline.at(-1)!.createdAt).toLocaleString(ar?"ar-EG":"en-GB",{timeZone:"Africa/Cairo",hour12:true})}</p>}
    </div>})}
  </section>
}

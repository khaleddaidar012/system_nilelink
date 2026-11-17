"use client"
import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Link } from "@/navigation"
import { invoiceEventLabels } from "@/lib/shipments/invoice-events"
type Update={id:string;sequence:number;invoiceId:string;invoiceNumber:string;shipmentId:string|null;action:string;actorName:string;createdAt:string}
export function AccountsUpdates(){
  const ar=useLocale()==="ar"
  const [view,setView]=useState<{through:number;events:Update[]}|null>(null),[error,setError]=useState("")
  useEffect(()=>{let active=true;async function refresh(){if(document.hidden)return;try{const response=await fetch("/api/admin/workspace-activity?section=shipment-invoices",{cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.error);if(active){setView(data);setError("")}}catch(error){if(active)setError((error as Error).message)}}void refresh();const interval=setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{active=false;clearInterval(interval);window.removeEventListener("focus",refresh)}},[])
  useEffect(()=>{if(!view)return;let active=true;fetch("/api/admin/workspace-activity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({section:"shipment-invoices",through:view.through})}).then(response=>{if(response.ok&&active)window.dispatchEvent(new Event("nilelink-workspace-updates"))}).catch(()=>{});return()=>{active=false}},[view])
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-bold">{ar?"آخر تحديثات الحسابات":"Recent accounts updates"}</h2>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {!view&&!error&&<p className="text-xs text-slate-500">{ar?"جاري التحميل…":"Loading…"}</p>}
    {view&&view.events.length===0&&<p className="text-xs text-slate-500">{ar?"لا توجد تحديثات بعد.":"No updates yet."}</p>}
    {view&&view.events.length>0&&<details><summary className="cursor-pointer text-sm text-primary-600">{ar?"عرض أحدث التحديثات":"View recent updates"} ({view.events.length})</summary><div className="mt-3 max-h-80 space-y-2 overflow-auto">{view.events.map(event=><Link key={event.id} href={event.shipmentId?`/admin/shipment-invoices/${event.invoiceId}`:"/admin/invoices"} className="block rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800"><p className="font-semibold">{event.invoiceNumber} · {invoiceEventLabels[event.action]?.[ar?0:1]??event.action}</p><p className="mt-1 text-xs text-slate-500">{event.actorName} · {new Date(event.createdAt).toLocaleString(ar?"ar-EG":"en-GB",{timeZone:"Africa/Cairo",hour12:true})}</p></Link>)}</div></details>}
  </section>
}

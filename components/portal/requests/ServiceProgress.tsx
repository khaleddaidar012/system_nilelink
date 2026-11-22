"use client"
import {executionServices,serviceTheme} from "@/lib/requests/execution"
import {serviceStyle} from "@/lib/requests/service-colors"
import {Check, Clock, LockKeyhole} from "lucide-react"
import {serviceStages} from "@/lib/requests/tracking"
import { useLocale } from "next-intl"
import { serviceLabels } from "@/lib/requests/progress"
import { ServiceTracker } from "./ServiceTracker"
import type {ServiceStage} from "@/lib/requests/tracking"
import { Link } from "@/navigation"
export function PublishedInvoiceLink({invoice}:{invoice?:{token:string;invoiceNumber:string;referenceNumber?:string}|null}) {
  const ar=useLocale()==="ar"
  if(!invoice)return null
  return <Link href={`/invoice/${invoice.token}`} className="inline-flex rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-200">{ar?"ŸÖÿπÿßŸäŸÜÿ© ÿßŸÑŸÅÿßÿ™Ÿàÿ±ÿ©":"Preview invoice"} ¬∑ <bdi>{invoice.referenceNumber || invoice.invoiceNumber}</bdi></Link>
}
export function ServiceProgress({services,compact=false}:{services:{_id:string;serviceKey:string;status:string;trackingStages?:ServiceStage[]}[];compact?:boolean}) {
  const ar=useLocale()==="ar",lang=ar?0:1,ordered=executionServices(services)
  const rows=ordered.map(service=>{
    const stages=serviceStages(service),completed=stages.filter(stage=>stage.status==="completed").length
    const label=serviceLabels[service.serviceKey]?.[lang]||service.serviceKey
    const status=service.executionLocked?(ar?"›Ì «‰ Ÿ«— «ﬂ „«· ":"Awaiting ")+(serviceLabels[service.waitingForService!]?.[lang]||service.waitingForService):service.executionCompleted?(ar?"„ﬂ „·…":"Completed"):stages.some(stage=>stage.status==="in_progress")?(ar?"ﬁÌœ «· ‰›Ì–":"In progress"):(ar?"Ã«Â“… ··»œ¡":"Ready to start")
    const Icon=service.executionCompleted?Check:service.executionLocked?LockKeyhole:Clock
    return {service,stages,completed,label,status,Icon}
  })
  if(compact) return <ul className="flex flex-wrap gap-1.5" aria-label={ar?"«·Œœ„«  Ê„—«Õ· «· ‰›Ì–":"Services and progress"}>{rows.map(({service,stages,completed,label,status,Icon})=><li key={service._id} style={serviceStyle(service.serviceKey)} className="service-skin service-panel inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium" title={status}>
    <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span>{service.executionOrder}. {label}</span><span className="shrink-0 border-s border-current/20 ps-1.5 tabular-nums" aria-label={`${status}: ${completed}/${stages.length}`}>{completed}/{stages.length}</span>
  </li>)}</ul>
  return <section className="space-y-3">{ordered.length>0&&ordered.every(service=>service.executionCompleted)&&<p className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-700">{ar?" „ «·«‰ Â«¡ „‰ «·ÿ·»":"Request completed"}</p>}{rows.map(({service,stages,completed,label,status})=><div key={service._id} style={serviceStyle(service.serviceKey)} className={"rounded-2xl border p-3 "+serviceTheme(service.serviceKey)}><h3 className="font-bold">{service.executionOrder}. {label}</h3><p className="my-2 text-xs">{status} ∑ {completed}/{stages.length}</p><ServiceTracker service={service}/></div>)}</section>
}

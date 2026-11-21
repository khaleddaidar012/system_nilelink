"use client"
import {executionServices,serviceTheme} from "@/lib/requests/execution"
import {serviceStages} from "@/lib/requests/tracking"
import { useLocale } from "next-intl"
import { canonicalServiceStatus, serviceLabels, serviceStatusLabels } from "@/lib/requests/progress"
import { ServiceTracker } from "./ServiceTracker"
import type {ServiceStage} from "@/lib/requests/tracking"
import { Link } from "@/navigation"
export function PublishedInvoiceLink({invoice}:{invoice?:{token:string;invoiceNumber:string;referenceNumber?:string}|null}) {
  const ar=useLocale()==="ar"
  if(!invoice)return null
  return <Link href={`/invoice/${invoice.token}`} className="inline-flex rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-200">{ar?"معاينة الفاتورة":"Preview invoice"} · <bdi>{invoice.referenceNumber || invoice.invoiceNumber}</bdi></Link>
}
export function ServiceProgress({services,compact=false}:{services:{_id:string;serviceKey:string;status:string;trackingStages?:ServiceStage[]}[];compact?:boolean}) {
  const ar=useLocale()==="ar",lang=ar?0:1,ordered=executionServices(services)
  return <section className="space-y-3">{ordered.length>0&&ordered.every(s=>s.executionCompleted)&&<p className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-700">{ar?"تم الانتهاء من الطلب":"Request completed"}</p>}{ordered.map(service=>{const stages=serviceStages(service),completed=stages.filter(s=>s.status==="completed").length;return <div key={service._id} className={"rounded-2xl border p-3 "+serviceTheme(service.serviceKey)}><h3 className="font-bold">{service.executionOrder}. {serviceLabels[service.serviceKey]?.[lang]||service.serviceKey}</h3><p className="my-2 text-xs">{service.executionLocked?(ar?"في انتظار اكتمال ":"Awaiting ")+(serviceLabels[service.waitingForService!]?.[lang]||service.waitingForService):service.executionCompleted?(ar?"مكتملة":"Completed"):stages.some(s=>s.status==="in_progress")?(ar?"قيد التنفيذ":"In progress"):(ar?"لم تبدأ / جاهزة للبدء":"Not started / ready")}{" · "}{completed}/{stages.length}</p>{!compact&&<ServiceTracker service={service}/>}</div>})}</section>
}

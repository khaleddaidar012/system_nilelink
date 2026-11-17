"use client"
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
  const ar=useLocale()==="ar",lang=ar?0:1
  const active=services.filter(service=>canonicalServiceStatus(service.status)==="active")
  const allDone=services.length>0&&services.every(service=>["completed","cancelled"].includes(canonicalServiceStatus(service.status)))
  if(!compact && services.some(service=>["active","completed"].includes(service.status)))return <div className="space-y-3">{services.filter(service=>["active","completed"].includes(service.status)).map(service=><ServiceTracker key={service._id} service={service} />)}</div>
  return <div className={compact?"mt-2 space-y-2 text-xs":"space-y-3 rounded-2xl border border-primary-100 bg-primary-50 p-5 dark:border-primary-900 dark:bg-primary-950/30"}>
    <p className="font-bold">{ar?"المرحلة الحالية: ":"Current stage: "}{active.length?active.map(service=>serviceLabels[service.serviceKey]?.[lang]??service.serviceKey).join(" + "):allDone?(ar?"انتهى تنفيذ الخدمات":"Service processing finished"):(ar?"تجهيز / انتظار بدء الخدمة":"Preparation / awaiting service start")}</p>
    <div className="flex flex-wrap gap-2">{services.map(service=><span key={service._id} className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">{serviceLabels[service.serviceKey]?.[lang]??service.serviceKey} · {serviceStatusLabels[service.status]?.[lang]??service.status}</span>)}</div>
  </div>
}

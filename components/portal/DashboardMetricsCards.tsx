"use client"
import {useCallback,useEffect,useState} from "react"
import {useLocale} from "next-intl"
import {FileText,FileCheck2,Send,Receipt,ClipboardList,Bell,ArrowUpRight} from "lucide-react"
import {Link} from "@/navigation"
import {usePortal} from "./PortalContext"
import {usePortalLiveRefresh} from "@/hooks/useLiveUpdates"

export function DashboardMetricsCards(){
 const ar=useLocale()==="ar",{documentStats,unreadCount,loading}=usePortal()
 const [counts,setCounts]=useState<{requests:number|null;requestActions:number;invoices:number|null;invoiceActions:number;quotes:number|null;quoteActions:number}>({requests:null,requestActions:0,invoices:null,invoiceActions:0,quotes:null,quoteActions:0})
 const load=useCallback(async()=>{
  const results=await Promise.allSettled(["requests","financials","quotes"].map(async name=>{const response=await fetch("/api/portal/"+name,{cache:"no-store"});if(!response.ok)throw Error();return response.json()}))
  setCounts(previous=>{const next={...previous};const [r,f,q]=results;
   if(r.status==="fulfilled"&&Array.isArray(r.value.requests)){next.requests=r.value.requests.length;next.requestActions=r.value.requests.filter((row:any)=>["document_required","quote_provided"].includes(row.status)||row.ucrStatus==="requested_from_customer").length}
   if(f.status==="fulfilled"&&Array.isArray(f.value.invoices)){next.invoices=f.value.invoices.length;next.invoiceActions=f.value.invoices.filter((row:any)=>Number(row.remainingAmount)>0).length}
   if(q.status==="fulfilled"&&Array.isArray(q.value.quotes)){next.quotes=q.value.quotes.length;next.quoteActions=q.value.quotes.filter((row:any)=>["sent","viewed","pending"].includes(row.status)).length}
   return next
  })
 },[])
 useEffect(()=>{void load()},[load]);usePortalLiveRefresh(()=>{void load()},["request_updated","quote_updated","notification"])
 const attention=(documentStats?.pendingDocs||0)+(documentStats?.expiringDocs||0)+(documentStats?.expiredDocs||0)
 const cards=[
  {title:ar?"طلبات الخدمات":"Service requests",value:counts.requests,badge:counts.requestActions,description:ar?"متابعة الطلبات ومراحل التنفيذ":"Track requests and service progress",href:"/portal/requests",Icon:Send,color:"text-sky-600 bg-sky-50 dark:bg-sky-950"},
  {title:ar?"الفواتير":"Invoices",value:counts.invoices,badge:counts.invoiceActions,description:ar?"الفواتير المنشورة والمدفوعات":"Published invoices and payments",href:"/portal/financials",Icon:Receipt,color:"text-violet-600 bg-violet-50 dark:bg-violet-950"},
  {title:ar?"عروض الأسعار":"Quotations",value:counts.quotes,badge:counts.quoteActions,description:ar?"العروض الواردة وقرارات القبول":"Incoming offers and acceptance status",href:"/portal/quotes",Icon:ClipboardList,color:"text-amber-600 bg-amber-50 dark:bg-amber-950"},
  {title:ar?"المستندات":"Documents",value:documentStats?.totalDocs??null,badge:0,description:ar?"مستندات الشركة المسجلة":"Registered company documents",href:"/portal/documents",Icon:FileText,color:"text-blue-600 bg-blue-50 dark:bg-blue-950"},
  {title:ar?"متابعة المستندات":"Document follow-up",value:attention,badge:attention,description:ar?"قيد المراجعة أو قرب انتهاء الصلاحية":"Pending review or approaching expiry",href:"/portal/documents",Icon:FileCheck2,color:"text-emerald-600 bg-emerald-50 dark:bg-emerald-950"},
  {title:ar?"الإشعارات":"Notifications",value:unreadCount,badge:unreadCount,description:ar?"التحديثات غير المقروءة":"Unread updates",href:"/portal/notifications",Icon:Bell,color:"text-rose-600 bg-rose-50 dark:bg-rose-950"},
 ]
 return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({title,value,badge,description,href,Icon,color})=><Link key={href+title} href={href} className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-800 dark:bg-slate-900">
 {badge>0&&<span aria-label={ar?badge+" تحتاج متابعة":badge+" updates to review"} className="absolute -end-2 -top-2 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white ring-4 ring-slate-50 dark:ring-slate-950">{badge}</span>}
 <div className="flex items-center justify-between"><span className={"rounded-xl p-3 "+color}><Icon className="h-5 w-5" /></span><ArrowUpRight className="h-4 w-4 text-slate-400 rtl:-rotate-90" /></div><h2 className="mt-4 text-sm font-semibold text-slate-500">{title}</h2><p className="mt-2 text-3xl font-bold tabular-nums">{loading||value===null?"—":value}</p><p className="mt-2 text-xs text-slate-500">{description}</p>
 </Link>)}</div>
}

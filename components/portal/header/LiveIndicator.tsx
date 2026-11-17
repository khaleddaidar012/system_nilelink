"use client"
import {useLocale} from "next-intl"
import {usePortal} from "../PortalContext"
export function LiveIndicator(){
 const {liveStatus}=usePortal(),ar=useLocale()==="ar"
 const labels=ar?{live:"تحديث مباشر",connecting:"جارٍ الاتصال",polling:"تحديث كل 30 ثانية",offline:"غير متصل",paused:"التحديث متوقف مؤقتًا"}:{live:"Live",connecting:"Connecting",polling:"Updates every 30 seconds",offline:"Offline",paused:"Updates paused"}
 return <span role="status" title={labels[liveStatus]} className="flex items-center gap-1 text-[10px] text-slate-500"><span className={`h-2 w-2 rounded-full ${liveStatus==="live"?"bg-emerald-500 motion-safe:animate-pulse":liveStatus==="offline"?"bg-rose-500":"bg-amber-400"}`} /><span className="hidden lg:inline">{labels[liveStatus]}</span><span className="sr-only lg:hidden">{labels[liveStatus]}</span></span>
}

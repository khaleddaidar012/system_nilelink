"use client"
import {useCallback,useEffect,useState} from "react"
import {useLocale} from "next-intl"
import {usePortalLiveRefresh} from "@/hooks/useLiveUpdates"
import {ServiceTracker} from "./ServiceTracker"
export function RequestTracking({requestId}:{requestId:string}){
 const ar=useLocale()==='ar',[rows,setRows]=useState<any[]>([]),[error,setError]=useState(false)
 const load=useCallback(async()=>{try{const response=await fetch(`/api/portal/requests/${requestId}/tracking`,{cache:'no-store'});if(!response.ok)throw new Error();setRows((await response.json()).serviceTracking);setError(false)}catch{setError(true)}},[requestId])
 useEffect(()=>{void load()},[load]);usePortalLiveRefresh(()=>{void load()},['request_updated'])
 return <div className="space-y-3">{error?<button onClick={()=>void load()} className="text-sm text-amber-600">{ar?'تعذّر تحميل المراحل، اضغط لإعادة المحاولة':'Unable to load stages. Retry'}</button>:rows.map(row=><ServiceTracker key={row.serviceId} service={{serviceKey:row.serviceKey,trackingStages:row.stages}} />)}</div>
}

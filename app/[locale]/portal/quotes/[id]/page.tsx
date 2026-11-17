"use client"
import {useCallback,useEffect,useState} from "react"
import {useParams} from "next/navigation"
import {useLocale} from "next-intl"
import {Link,useRouter} from "@/navigation"
import {PortalHeader} from "@/components/portal/PortalHeader"
import {QuoteDetailsModal} from "@/components/portal/quotes/QuoteDetailsModal"
import {usePortalLiveRefresh} from "@/hooks/useLiveUpdates"
export default function PortalQuotePage(){
 const {id}=useParams(),router=useRouter(),ar=useLocale()==="ar"
 const [quote,setQuote]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false)
 const load=useCallback(async()=>{try{const response=await fetch('/api/portal/quotes/'+id,{cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();setQuote({...result.quote,items:result.items||[]});setError(false)}catch{setError(true)}finally{setLoading(false)}},[id])
 useEffect(()=>{void load()},[load]);usePortalLiveRefresh(()=>{void load()},['quote_updated'])
 return <div><PortalHeader title={ar?'تفاصيل عرض السعر':'Quotation details'} />{loading?<p className="p-6" role="status">{ar?'جارٍ التحميل…':'Loading…'}</p>:error?<div className="space-y-3 p-6"><p role="alert">{ar?'تعذّر تحميل العرض':'Unable to load quotation'}</p><button onClick={()=>void load()} className="underline">{ar?'إعادة المحاولة':'Retry'}</button><Link href="/portal/quotes" className="block">{ar?'العودة للعروض':'Back to quotes'}</Link></div>:<QuoteDetailsModal isOpen={!!quote} quote={quote} onClose={()=>router.push('/portal/quotes')} onQuoteUpdated={()=>void load()} />}</div>
}

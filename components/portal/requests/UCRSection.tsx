"use client"
import {useCallback,useEffect,useState} from "react"
import {useLocale} from "next-intl"
import {usePortalLiveRefresh} from "@/hooks/useLiveUpdates"
export function UCRSection({requestId,admin=false,onUpdated}:{requestId:string;admin?:boolean;onUpdated?:()=>void}){
 const ar=useLocale()==="ar",url=`/api/${admin?"admin":"portal"}/requests/${requestId}/ucr`
 const [state,setState]=useState<any>(null),[mode,setMode]=useState<"provide"|"request">("provide"),[value,setValue]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("")
 const load=useCallback(async()=>{try{const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error();setState(await response.json());setError("")}catch{setError(ar?"تعذّر تحميل حالة UCR":"Unable to load UCR status")}},[url,ar])
 useEffect(()=>{void load()},[load]);usePortalLiveRefresh(()=>{void load()},["request_updated"])
 const save=async()=>{
  setBusy(true);setError("");setMessage("")
  try{const response=await fetch(url,{method:admin?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({revision:state.revision,...(admin?{mode}:{}),...((!admin||mode==="provide")?{value}:{})})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Unable to save");setMessage(ar?"تم الحفظ وإرسال الإشعار":"Saved and notification sent");setValue("");await load();onUpdated?.()}catch(failure){await load();setError(failure instanceof Error?failure.message:"Unable to save")}finally{setBusy(false)}
 }
 if(!state)return error?<div className="rounded-xl border border-amber-200 p-3 text-xs"><p role="alert">{error}</p><button onClick={()=>void load()} className="underline">{ar?"إعادة المحاولة":"Retry"}</button></div>:null
 if(!state.required)return null
 const labels:Record<string,string>=ar?{pending:"لم يُحدد الرقم بعد",requested_from_customer:"في انتظار رقم UCR من العميل",submitted_by_customer:"تم استلام الرقم من العميل",provided_by_admin:"تم توفير الرقم من الفريق"}:{pending:"Reference pending",requested_from_customer:"Waiting for the customer's UCR",submitted_by_customer:"Customer reference received",provided_by_admin:"Reference provided by our team"}
 return <section className="space-y-3 rounded-2xl border border-sky-200 bg-white p-5 dark:border-sky-900 dark:bg-slate-900"><h2 className="font-bold">{ar?"المرجع الجمركي — UCR":"Customs reference — UCR"}</h2><p className="text-sm text-slate-500">{labels[state.status]||state.status}</p>{state.value&&<p className="font-mono text-lg font-bold text-emerald-600" dir="ltr">{state.value}</p>}{error&&<p role="alert" className="text-xs text-rose-600">{error}</p>}{message&&<p role="status" className="text-xs text-emerald-600">{message}</p>}
  {admin&&state.canManage&&<fieldset disabled={busy} className="flex flex-wrap gap-4 text-sm"><label className="flex gap-2"><input type="radio" checked={mode==="provide"} onChange={()=>setMode("provide")} />{ar?"أدخل UCR بنفسي":"Provide UCR"}</label><label className="flex gap-2"><input type="radio" checked={mode==="request"} onChange={()=>setMode("request")} />{ar?"اطلب UCR من العميل":"Request customer's UCR"}</label></fieldset>}
  {(admin&&state.canManage||!admin&&state.status==="requested_from_customer")&&<div className="flex flex-wrap gap-2">{(!admin||mode==="provide")&&<label className="min-w-48 flex-1 text-xs">{ar?"رقم UCR من وكيلك الجمركي":"UCR from your customs broker"}<input maxLength={100} value={value} onChange={event=>setValue(event.target.value)} disabled={busy} dir="ltr" className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm" /></label>}<button disabled={busy||((!admin||mode==="provide")&&!value.trim())} onClick={()=>void save()} className="self-end rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy?ar?"جارٍ الحفظ":"Saving":admin&&mode==="request"?ar?"إرسال طلب للعميل":"Request from customer":ar?"حفظ وإرسال":"Save and send"}</button></div>}
 </section>
}

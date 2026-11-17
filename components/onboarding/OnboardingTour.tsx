"use client"
import { Dialog } from "@headlessui/react"
import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { usePortal } from "@/components/portal/PortalContext"
import { toast } from "sonner"

const steps = [
  ["dashboard","لوحة التحكم","Dashboard","هنا ملخص حسابك وحالة مستنداتك وطلباتك.","View your account summary, document status and requests here."],
  ["documents","المستندات القانونية","Legal documents","ارفع السجل التجاري والبطاقة الضريبية وتابع مراجعتها هنا.","Upload your commercial register and tax card, and follow their review here."],
  ["requests","طلبات الخدمات","Service requests","قدّم طلب شحن بحري أو جوي أو بري أو تخليص جمركي من هنا.","Submit sea, air, land freight or customs clearance requests here."],
  ["quotes","عروض الأسعار","Quotes","راجع عروض الأسعار وتفاصيل الخدمات المقدمة من فريقنا هنا.","Review our team's quotations and service details here."],
  ["financials","الفواتير والمدفوعات","Invoices and payments","تابع فواتيرك ومدفوعاتك ورصيد حسابك من هنا.","Track your invoices, payments and account balance here."],
  ["notifications","الإشعارات","Notifications","تابع إشعارات تحديث الطلبات والمستندات من الجرس.","Follow request and document updates from the notification bell."],
  ["account","حسابي","My account","عدّل اسمك ورقم واتساب وصورتك الشخصية من قائمة حسابك.","Edit your name, WhatsApp number and profile photo from your account menu."],
] as const
export function OnboardingTour(){
 const {user,refreshData}=usePortal(),ar=useLocale()==="ar"
 const [open,setOpen]=useState(false),[step,setStep]=useState(0),[rect,setRect]=useState<{top:number;left:number;width:number;height:number}|null>(null)
 const [viewport,setViewport]=useState({width:360,height:700})
 const eligible=!!user&&["customer","customer_admin"].includes(user.role)&&user.emailVerified
 useEffect(()=>{
  if(!eligible||!user)return
  let done=false;try{done=localStorage.getItem(`nilelink:onboarding:${user.id}`)==="done"}catch{}
  if(user.hasCompletedOnboarding===false&&!done)setOpen(true)
  const replay=()=>{setStep(0);setOpen(true)};window.addEventListener("nilelink:replay-tour",replay);return()=>window.removeEventListener("nilelink:replay-tour",replay)
 },[eligible,user])
 useEffect(()=>{
  if(!open)return
  const measure=()=>{
   setViewport({width:window.innerWidth,height:window.innerHeight})
   const target=[...document.querySelectorAll<HTMLElement>(`[data-tour="${steps[step][0]}"]`)].find(element=>element.getBoundingClientRect().width>0)
   if(!target){setRect(null);return}
   const box=target.getBoundingClientRect();setRect({top:Math.max(4,box.top-4),left:Math.max(4,box.left-4),width:box.width+8,height:box.height+8})
  };measure();window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);return()=>{window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true)}
 },[open,step])
 const dismiss=(completed=false)=>{
  setOpen(false);if(!user)return
  try{localStorage.setItem(`nilelink:onboarding:${user.id}`,"done")}catch{}
  void fetch("/api/portal/profile",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({hasCompletedOnboarding:true})}).then(response=>{if(response.ok)void refreshData()}).catch(()=>{})
  if(completed)toast.success(ar?"أنت جاهز الآن!":"You're all set!")
 }
 if(!eligible)return null
 const width=Math.min(360,viewport.width-32),left=rect?Math.max(16,Math.min(rect.left,viewport.width-width-16)):(viewport.width-width)/2
 const top=rect?Math.max(16,Math.min(rect.top+rect.height+14,viewport.height-280)):(viewport.height-260)/2
 return <Dialog open={open} onClose={()=>dismiss()} className="relative z-[100]" dir={ar?"rtl":"ltr"}>
  <div className={`fixed inset-0 ${rect?"":"bg-slate-950/60"}`} aria-hidden="true" />
  {rect&&<div aria-hidden="true" className="pointer-events-none fixed rounded-xl border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.65)]" style={rect} />}
  <Dialog.Panel as={motion.div} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} key={step} className="fixed rounded-2xl bg-white p-5 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white" style={{width,left,top}}>
   <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-primary-600">{step+1} / {steps.length}</span><button onClick={()=>dismiss()} aria-label={ar?"إغلاق الجولة":"Close tour"}><X className="h-4 w-4" /></button></div>
   <Dialog.Title className="mb-2 text-lg font-bold">{steps[step][ar?1:2]}</Dialog.Title><Dialog.Description className="min-h-16 text-sm leading-6 text-slate-600 dark:text-slate-300">{steps[step][ar?3:4]}</Dialog.Description>
   <div className="my-4 flex justify-center gap-1.5" aria-hidden="true">{steps.map((_,index)=><span key={index} className={`h-1.5 rounded-full ${index===step?"w-5 bg-primary-600":"w-1.5 bg-slate-200"}`} />)}</div>
   <div className="flex items-center justify-between gap-2"><button onClick={()=>dismiss()} className="text-xs text-slate-500">{ar?"تخطي الجولة":"Skip tour"}</button><div className="flex gap-2"><button disabled={!step} onClick={()=>setStep(value=>value-1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-30">{ar?"السابق":"Previous"}</button><button onClick={()=>step===steps.length-1?dismiss(true):setStep(value=>value+1)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">{step===steps.length-1?ar?"إنهاء":"Finish":ar?"التالي":"Next"}</button></div></div>
  </Dialog.Panel>
 </Dialog>
}

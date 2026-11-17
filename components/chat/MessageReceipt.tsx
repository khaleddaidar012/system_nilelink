"use client"
import { Check,CheckCheck } from "lucide-react"
export function MessageReceipt({status,ar}:{status:"sent"|"delivered"|"read";ar:boolean}){
  const label=status==="read"?(ar?"تمت القراءة":"Read"):status==="delivered"?(ar?"تم الاستلام":"Delivered"):(ar?"تم الإرسال ولم يُستلم بعد":"Sent, not delivered yet")
  const Icon=status==="sent"?Check:CheckCheck
  return <span title={label} aria-label={label}><Icon aria-hidden="true" className={`h-3.5 w-3.5 ${status==="read"?"text-blue-300":"text-slate-300"}`}/></span>
}

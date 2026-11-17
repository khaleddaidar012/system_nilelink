"use client"
import { useEffect,useState,useRef } from "react"
import { useLocale } from "next-intl"
import { MessageSquare } from "lucide-react"
import { Link,usePathname,useRouter } from "@/navigation"
import { toast } from "sonner"
export function ChatLink({portal=false}:{portal?:boolean}){
  const ar=useLocale()==="ar",[unread,setUnread]=useState(0)
  const lastCount=useRef<number|null>(null),pathname=usePathname(),router=useRouter()
  useEffect(()=>{
    const refresh=(event:Event)=>{const count=(event as CustomEvent<{unread:number}>).detail.unread;setUnread(count);if(lastCount.current!==null&&count>lastCount.current&&!pathname.endsWith('/chat')&&!document.hidden)toast(ar?'عندك رسائل جديدة':'You have new messages',{id:'chat-unread',action:{label:ar?'فتح':'Open',onClick:()=>router.push(portal?'/portal/chat':'/admin/chat')}});lastCount.current=count}
    window.addEventListener('chat-unread-count',refresh)
    window.dispatchEvent(new Event('chat-updated'))
    return()=>window.removeEventListener('chat-unread-count',refresh)
  },[ar,pathname,portal,router])
  return <Link href={portal?"/portal/chat":"/admin/chat"} title={ar?"الشات":"Chat"} aria-label={`${ar?"الشات":"Chat"}${unread?` (${unread})`:""}`} className="relative shrink-0 rounded-xl border border-secondary-200 bg-secondary-50 p-2 text-secondary-700 transition-colors hover:bg-secondary-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><MessageSquare className="h-4 w-4"/>{unread>0&&<span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-primary-600 px-1 text-center text-[9px] font-bold leading-4 text-white">{unread>99?"99+":unread}</span>}</Link>
}

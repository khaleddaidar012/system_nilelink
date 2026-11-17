"use client"
import { useCallback,useEffect,useRef,useState } from "react"
import { useLocale } from "next-intl"
import { MessageSquare,Search,Plus,Users,Send,Check,Reply,X,ArrowRight,Loader2,Settings,RefreshCw,UserRound } from "lucide-react"
import { messageReceipt } from "@/lib/chat/receipts"
import type { MemberReceipt } from "@/lib/chat/receipts"
import { MessageReceipt } from "./MessageReceipt"

interface Person{id:string;name:string;username:string;role:string;status:string;company?:string}
interface Conversation{id:string;kind:"direct"|"group";title:string;members:Person[];ownerId:string;unread:number;lastMessage:string;lastSenderId?:string;updatedAt:string;canManage:boolean}
interface Message{_id:string;conversationId:string;senderId:string;sender:Person;text:string;sequence:number;createdAt:string;clientMessageId:string;recipientIds?:string[];replyTo?:{id:string;name:string;text:string}|null}
interface Draft{id:string;text:string;reply?:Message;failed:boolean;conversationId:string}
const field="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
export function ChatWorkspace({portal=false}:{portal?:boolean}){
  const ar=useLocale()==="ar",t=useCallback((a:string,b:string)=>ar?a:b,[ar])
  const [rooms,setRooms]=useState<Conversation[]>([]),[user,setUser]=useState<Person|null>(null),[selected,setSelected]=useState<string|null>(null),[search,setSearch]=useState("")
  const [messages,setMessages]=useState<Message[]>([]),[readBy,setReadBy]=useState<MemberReceipt[]>([]),[pending,setPending]=useState<Draft[]>([])
  const [text,setText]=useState(""),[reply,setReply]=useState<Message|undefined>(),[sending,setSending]=useState(false),[loading,setLoading]=useState(true),[threadLoading,setThreadLoading]=useState(false),[older,setOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false),[error,setError]=useState("")
  const [modal,setModal]=useState<"create"|"manage"|null>(null),[group,setGroup]=useState(false),[title,setTitle]=useState(""),[directorySearch,setDirectorySearch]=useState(""),[directory,setDirectory]=useState<Person[]>([]),[chosen,setChosen]=useState<Person[]>([]),[saving,setSaving]=useState(false),[directoryLoading,setDirectoryLoading]=useState(false),[modalError,setModalError]=useState("")
  const list=useRef<HTMLDivElement>(null),nearBottom=useRef(true),current=useRef<string|null>(null),textarea=useRef<HTMLTextAreaElement>(null)
  const room=rooms.find(item=>item.id===selected),isStaff=user?.role==="staff"||user?.role==="super_admin"
  const signalChange=()=>window.dispatchEvent(new Event('chat-updated'))
  const api=async(body:unknown)=>{
    const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    const data=await response.json();if(!response.ok)throw Error(data.error||'Chat unavailable');return data
  }
  const refreshRooms=async(signal?:AbortSignal)=>{
    const response=await fetch('/api/chat',{cache:'no-store',signal});if(!response.ok)throw Error('unavailable')
    const data=await response.json();if(signal?.aborted)return
    setRooms(data.conversations);setUser(data.user);setLoading(false)
  }
  useEffect(()=>{
    const controller=new AbortController()
    const run=async()=>{if(document.hidden)return;try{await refreshRooms(controller.signal);setError("")}catch{if(!controller.signal.aborted){setLoading(false);setError(t("تعذر تحديث المحادثات. حاول مرة أخرى.","Could not refresh conversations. Please retry."))}}}
    void run();const timer=setInterval(run,10000)
    window.addEventListener('chat-updated',run)
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('chat-updated',run)}
  },[ar,t])
  useEffect(()=>{
    current.current=selected;setMessages([]);setReadBy([]);setReply(undefined);setText("");setOlder(false);nearBottom.current=true
    if(!selected)return
    const controller=new AbortController();let cursor=0,busy=false
    setThreadLoading(true)
    const run=async()=>{
      if(busy||document.hidden)return;busy=true
      try{
        const response=await fetch(`/api/chat?action=messages&conversationId=${encodeURIComponent(selected)}${cursor?`&after=${cursor}`:""}`,{cache:'no-store',signal:controller.signal})
        if(response.status===404){setSelected(null);signalChange();return}
        if(!response.ok)throw Error('unavailable')
        const data=await response.json();if(controller.signal.aborted)return
        if(!cursor)setOlder(data.hasMore)
        cursor=Math.max(cursor,...data.messages.map((message:Message)=>message.sequence))
        setMessages(previous=>[...new Map([...previous,...data.messages].map((message:Message)=>[message._id,message])).values()].sort((a,b)=>a.sequence-b.sequence))
        setPending(previous=>previous.filter(draft=>!data.messages.some((message:Message)=>message.clientMessageId===draft.id)))
        setReadBy(data.readBy);setThreadLoading(false);setError("")
        if(cursor)await api({action:'delivered',receipts:[{conversationId:selected,sequence:cursor}]})
        // Reading requires the open conversation to be visible and focused,
        // after React has had a frame to render its received messages.
        if(cursor&&nearBottom.current&&document.hasFocus()){
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
          if(!controller.signal.aborted&&!document.hidden&&document.hasFocus()&&nearBottom.current&&current.current===selected){await api({action:'read',conversationId:selected,sequence:cursor});setRooms(previous=>previous.map(item=>item.id===selected?{...item,unread:0}:item));signalChange()}
        }
      }catch{if(!controller.signal.aborted){setThreadLoading(false);setError(t("الاتصال انقطع. بنحاول نحدّث المحادثة.","Connection interrupted. Retrying conversation updates."))}}
      finally{busy=false}
    }
    void run();const timer=setInterval(run,4000)
    document.addEventListener('visibilitychange',run)
    window.addEventListener('focus',run)
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',run);window.removeEventListener('focus',run)}
  },[selected,ar,t])
  useEffect(()=>{if(nearBottom.current)list.current?.scrollTo({top:list.current.scrollHeight,behavior:'auto'})},[messages,pending,selected])
  useEffect(()=>{
    if(!modal)return
    const controller=new AbortController();setDirectoryLoading(true)
    const timer=setTimeout(async()=>{try{
      const response=await fetch(`/api/chat?action=directory&group=${group||modal==='manage'}&q=${encodeURIComponent(directorySearch)}`,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('unavailable')
      const data=await response.json();if(!controller.signal.aborted)setDirectory(data.people)
    }catch{if(!controller.signal.aborted)setModalError(t("تعذر تحميل الأشخاص","Could not load people"))}finally{if(!controller.signal.aborted)setDirectoryLoading(false)}},200)
    return()=>{controller.abort();clearTimeout(timer)}
  },[modal,directorySearch,group,ar,t])
  const select=(id:string)=>{setSelected(id);setError("")}
  const send=async(draft?:Draft)=>{
    if(!selected||!user||sending)return
    const item=draft||{id:crypto.randomUUID(),text:text.trim(),reply,failed:false,conversationId:selected}
    if(!item.text)return
    if(!draft){setPending(previous=>[...previous,item]);setText("");setReply(undefined);nearBottom.current=true}
    else setPending(previous=>previous.map(value=>value.id===item.id?{...value,failed:false}:value))
    setSending(true)
    try{
      const data=await api({action:'send',conversationId:item.conversationId,text:item.text,clientMessageId:item.id,...(item.reply?{replyTo:item.reply._id}:{})})
      if(current.current===item.conversationId)setMessages(previous=>[...new Map([...previous,data.message].map((value:Message)=>[value._id,value])).values()].sort((a,b)=>a.sequence-b.sequence))
      setPending(previous=>previous.filter(value=>value.id!==item.id));signalChange()
    }catch{setPending(previous=>previous.map(value=>value.id===item.id?{...value,failed:true}:value))}
    finally{setSending(false);textarea.current?.focus()}
  }
  const loadOlder=async()=>{
    if(!selected||!messages.length||loadingOlder)return
    setLoadingOlder(true);const id=selected,height=list.current?.scrollHeight||0
    try{const response=await fetch(`/api/chat?action=messages&conversationId=${encodeURIComponent(id)}&before=${messages[0].sequence}`,{cache:'no-store'});if(!response.ok)throw Error('unavailable');const data=await response.json();if(current.current!==id)return
      nearBottom.current=false;setMessages(previous=>[...data.messages,...previous]);setOlder(data.hasMore);requestAnimationFrame(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight-height})
    }catch{setError(t("تعذر تحميل الرسائل الأقدم","Could not load older messages"))}finally{setLoadingOlder(false)}
  }
  const openModal=(mode:"create"|"manage")=>{setModal(mode);setGroup(mode==='manage');setTitle(mode==='manage'?room?.title||"":"");setChosen(mode==='manage'?room?.members||[]:[]);setDirectorySearch("");setModalError("")}
  const save=async()=>{
    setSaving(true);setModalError("")
    try{
      if(modal==='manage'&&room){await api({action:'manage',conversationId:room.id,title,add:chosen.filter(p=>!room.members.some(m=>m.id===p.id)).map(p=>p.id),remove:room.members.filter(p=>!chosen.some(m=>m.id===p.id)).map(p=>p.id)})}
      else{const data=await api({action:'create',kind:group?'group':'direct',...(group?{title}:{}),userIds:chosen.map(p=>p.id)});setSelected(data.id)}
      await refreshRooms();setModal(null);signalChange()
    }catch(error){setModalError(error instanceof Error?error.message:t("تعذر حفظ المحادثة","Could not save conversation"))}finally{setSaving(false)}
  }
  const role=(person:Person)=>person.role==='super_admin'?t("أدمن","Admin"):person.role==='staff'?t("موظف","Staff"):t("عميل","Customer")
  const time=(date:string)=>new Intl.DateTimeFormat(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit'}).format(new Date(date))
  return <div className={`flex ${portal?"h-[calc(100dvh-9rem)] md:h-[calc(100dvh-4rem)]":"h-[calc(100dvh-4rem)]"} min-h-[350px] flex-col bg-white dark:bg-[#0b1120]`}>
    {error&&<div role="status" className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"><span>{error}</span><button onClick={()=>void refreshRooms().catch(()=>{})} aria-label={t("إعادة المحاولة","Retry")}><RefreshCw className="h-4 w-4"/></button></div>}
    <div className="flex min-h-0 flex-1">
      <aside className={`${selected?'hidden md:flex':'flex'} w-full shrink-0 flex-col border-e border-slate-200 md:w-80 lg:w-96 dark:border-slate-800`}>
        <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("المحادثات","Messages")}</h2><p className="mt-0.5 text-[11px] text-slate-500">{t("تواصل واضح، في مكان واحد","Keep every conversation together")}</p></div>{isStaff&&<button onClick={()=>openModal('create')} title={t("محادثة جديدة","New conversation")} aria-label={t("محادثة جديدة","New conversation")} className="rounded-xl bg-primary-600 p-2.5 text-white hover:bg-primary-700"><Plus className="h-4 w-4"/></button>}</div><label className="relative block"><span className="sr-only">{t("بحث في المحادثات","Search conversations")}</span><Search className="absolute start-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("ابحث عن شخص أو مجموعة…","Find a person or group…")} className={`${field} ps-9`}/></label></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading?<div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-primary-500"/></div>:rooms.filter(item=>[item.title,item.lastMessage,...item.members.map(p=>p.name)].some(value=>value.toLowerCase().includes(search.toLowerCase()))).map(item=><button key={item.id} onClick={()=>select(item.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-start transition-colors ${selected===item.id?'bg-primary-50 dark:bg-primary-950/40':'hover:bg-slate-50 dark:hover:bg-slate-900'}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.kind==='group'?'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300':'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300'}`}>{item.kind==='group'?<Users className="h-5 w-5"/>:<span className="text-sm font-bold">{item.title.slice(0,2).toUpperCase()}</span>}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.title}</span><time className="shrink-0 text-[10px] text-slate-400">{time(item.updatedAt)}</time></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{item.lastMessage||t("ابدأ المحادثة","Start the conversation")}</span>{item.unread>0&&<span className="min-w-5 rounded-full bg-primary-600 px-1.5 text-center text-[10px] leading-5 text-white">{item.unread>99?'99+':item.unread}</span>}</span></span></button>)}
          {!loading&&!rooms.length&&<div className="p-8 text-center"><MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300"/><p className="text-sm text-slate-500">{isStaff?t("ابدأ محادثة مع موظف أو عميل","Start a conversation with a colleague or customer"):t("ستظهر هنا محادثاتك مع فريق العمل","Your conversations with the team will appear here")}</p></div>}
        </div>
      </aside>
      <section className={`${selected?'flex':'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {room?<><div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><button onClick={()=>setSelected(null)} aria-label={t("الرجوع للمحادثات","Back to conversations")} className="rounded-lg p-1.5 text-slate-500 md:hidden"><ArrowRight className="h-5 w-5 ltr:rotate-180"/></button><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50">{room.kind==='group'?<Users className="h-5 w-5"/>:<UserRound className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{room.title}</h3><p className="mt-0.5 truncate text-[11px] text-slate-500">{room.kind==='group'?`${room.members.length} ${t("أعضاء · مجموعة داخلية","members · Internal group")}`:room.members.filter(p=>p.id!==user?.id).map(p=>role(p)).join(' · ')}</p></div>{room.canManage&&<button onClick={()=>openModal('manage')} title={t("إدارة المجموعة","Manage group")} aria-label={t("إدارة المجموعة","Manage group")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Settings className="h-4 w-4"/></button>}</div>
          <div ref={list} onScroll={()=>{if(list.current)nearBottom.current=list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight<100}} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-5 sm:px-6 dark:bg-[#0d1526]">
            {older&&<div className="mb-4 text-center"><button onClick={()=>void loadOlder()} disabled={loadingOlder} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900">{loadingOlder?t("تحميل…","Loading…"):t("رسائل أقدم","Older messages")}</button></div>}
            {threadLoading?<div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-primary-500"/></div>:!messages.length&&<div className="py-12 text-center text-xs text-slate-400">{t("بداية محادثة جديدة. اكتب أول رسالة.","A new conversation. Write the first message.")}</div>}
            {messages.map((message,index)=>{const own=message.senderId===user?.id,date=new Intl.DateTimeFormat(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo',day:'numeric',month:'long',year:'numeric'}).format(new Date(message.createdAt));const previous=index?new Date(messages[index-1].createdAt).toLocaleDateString('en-GB',{timeZone:'Africa/Cairo'}):'';const showDate=previous!==new Date(message.createdAt).toLocaleDateString('en-GB',{timeZone:'Africa/Cairo'});const receipt=messageReceipt(message.sequence,message.senderId,readBy,message.recipientIds)
              return <div key={message._id}>{showDate&&<div className="my-4 text-center"><span className="rounded-full bg-slate-200/70 px-3 py-1 text-[10px] text-slate-500 dark:bg-slate-800">{date}</span></div>}<div className={`group mb-3 flex items-end gap-1.5 ${own?'justify-start':'justify-end'}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[75%] ${own?'rounded-ss-sm bg-primary-600 text-white':'rounded-se-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                {!own&&room.kind==='group'&&<p className="mb-1.5 text-[11px] font-bold text-primary-500">{message.sender.name}</p>}
                {message.replyTo&&<blockquote className={`mb-2 rounded-lg border-s-2 p-2 text-xs ${own?'border-white/60 bg-white/10':'border-primary-400 bg-primary-50 dark:bg-slate-900'}`}><p className="mb-1 font-bold">{message.replyTo.name}</p><p className="line-clamp-2 whitespace-pre-wrap break-words opacity-75">{message.replyTo.text}</p></blockquote>}
                <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.text}</p><div className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] ${own?'text-white/70':'text-slate-400'}`}><time>{time(message.createdAt)}</time>{own&&<MessageReceipt status={receipt} ar={ar}/>}</div>
              </div><button onClick={()=>{setReply(message);textarea.current?.focus()}} aria-label={t("رد على الرسالة","Reply to message")} title={t("رد","Reply")} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-slate-800"><Reply className="h-3.5 w-3.5"/></button></div></div>})}
            {pending.filter(draft=>draft.conversationId===selected).map(draft=><div key={draft.id} className="mb-3 max-w-[85%] rounded-2xl border border-primary-200 bg-primary-50 p-3 dark:border-primary-900 dark:bg-primary-950/40"><p dir="auto" className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{draft.text}</p>{draft.failed?<button onClick={()=>void send(draft)} disabled={sending} className="mt-2 text-xs font-semibold text-amber-600">{t("لم يتأكد الإرسال · إعادة المحاولة","Send unconfirmed · Retry")}</button>:<p className="mt-1 text-[10px] text-slate-400">{t("جارٍ الإرسال…","Sending…")}</p>}</div>)}
          </div>
          <form onSubmit={e=>{e.preventDefault();void send()}} className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0b1120]">{reply&&<div className="mb-2 flex items-center justify-between gap-3 rounded-lg border-s-2 border-primary-500 bg-primary-50 p-2 text-xs dark:bg-primary-950/30"><div className="min-w-0"><p className="font-semibold text-primary-600">{t("رد على ","Reply to ")}{reply.sender.name}</p><p className="mt-1 truncate text-slate-500">{reply.text}</p></div><button type="button" aria-label={t("إلغاء الرد","Cancel reply")} onClick={()=>setReply(undefined)}><X className="h-4 w-4 text-slate-400"/></button></div>}<div className="flex items-end gap-2"><textarea ref={textarea} aria-label={t("رسالتك","Your message")} dir="auto" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}} maxLength={4000} rows={2} placeholder={t("اكتب رسالة…","Write a message…")} className="max-h-36 min-h-12 flex-1 resize-none rounded-xl border-0 bg-slate-100 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-primary-500 dark:bg-slate-800 dark:text-white"/><button type="submit" disabled={sending||!text.trim()} aria-label={t("إرسال الرسالة","Send message")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white disabled:opacity-40">{sending?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4 rtl:rotate-180"/>}</button></div><p className="mt-1.5 text-[9px] text-slate-400">{t("Enter للإرسال · Shift + Enter لسطر جديد · الوقت بتوقيت القاهرة","Enter to send · Shift + Enter for a new line · Cairo time")}</p></form>
        </>:<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><div className="rounded-3xl bg-primary-50 p-6 dark:bg-primary-950/40"><MessageSquare className="h-10 w-10 text-primary-500"/></div><h3 className="mt-2 text-xl font-bold text-slate-800 dark:text-white">{t("كل محادثة ليها مكان","A place for every conversation")}</h3><p className="max-w-xs text-sm leading-6 text-slate-500">{t("اختار محادثة للمتابعة، أو ابدأ تواصل جديد مع فريقك وعملائك.","Select a conversation to continue, or start talking to your team and customers.")}</p></div>}
      </section>
    </div>
    {modal&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={()=>{if(!saving)setModal(null)}}><div role="dialog" aria-modal="true" aria-label={modal==='manage'?t("إدارة المجموعة","Manage group"):t("محادثة جديدة","New conversation")} onClick={e=>e.stopPropagation()} className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-950"><div className="mb-4 flex items-center justify-between"><h3 className="text-base font-bold text-slate-900 dark:text-white">{modal==='manage'?t("إدارة المجموعة","Manage group"):t("محادثة جديدة","New conversation")}</h3><button disabled={saving} onClick={()=>setModal(null)} aria-label={t("إغلاق","Close")}><X className="h-5 w-5 text-slate-400"/></button></div>
      {modal==='create'&&<div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">{[false,true].map(value=><button key={String(value)} onClick={()=>{setGroup(value);setChosen([])}} className={`rounded-lg px-3 py-2 text-xs font-semibold ${group===value?'bg-white text-primary-600 shadow-sm dark:bg-slate-800':'text-slate-500'}`}>{value?t("مجموعة موظفين","Staff group"):t("رسالة خاصة","Direct message")}</button>)}</div>}
      {(group||modal==='manage')&&<input aria-label={t("اسم المجموعة","Group name")} value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} placeholder={t("اسم المجموعة","Group name")} className={`${field} mb-3`}/>}
      <input aria-label={t("بحث عن شخص","Search people")} value={directorySearch} onChange={e=>setDirectorySearch(e.target.value)} placeholder={group||modal==='manage'?t("ابحث عن موظف…","Find a colleague…"):t("ابحث عن موظف أو عميل أو شركة…","Find a colleague, customer or company…")} className={`${field} mb-3`}/>
      {chosen.length>0&&<div className="mb-3 flex max-h-24 flex-wrap gap-1 overflow-y-auto">{chosen.map(p=><button key={p.id} disabled={modal==='manage'&&p.id===room?.ownerId} onClick={()=>setChosen(previous=>previous.filter(v=>v.id!==p.id))} className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] text-primary-700 dark:bg-primary-950 dark:text-primary-300">{p.name}<X className="h-3 w-3"/></button>)}</div>}
      <div className="min-h-32 flex-1 overflow-y-auto">{directoryLoading?<Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-primary-500"/>:directory.filter(p=>p.id!==user?.id).map(p=><button key={p.id} disabled={modal==='manage'&&p.id===room?.ownerId} onClick={()=>setChosen(previous=>previous.some(v=>v.id===p.id)?previous.filter(v=>v.id!==p.id):group||modal==='manage'?[...previous,p]:[p])} className="flex w-full items-center gap-3 rounded-xl p-3 text-start hover:bg-slate-50 dark:hover:bg-slate-900"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">{p.name.slice(0,2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">{p.name}</span><span className="block truncate text-[11px] text-slate-400">{role(p)}{p.company?` · ${p.company}`:p.username?` · @${p.username}`:''}</span></span>{chosen.some(v=>v.id===p.id)&&<Check className="h-4 w-4 text-primary-500"/>}</button>)}{!directoryLoading&&!directory.length&&<p className="p-6 text-center text-xs text-slate-400">{t("لا توجد نتائج","No results")}</p>}</div>
      {modalError&&<p role="alert" className="mt-3 text-xs text-rose-600">{modalError}</p>}<button onClick={()=>void save()} disabled={saving||(!chosen.length&&modal==='create')||((group||modal==='manage')&&title.trim().length<2)} className="mt-4 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving?t("جارٍ الحفظ…","Saving…"):modal==='manage'?t("حفظ التغييرات","Save changes"):group?t("إنشاء المجموعة","Create group"):t("فتح المحادثة","Open conversation")}</button>
    </div></div>}
  </div>
}

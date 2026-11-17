"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "@/navigation"
import { ChevronRight, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import { MAILBOX_REFRESH_EVENT, type MailboxStatus, type MailListing, type MailSummary } from "./types"
export function MailboxUnreadBadge({ ar }: { ar: boolean }) {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<MailSummary[]>([])
  const [loading, setLoading] = useState(false)
  const previous = useRef<number | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const router = useRouter()
  useEffect(() => {
    let disposed = false, sequence = 0
    const refresh = async () => {
      if (document.visibilityState === "hidden") return
      const current = ++sequence
      try {
        const response = await fetch("/api/admin/mailbox?action=status", { cache: "no-store" })
        if (!response.ok) return
        const data: MailboxStatus = await response.json()
        if (disposed || current !== sequence) return
        const unread = data.available && data.connected && Number.isSafeInteger(data.unread) ? data.unread : 0
        if (previous.current !== null && unread > previous.current) toast.info(ar ? "وصلت رسالة بريد جديدة" : "New email received")
        previous.current = unread; setCount(unread)
      } catch { /* Keep the last confirmed count on a temporary connection error. */ }
    }
    void refresh()
    const interval = setInterval(() => void refresh(), 60000)
    const changed = (event: Event) => {
      const unread = (event as CustomEvent<{ unread?: number }>).detail?.unread
      if (Number.isSafeInteger(unread) && unread! >= 0) { sequence++; previous.current = unread!; setCount(unread!) }
      else void refresh()
    }
    document.addEventListener("visibilitychange", refresh); window.addEventListener(MAILBOX_REFRESH_EVENT, changed)
    return () => { disposed = true; sequence++; clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener(MAILBOX_REFRESH_EVENT, changed) }
  }, [ar])
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    void (async () => {
      try {
        const statusResponse = await fetch("/api/admin/mailbox?action=status", { cache: "no-store" })
        if (!statusResponse.ok) return
        const status: MailboxStatus = await statusResponse.json()
        if (!status.available || !status.connected) { if (alive) setMessages([]); return }
        const response = await fetch("/api/admin/mailbox?action=list&folder=INBOX&page=0", { cache: "no-store" })
        if (!response.ok) return
        const listing: MailListing = await response.json()
        if (alive) { setMessages(listing.messages.slice(0, 20)); setCount(listing.unread) }
      } catch { /* Keep the compact preview available during temporary mail server issues. */ }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [open])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false)
      if (event instanceof MouseEvent && !panel.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", dismiss); document.addEventListener("keydown", dismiss)
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", dismiss) }
  }, [open])
  const openMessage = (item: MailSummary) => {
    setOpen(false)
    router.push(`/admin/mailbox?folder=INBOX&uid=${item.uid}`)
  }
  return <div className="relative ms-auto" ref={panel}>
    <button type="button" onClick={() => setOpen(value => !value)} aria-label={ar ? "أحدث رسائل البريد" : "Latest emails"} aria-expanded={open} title={ar ? "أحدث رسائل البريد" : "Latest emails"} className="relative grid h-7 w-7 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
      <Mail className="h-3.5 w-3.5" />
      {count > 0 && <span aria-label={ar ? `${count} رسالة غير مقروءة` : `${count} unread emails`} className="absolute -end-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 py-0.5 text-center text-[9px] font-bold leading-none text-white">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && <section aria-label={ar ? "أحدث الإيميلات" : "Latest emails"} className="absolute start-full top-0 z-[60] ms-2 flex h-[min(380px,70vh)] w-[min(500px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800"><div><h2 className="text-sm font-bold">{ar ? "أحدث الإيميلات" : "Latest emails"}</h2><p className="mt-0.5 text-[11px] text-slate-500">{ar ? "الوارد · اضغط لفتح الرسالة" : "Inbox · Select to open"}</p></div><span className="text-[10px] text-slate-500">{count} {ar ? "غير مقروءة" : "unread"}</span></header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading && messages.length === 0 && <p className="flex items-center justify-center gap-2 p-6 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{ar ? "جاري تحميل الرسائل…" : "Loading emails…"}</p>}
        {!loading && messages.length === 0 && <p className="p-6 text-center text-xs text-slate-500">{ar ? "لا توجد رسائل واردة." : "No inbox messages."}</p>}
        {messages.map(item => <button key={item.uid} type="button" onClick={() => openMessage(item)} className={`block w-full border-b border-slate-100 px-4 py-3 text-start transition-colors dark:border-slate-800 ${item.seen ? "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800" : "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950/70"}`}>
          <span className="flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-xs ${item.seen ? "font-medium text-slate-600 dark:text-slate-300" : "font-bold text-slate-950 dark:text-white"}`}>{item.from[0]?.name || item.from[0]?.address || (ar ? "مرسل غير معروف" : "Unknown sender")}</span>{!item.seen && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />}</span>
          <span className={`mt-1 block truncate text-xs ${item.seen ? "text-slate-500" : "font-semibold text-slate-800 dark:text-slate-100"}`}>{item.subject || (ar ? "بدون عنوان" : "No subject")}</span>
          <span className="mt-1 block text-[10px] text-slate-400">{item.date ? new Date(item.date).toLocaleString(ar ? "ar-EG" : "en-GB") : ""}</span>
        </button>)}
      </div>
      <button type="button" onClick={() => { setOpen(false); router.push("/admin/mailbox") }} className="flex shrink-0 items-center justify-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:border-slate-800 dark:text-primary-300 dark:hover:bg-slate-800">{ar ? "فتح صندوق البريد" : "Open mailbox"}<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" /></button>
    </section>}
  </div>
}

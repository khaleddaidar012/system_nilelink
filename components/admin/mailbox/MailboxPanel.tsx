"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale } from "next-intl"
import { useSearchParams } from "next/navigation"
import { Mail, Inbox, Send, Plus, RefreshCw, Settings2, Unplug, Reply, Paperclip, X, ArrowLeft, Loader2, ShieldCheck, AlertCircle, PenLine, FilePenLine, ShieldAlert, ArchiveX, Trash2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdminHomeLink } from "@/components/admin/AdminHeader"
import { MAILBOX_REFRESH_EVENT, type MailboxStatus, type MailListing, type MailMessage, type MailSummary } from "./types"

const inputClass = "box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900"
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
interface ComposeDraft { requestId: string; to: string; cc: string; subject: string; text: string; quote?: string; includeSignature: boolean; reply?: { folder: string; uid: number; uidValidity: string }; attachments: { name: string; contentType: string; base64: string }[] }
function folderPresentation(folder: { path: string; name: string; specialUse: string | null }, ar: boolean): { label: string; Icon: LucideIcon } {
  const path = folder.path.trim().toLowerCase(), name = folder.name.trim().toLowerCase(), special = (folder.specialUse || "").trim().toLowerCase()
  const text = `${path} ${name} ${special}`
  if (path === "inbox" || name === "inbox" || special.includes("\\inbox")) return { label: ar ? "الوارد" : "Inbox", Icon: Inbox }
  if (/sent items/.test(text)) return { label: ar ? "عناصر المرسل" : "Sent Items", Icon: Send }
  if (special.includes("\\sent") || /(^|[\\/ ])sent([\\/ ]|$)/.test(text)) return { label: ar ? "المرسل" : "Sent", Icon: Send }
  if (special.includes("\\drafts") || /draft/.test(text)) return { label: ar ? "المسودات" : "Drafts", Icon: FilePenLine }
  if (special.includes("\\junk") || /junk|spam|bulk/.test(text)) return { label: ar ? "البريد المزعج" : "Junk E-mail", Icon: ShieldAlert }
  if (/deleted items|deleted/.test(text)) return { label: ar ? "العناصر المحذوفة" : "Deleted Items", Icon: ArchiveX }
  if (special.includes("\\trash") || /(^|[\\/ ])trash([\\/ ]|$)/.test(text)) return { label: ar ? "المهملات" : "Trash", Icon: Trash2 }
  return { label: folder.name, Icon: Mail }
}
function errorMessage(code: string, ar: boolean): string {
  const values: Record<string, [string, string]> = {
    MAILBOX_NOT_CONFIGURED: ["موصل البريد لم يُربط بالسيرفر بعد. تواصل مع مسؤول النظام.", "The mail connector is not configured yet. Contact your administrator."],
    MAIL_SERVER_UNAVAILABLE: ["تعذر الاتصال بصندوق البريد. راجع بيانات الدخول واتصال السيرفر.", "Could not connect to the mailbox. Check the credentials and server connection."],
    SEND_OUTCOME_UNKNOWN: ["تعذر تأكيد نتيجة الإرسال. راجع صندوق المرسل أو مسؤول النظام قبل إعادة إرسال الرسالة؛ لن نكرر إرسالها تلقائيًا.", "The sending result is uncertain. Check Sent or contact your administrator before resending; this message will not be automatically sent again."],
    MAILBOX_CHANGED: ["تغيّر صندوق البريد. حدّث قائمة الرسائل ثم افتح الرسالة من جديد.", "The mailbox changed. Refresh the list and reopen the message."],
    MESSAGE_TOO_LARGE: ["هذه الرسالة أكبر من حد العرض (8 ميجابايت). افتحها من الويب ميل.", "This message exceeds the 8 MB display limit. Open it in webmail."],
    MESSAGE_NOT_FOUND: ["الرسالة لم تعد موجودة. حدّث القائمة.", "This message is no longer available. Refresh the list."],
    ACCOUNT_CHANGED: ["تغيّرت إعدادات الحساب أثناء العملية. حدّث الصفحة وحاول مجددًا.", "Account settings changed during the operation. Refresh and try again."],
    DOMAIN_NOT_ALLOWED: ["استخدم بريد الشركة المنتهي بـ @nilelinklogistics.com.", "Use your @nilelinklogistics.com work email."],
    RATE_LIMIT: ["طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.", "Too many requests. Please wait and try again."],
    ATTACHMENTS_TOO_LARGE: ["حجم المرفقات يتجاوز 5 ميجابايت.", "Attachments exceed the 5 MB limit."],
    REQUEST_CONFLICT: ["هذا الطلب مستخدم لرسالة مختلفة. راجع صندوق المرسل قبل إنشاء رسالة جديدة.", "This request belongs to another draft. Check Sent before composing a new message."],
  }
  return values[code]?.[ar ? 0 : 1] || (ar ? "تعذر إتمام الطلب. تحقق من البيانات وحاول مجددًا." : "Could not complete the request. Check the details and try again.")
}
async function api<T>(query: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/admin/mailbox" + query, { method: body ? "POST" : "GET", cache: "no-store", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "MAILBOX_UNAVAILABLE")
  return data
}
export function MailboxPanel() {
  const locale = useLocale(), ar = locale === "ar"
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<MailboxStatus | null>(null), [settings, setSettings] = useState(false)
  const [email, setEmail] = useState(""), [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("")
  const [folder, setFolder] = useState("INBOX"), [page, setPage] = useState(0), [listing, setListing] = useState<MailListing | null>(null)
  const [message, setMessage] = useState<MailMessage | null>(null), [reading, setReading] = useState(false), [draft, setDraft] = useState<ComposeDraft | null>(null)
  const [selectedUid, setSelectedUid] = useState<number | null>(null)
  const [sending, setSending] = useState(false), [uncertain, setUncertain] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const readSequence = useRef(0), listSequence = useRef(0)
  const autoOpenedUid = useRef("")
  const selectedRow = useRef<HTMLButtonElement | null>(null)
  const notify = (unread: number) => window.dispatchEvent(new CustomEvent(MAILBOX_REFRESH_EVENT, { detail: { unread } }))
  const loadStatus = useCallback(async () => {
    try { const value = await api<MailboxStatus>("?action=status"); setStatus(value); setEmail(value.email?.split("@")[0] || "") }
    catch (err) { setError(errorMessage((err as Error).message, ar)) }
  }, [ar])
  useEffect(() => { void loadStatus() }, [loadStatus])
  const loadList = useCallback(async () => {
    if (!status?.available || !status.connected) return
    const current = ++listSequence.current; setLoading(true)
    try {
      const data = await api<MailListing>(`?action=list&folder=${encodeURIComponent(folder)}&page=${page}`)
      if (current !== listSequence.current) return
      setListing(data); notify(data.unread); setStatus(previous => previous ? { ...previous, unread: data.unread } : previous)
    } catch (err) { if (current === listSequence.current) setError(errorMessage((err as Error).message, ar)) }
    finally { if (current === listSequence.current) setLoading(false) }
  }, [status?.available, status?.connected, folder, page, ar])
  useEffect(() => { void loadList() }, [loadList])
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState !== "hidden" && !draft) void loadList() }, 60000)
    return () => clearInterval(interval)
  }, [loadList, draft])
  useEffect(() => () => { readSequence.current++; listSequence.current++ }, [])
  const connect = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("")
    try { await api("", { action: "connect", email: email.trim().includes("@") ? email.trim() : `${email.trim()}@nilelinklogistics.com`, password }); readSequence.current++; listSequence.current++; setPassword(""); setSettings(false); setListing(null); setMessage(null); setFolder("INBOX"); setPage(0); await loadStatus(); setNotice(ar ? "تم ربط صندوق البريد بحسابك." : "Your mailbox is connected.") }
    catch (err) { setError(errorMessage((err as Error).message, ar)) }
    finally { setBusy(false) }
  }
  const disconnect = async () => {
    setBusy(true); setError("")
    try { await api("", { action: "disconnect" }); readSequence.current++; listSequence.current++; setListing(null); setMessage(null); setDraft(null); setPassword(""); setSettings(false); notify(0); await loadStatus() }
    catch (err) { setError(errorMessage((err as Error).message, ar)) }
    finally { setBusy(false) }
  }
  const openMessage = useCallback(async (item: MailSummary) => {
    if (!listing) return
    setSelectedUid(item.uid)
    const sequence = ++readSequence.current, validity = listing.uidValidity
    setReading(true); setMessage(null); setError("")
    try {
      const data = await api<MailMessage>(`?action=message&folder=${encodeURIComponent(folder)}&uid=${item.uid}&uidValidity=${validity}`)
      if (sequence !== readSequence.current) return
      setMessage(data)
      if (!item.seen) {
        listSequence.current++; setLoading(false)
        const result = await api<{ unread: number }>("", { action: "read", folder, uid: item.uid, uidValidity: validity })
        if (sequence !== readSequence.current) return
        setListing(previous => previous ? { ...previous, messages: previous.messages.map(m => m.uid === item.uid ? { ...m, seen: true } : m), unread: result.unread } : previous)
        setStatus(previous => previous ? { ...previous, unread: result.unread } : previous); notify(result.unread)
      }
    } catch (err) { if (sequence === readSequence.current) setError(errorMessage((err as Error).message, ar)) }
    finally { if (sequence === readSequence.current) setReading(false) }
  }, [listing, folder, ar])
  useEffect(() => {
    const requestedUid = searchParams.get("uid")
    if (!requestedUid || !listing || folder !== (searchParams.get("folder") || "INBOX")) return
    const key = `${folder}:${requestedUid}`
    if (autoOpenedUid.current === key) return
    const item = listing.messages.find(candidate => String(candidate.uid) === requestedUid)
    if (!item) return
    autoOpenedUid.current = key
    void openMessage(item)
  }, [searchParams, listing, folder, openMessage])
  useEffect(() => {
    if (message) selectedRow.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [message])
  const compose = (reply = false) => {
    setError(""); setUncertain(false)
    setDraft({ requestId: crypto.randomUUID(), to: reply ? message?.replyTo.map(a => a.address).filter(Boolean).join(", ") || "" : "", cc: "", subject: reply ? (/^re:/i.test(message?.subject || "") ? message!.subject : `Re: ${message?.subject || ""}`) : "", text: "", ...(reply ? { quote: `From: ${message?.from.map(a => a.address).join(", ") || ""}${message?.date ? `\nDate: ${new Date(message.date).toLocaleString(locale)}` : ""}\n\n${message?.text || ""}` } : {}), includeSignature: false, ...(reply && message && listing ? { reply: { folder, uid: message.uid, uidValidity: listing.uidValidity } } : {}), attachments: [] })
  }
  const attach = async (files: FileList | null) => {
    if (!files || !draft) return
    const chosen = Array.from(files)
    if (chosen.length + draft.attachments.length > 5 || chosen.reduce((n, f) => n + f.size, 0) + draft.attachments.reduce((n, a) => n + a.base64.length * 0.75, 0) > 5 * 1024 * 1024) { setError(errorMessage("ATTACHMENTS_TOO_LARGE", ar)); return }
    setAttaching(true)
    try {
      const attachments = await Promise.all(chosen.map(file => new Promise<{ name: string; contentType: string; base64: string }>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve({ name: file.name, contentType: file.type || "application/octet-stream", base64: String(reader.result).split(",")[1] }); reader.readAsDataURL(file) })))
      setDraft(previous => previous?.requestId === draft.requestId ? { ...previous, attachments: [...previous.attachments, ...attachments] } : previous)
    } catch { setError(ar ? "تعذر قراءة المرفق." : "Could not read the attachment.") }
    finally { setAttaching(false) }
  }
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!draft || sending || attaching || uncertain) return
    setSending(true); setError(""); setNotice("")
    try {
      const result = await api<{ accepted: boolean; sentCopySaved: boolean; partialDelivery: boolean }>("", { ...draft, action: "send", to: draft.to.split(/[,;]+/).map(v => v.trim()).filter(Boolean), cc: draft.cc.split(/[,;]+/).map(v => v.trim()).filter(Boolean) })
      setDraft(null)
      setNotice(result.partialDelivery ? (ar ? "قبل السيرفر الإرسال لبعض المستلمين فقط. راجع بريدك قبل إعادة المحاولة." : "The server accepted delivery to only some recipients. Check your mailbox before resending.") : result.sentCopySaved ? (ar ? "تم قبول الرسالة للإرسال وحفظ نسخة في المرسل." : "The server accepted the message and saved a copy in Sent.") : (ar ? "قبل السيرفر الرسالة للإرسال، لكن تعذر حفظ نسخة في المرسل. لا تعِد إرسالها." : "The server accepted the message, but the Sent copy could not be saved. Do not resend it."))
      void loadList()
    } catch (err) {
      const code = (err as Error).message
      const unknown = ["SEND_OUTCOME_UNKNOWN", "REQUEST_CONFLICT"].includes(code) || !["INVALID_REQUEST", "ATTACHMENTS_TOO_LARGE", "RATE_LIMIT", "MAILBOX_NOT_CONFIGURED", "MAILBOX_NOT_CONNECTED"].includes(code)
      if (unknown) setUncertain(true)
      setError(errorMessage(unknown && code !== "REQUEST_CONFLICT" ? "SEND_OUTCOME_UNKNOWN" : code, ar))
    } finally { setSending(false) }
  }
  const selectFolder = (value: string) => { readSequence.current++; setMessage(null); setSelectedUid(null); setFolder(value); setPage(0); setError("") }
  return <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6" dir={ar ? "rtl" : "ltr"}>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="flex items-center gap-3 text-2xl font-black"><Mail className="h-7 w-7 text-primary-600" />{ar ? "البريد الإلكتروني" : "Email"}</h1><p className="mt-1 text-sm text-slate-500">{ar ? "صندوق بريد عملك، مرتبط بحسابك فقط." : "Your work mailbox, linked only to your account."}</p></div>
      <div className="flex flex-wrap items-center gap-2"><a className={buttonClass} href="https://webmail.nilelinklogistics.com/Mondo/lang/sys/login.aspx" target="_blank" rel="noopener noreferrer">{ar ? "فتح الويب ميل" : "Open webmail"}</a>{status?.connected && <button className={buttonClass} onClick={() => setSettings(!settings)}><Settings2 className="h-4 w-4" />{ar ? "إعدادات الربط" : "Connection settings"}</button>}</div>
    </header>
    <div><AdminHomeLink /></div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {!status && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{ar ? "جاري التحقق من الاتصال…" : "Checking connection…"}</p>}
    {status?.needsServerSetup && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><h2 className="font-bold">{ar ? "خطوة إعداد مطلوبة على السيرفر" : "Server setup required"}</h2><p className="mt-2 leading-7">{ar ? "ثبّت موصل NileLink Mail Agent على سيرفر Windows، ثم اربط عنوانه الآمن بإعدادات الموقع. بعد نجاح الاتصال، يقدر كل موظف ربط بريده هنا. قراءة الرسائل والإرسال غير متاحين حتى اكتمال هذه الخطوة." : "Install NileLink Mail Agent on the Windows mail server and configure its secure endpoint. Once connected, each employee can link their own mailbox here. Reading and sending are unavailable until setup is complete."}</p></div>}
    {status && (!status.connected || settings) && <form onSubmit={connect} className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-bold">{ar ? "ربط بريد العمل" : "Connect your work mailbox"}</h2><p className="text-sm leading-6 text-slate-500">{ar ? "اكتب اسم مستخدم البريد فقط، مثل info، ثم كلمة مرور البريد. تُحفظ كلمة المرور مشفّرة." : "Enter only your mailbox username, such as info, and its password. The password is stored encrypted."}</p>
      <label className="block text-sm font-semibold">{ar ? "اسم مستخدم البريد" : "Mailbox username"}<input type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" placeholder="info" value={email} onChange={e => setEmail(e.target.value)} className={cn(inputClass, "mt-2")} disabled={busy || !status.available} /></label>
      <label className="block text-sm font-semibold">{ar ? "كلمة مرور البريد" : "Mailbox password"}<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={cn(inputClass, "mt-2")} disabled={busy || !status.available} /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !status.available} className={cn(buttonClass, "border-primary-600 bg-primary-600 text-white hover:bg-primary-700")}><ShieldCheck className="h-4 w-4" />{busy ? (ar ? "جاري التحقق…" : "Checking…") : (ar ? "اختبار الاتصال وربط البريد" : "Test and connect")}</button>{status.connected && <button type="button" onClick={() => void disconnect()} disabled={busy} className={cn(buttonClass, "text-rose-600")}><Unplug className="h-4 w-4" />{ar ? "فصل البريد من حسابي" : "Disconnect my mailbox"}</button>}</div>
    </form>}
    {status?.available && status.connected && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800"><div><p className="font-bold" dir="ltr">{status.email}</p><p className="mt-1 text-xs text-slate-500">{ar ? `${status.unread} رسالة غير مقروءة` : `${status.unread} unread messages`}</p></div><div className="flex gap-2"><button className={buttonClass} disabled={loading} onClick={() => void loadList()}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />{ar ? "تحديث" : "Refresh"}</button><button className={cn(buttonClass, "border-primary-600 bg-primary-600 text-white hover:bg-primary-700")} onClick={() => compose()}><Plus className="h-4 w-4" />{ar ? "رسالة جديدة" : "Compose"}</button></div></div>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3 dark:border-slate-800">{(listing?.folders || [{ path: "INBOX", name: "INBOX", specialUse: "\\Inbox" }]).map(f => { const folderView = folderPresentation(f, ar); const Icon = folderView.Icon; return <button key={f.path} title={f.name} onClick={() => selectFolder(f.path)} className={cn(buttonClass, f.path === folder && "border-primary-200 bg-primary-50 text-primary-700")}><Icon className="h-4 w-4" />{folderView.label}</button> })}</div>
      <div className="grid min-h-[520px] lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn("flex max-h-[min(760px,calc(100vh-230px))] min-h-[520px] flex-col overflow-hidden border-e border-slate-100 dark:border-slate-800", (message || reading) && "hidden lg:flex")}>
          {loading && !listing && <p className="shrink-0 p-6 text-sm text-slate-500">{ar ? "جاري تحميل الرسائل…" : "Loading messages…"}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!loading && listing?.messages.length === 0 && <p className="p-6 text-sm text-slate-500">{ar ? "لا توجد رسائل في هذا المجلد." : "This folder is empty."}</p>}
          {listing?.messages.map(item => {
            const selected = selectedUid === item.uid
            return <button key={item.uid} onClick={() => void openMessage(item)} aria-pressed={selected} className={cn(
              "block w-full border-b border-s-[3px] border-b-slate-100 border-s-transparent p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/60 dark:border-b-slate-800",
              item.seen ? "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70" : "bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-950/30 dark:hover:bg-sky-950/50",
              selected && "border-s-amber-500 bg-amber-50 ring-1 ring-inset ring-amber-300 dark:border-s-amber-400 dark:bg-amber-950/30 dark:ring-amber-800"
            )} ref={selected ? selectedRow : undefined}><span className="flex min-w-0 items-center justify-between gap-3"><span className={cn("min-w-0 flex-1 truncate text-sm", item.seen ? "font-medium text-slate-600 dark:text-slate-300" : "font-semibold text-slate-950 dark:text-slate-100")}>{item.from[0]?.name || item.from[0]?.address || (ar ? "مرسل غير معروف" : "Unknown sender")}</span>{!item.seen && <span aria-label={ar ? "غير مقروءة" : "Unread"} className="h-2 w-2 shrink-0 rounded-full bg-primary-500 ring-4 ring-primary-500/10 dark:bg-primary-400 dark:ring-primary-400/10" />}</span><span className={cn("mt-1.5 block truncate text-sm", item.seen ? "text-slate-500 dark:text-slate-400" : "font-medium text-slate-700 dark:text-slate-300")}>{item.subject || (ar ? "بدون عنوان" : "No subject")}</span><span className="mt-2.5 block text-[11px] text-slate-500 dark:text-slate-400">{item.date ? new Date(item.date).toLocaleString(locale) : ""}</span></button>
          })}
          </div>
          <div className="flex justify-between gap-2 p-3"><button disabled={page === 0 || loading} className={buttonClass} onClick={() => setPage(p => p - 1)}>{ar ? "الأحدث" : "Newer"}</button><button disabled={!listing?.hasMore || loading} className={buttonClass} onClick={() => setPage(p => p + 1)}>{ar ? "الأقدم" : "Older"}</button></div>
        </div>
        <div className={cn("min-w-0 p-5 sm:p-7", !message && !reading && "hidden lg:block")}>
          {reading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{ar ? "جاري فتح الرسالة…" : "Opening message…"}</p>}
          {!message && !reading && <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 text-slate-400"><Mail className="h-12 w-12" /><p>{ar ? "اختر رسالة لعرضها" : "Select a message to read"}</p></div>}
          {message && <><button onClick={() => { readSequence.current++; setMessage(null) }} className={cn(buttonClass, "mb-4 lg:hidden")}><ArrowLeft className="h-4 w-4" />{ar ? "العودة للرسائل" : "Back to messages"}</button><div className="flex flex-wrap justify-between gap-3"><h2 className="break-words text-xl font-bold">{message.subject || (ar ? "بدون عنوان" : "No subject")}</h2><button className={buttonClass} onClick={() => compose(true)}><Reply className="h-4 w-4" />{ar ? "رد" : "Reply"}</button></div><div className="my-4 space-y-1 border-b border-slate-100 pb-4 text-xs text-slate-500 dark:border-slate-800"><p dir="auto">{ar ? "من: " : "From: "}{message.from.map(a => `${a.name} <${a.address}>`).join(", ")}</p><p dir="auto">{ar ? "إلى: " : "To: "}{message.to.map(a => a.address).join(", ")}</p>{message.date && <p>{new Date(message.date).toLocaleString(locale)}</p>}</div>{message.html ? <iframe title={message.subject || (ar ? "محتوى البريد" : "Email content")} sandbox="" referrerPolicy="no-referrer" className="min-h-[520px] w-full rounded-lg border border-slate-100 bg-white dark:border-slate-800" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:; media-src https: data:; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:12px;font:14px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}pre{white-space:pre-wrap}a{overflow-wrap:anywhere}</style></head><body>${message.html}</body></html>`} /> : <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{message.text || (ar ? "لا تحتوي الرسالة على نص قابل للعرض." : "This message has no displayable text.")}</div>}{message.attachments.length > 0 && <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">{message.attachments.map(a => <a key={a.index} className={buttonClass} href={`/api/admin/mailbox?action=attachment&folder=${encodeURIComponent(folder)}&uid=${message.uid}&uidValidity=${listing?.uidValidity}&index=${a.index}`}><Paperclip className="h-4 w-4" />{a.name} · {Math.ceil(a.size / 1024)} KB</a>)}</div>}</>}
        </div>
      </div>
    </section>}
    {draft && <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain bg-slate-950/50 p-3 sm:p-8"><form onSubmit={send} role="dialog" aria-modal="true" aria-label={ar ? "كتابة رسالة" : "Compose message"} className="mx-auto box-border max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-3xl space-y-4 overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-xl sm:max-h-[calc(100dvh-4rem)] sm:p-5 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{draft.reply ? (ar ? "الرد على الرسالة" : "Reply") : (ar ? "رسالة جديدة" : "New message")}</h2><button type="button" disabled={sending || attaching} onClick={() => setDraft(null)} aria-label={ar ? "إغلاق" : "Close"} className={buttonClass}><X className="h-4 w-4" /></button></div><p className="text-xs text-slate-500">{ar ? "من: " : "From: "}{status?.email}</p>{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<fieldset disabled={sending || attaching || uncertain} className="min-w-0 space-y-3"><label className="block min-w-0 text-sm">{ar ? "إلى (افصل العناوين بفاصلة)" : "To (comma-separated)"}<input required dir="ltr" className={cn(inputClass, "mt-1")} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label><label className="block text-sm">CC<input dir="ltr" className={cn(inputClass, "mt-1")} value={draft.cc} onChange={e => setDraft({ ...draft, cc: e.target.value })} /></label><label className="block text-sm">{ar ? "الموضوع" : "Subject"}<input maxLength={250} className={cn(inputClass, "mt-1")} value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} /></label><label className="block text-sm">{ar ? "الرسالة" : "Message"}<textarea rows={10} maxLength={100000} dir="auto" className={cn(inputClass, "mt-1 resize-y")} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} /></label><div className="space-y-2"><button type="button" className={cn(buttonClass, draft.includeSignature && "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100")} onClick={() => setDraft({ ...draft, includeSignature: !draft.includeSignature })}><PenLine className="h-4 w-4" />{draft.includeSignature ? (ar ? "إزالة التوقيع الإلكتروني" : "Remove electronic signature") : (ar ? "إدراج التوقيع الإلكتروني" : "Insert electronic signature")}</button>{draft.includeSignature && <div className="rounded-lg border-s-4 border-primary-500 bg-slate-50 p-3 text-sm dark:bg-slate-800" dir="auto"><strong className="block text-base text-slate-900 dark:text-white">{status?.employeeName || status?.email?.split("@")[0]}</strong><span className="text-slate-600 dark:text-slate-300" dir="ltr">{status?.email}</span><strong className="mt-2 block text-primary-700 dark:text-primary-300">Nile Link Logistics Services</strong><div className="mt-1 flex flex-wrap gap-x-3 text-xs"><a className="text-primary-700 underline dark:text-primary-300" href="https://nilelinklogistics.com" target="_blank" rel="noreferrer">nilelinklogistics.com</a><a className="text-primary-700 underline dark:text-primary-300" href="https://www.facebook.com/nilelinklogistic" target="_blank" rel="noreferrer">Facebook</a></div></div>}</div>{draft.quote && <blockquote className="max-h-36 overflow-auto rounded-lg border-s-2 border-slate-300 bg-slate-50 p-3 text-xs leading-6 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300" dir="auto">{draft.quote}</blockquote>}<label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary-600"><Paperclip className="h-4 w-4" />{ar ? "إرفاق ملفات (حتى 5 ميجابايت إجمالًا)" : "Attach files (5 MB total)"}<input type="file" multiple className="sr-only" onChange={e => { void attach(e.target.files); e.target.value = "" }} /></label><div className="flex flex-wrap gap-2">{draft.attachments.map((a, i) => <button type="button" className={buttonClass} key={i} onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter((_, index) => index !== i) })}>{a.name}<X className="h-3 w-3" /></button>)}</div></fieldset><div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500">{ar ? "القبول للإرسال لا يضمن الوصول إلى صندوق الوارد." : "Server acceptance does not guarantee inbox delivery."}</p><button type="submit" disabled={sending || attaching || uncertain || (!draft.text.trim() && !draft.quote?.trim() && !draft.includeSignature)} className={cn(buttonClass, "border-primary-600 bg-primary-600 text-white hover:bg-primary-700")}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{ar ? "إرسال" : "Send"}</button></div></form></div>}
  </div>
}

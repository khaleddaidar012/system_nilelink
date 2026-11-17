"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Search, RefreshCw, History, ChevronDown, ChevronLeft, ChevronRight, Upload, Plus, Pencil, Trash2, LogIn, Download, Send, X, Check } from "lucide-react"

interface Event {
  id: string; createdAt: string; action: string; category: string
  actor: { id: string; name: string; username: string; role: string }
  target: { id: string; type: string; label: string }; changedFields: string[]
}
import { activityTitles as operations } from "@/lib/activity/titles"
const types: Record<string, [string, string]> = { users:["حساب", "Account"], customers:["عميل", "Customer"], documents:["مستند", "Document"], invoices:["فاتورة", "Invoice"], payments:["دفعة", "Payment"], customer_requests:["طلب خدمة", "Request"], request_services:["خدمة", "Service"], quotes:["عرض سعر", "Quotation"], role_configs:["دور وظيفي", "Role"], pricing_rules:["قاعدة تسعير", "Pricing rule"], system_settings:["إعدادات", "Settings"], _nilelink_delivery_jobs:["إرسال مستند مالي", "Financial delivery"], mailbox:["بريد إلكتروني", "Mailbox"] }
const categories = { create: ["إضافة", "Create"], update:["تعديل", "Update"], delete:["حذف / إيقاف", "Delete / suspend"], upload:["رفع", "Upload"], download:["تنزيل", "Download"], login:["دخول", "Sign in"], send:["إرسال", "Send"] } as const
const icons = { create: Plus, update: Pencil, delete: Trash2, upload: Upload, download: Download, login: LogIn, send: Send }
const colors: Record<string, string> = { create:"bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400", upload:"bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400", delete:"bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400", update:"bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400" }
const fields: Record<string,[string,string]> = { firstName:["الاسم الأول","First name"],lastName:["اسم العائلة","Last name"],username:["اسم المستخدم","Username"],phone:["الهاتف","Phone"],status:["الحالة","Status"],role:["الدور","Role"],jobTitle:["المسمى الوظيفي","Job title"],staffPermissions:["الصلاحيات","Permissions"],accountStatus:["حالة العميل","Customer status"],companyName:["اسم الشركة","Company"],title:["العنوان","Title"],category:["التصنيف","Category"],expiryDate:["تاريخ الانتهاء","Expiry date"],startDate:["تاريخ البداية","Start date"],isArchived:["الأرشفة","Archived"],isActive:["التفعيل","Active"],totalAmount:["الإجمالي","Total"],paidAmount:["المدفوع","Paid"],currency:["العملة","Currency"],dueDate:["الاستحقاق","Due date"],items:["البنود","Items"],documentCategories:["تصنيفات المستندات","Document categories"],price:["السعر","Price"],amount:["المبلغ","Amount"],paymentStatus:["حالة الدفع","Payment status"],scheduledDate:["الموعد","Schedule"],emailVerified:["توثيق البريد","Email verification"],whatsappVerified:["توثيق واتساب","WhatsApp verification"] }

export function ActivityLog() {
  const ar = useLocale() === "ar", index = ar ? 0 : 1
  const text = (arabic: string, english: string) => ar ? arabic : english
  const [filters, setFilters] = useState({ q:"", category:"", role:"", from:"", to:"" })
  const [page,setPage] = useState(1), [refresh,setRefresh] = useState(0)
  const [data,setData] = useState<{events:Event[];total:number;pages:number} | null>(null)
  const [loading,setLoading] = useState(true), [error,setError] = useState(false), [open,setOpen] = useState<string|null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const fetchData = async () => {
      if (pending) return
      pending = true; setLoading(true)
      try {
        const params = new URLSearchParams({ ...filters, page:String(page) })
        const response = await fetch(`/api/admin/activity?${params}`, { cache:"no-store", signal:controller.signal })
        if (!response.ok) throw Error("unavailable")
        const value = await response.json()
        if (!controller.signal.aborted) { setData(value); setError(false) }
      } catch { if (!controller.signal.aborted) setError(true) }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false) }
    }
    const timeout = setTimeout(fetchData, filters.q ? 350 : 0)
    const interval = setInterval(() => { if (!document.hidden) void fetchData() }, 30000)
    return () => { controller.abort(); clearTimeout(timeout); clearInterval(interval) }
  },[filters,page,refresh])
  const change = (key: keyof typeof filters, value: string) => { setFilters(previous => ({...previous,[key]:value})); setPage(1); setOpen(null) }
  const active = Object.values(filters).some(Boolean)
  const inputClass = "w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-xs text-secondary-700 outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-secondary-900 dark:text-white">{text("كل حركة، في مكان واحد", "Every action, in one place")}</h2><p className="mt-1 text-xs text-secondary-500 dark:text-slate-400">{text("مين عمل إيه وإمتى · التوقيت بتوقيت القاهرة", "Who did what and when · Cairo time")}</p></div>
      <button onClick={() => setRefresh(value=>value+1)} disabled={loading} className="flex shrink-0 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-xs font-semibold text-secondary-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`} />{text("تحديث","Refresh")}</button>
    </div>
    <div className="space-y-3 rounded-2xl border border-secondary-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2"><span className="sr-only">{text("بحث بالاسم أو العنصر","Search by name or item")}</span><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-secondary-400"/><input value={filters.q} onChange={event=>change("q",event.target.value)} maxLength={120} placeholder={text("ابحث باسم الشخص، اليوزرنيم أو العنصر…","Search a person, username or item…")} className={`${inputClass} ps-9`}/></label>
        <label><span className="sr-only">{text("نوع الحركة","Action type")}</span><select value={filters.category} onChange={event=>change("category",event.target.value)} className={inputClass}><option value="">{text("كل الحركات","All actions")}</option>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label[index]}</option>)}</select></label>
        <label><span className="sr-only">{text("نوع الحساب","Account role")}</span><select value={filters.role} onChange={event=>change("role",event.target.value)} className={inputClass}><option value="">{text("كل الأشخاص","Everyone")}</option><option value="customer">{text("العملاء","Customers")}</option><option value="staff">{text("الموظفون","Staff")}</option><option value="super_admin">{text("الأدمن","Administrators")}</option></select></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-secondary-100 pt-3 dark:border-slate-800">
        <label className="flex items-center gap-2 text-xs text-secondary-500 dark:text-slate-400">{text("من","From")}<input aria-label={text("من تاريخ","From date")} type="date" value={filters.from} max={filters.to || undefined} onChange={event=>change("from",event.target.value)} className={inputClass}/></label>
        <label className="flex items-center gap-2 text-xs text-secondary-500 dark:text-slate-400">{text("إلى","To")}<input aria-label={text("إلى تاريخ","To date")} type="date" value={filters.to} min={filters.from || undefined} onChange={event=>change("to",event.target.value)} className={inputClass}/></label>
        {active && <button onClick={()=>{setFilters({q:"",category:"",role:"",from:"",to:""});setPage(1)}} className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400"><X className="h-3.5 w-3.5"/>{text("مسح الفلاتر","Clear filters")}</button>}
        <span className="ms-auto text-xs tabular-nums text-secondary-500 dark:text-slate-400" aria-live="polite">{data ? `${data.total.toLocaleString(ar?"ar-EG":"en-GB")} ${text("حركة","actions")}` : "…"}</span>
      </div>
    </div>
    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><span>{text("تعذر تحديث السجل. البيانات الظاهرة قديمة.","Could not refresh the log. Displayed results may be out of date.")}</span><button onClick={()=>setRefresh(value=>value+1)} className="shrink-0 font-bold underline">{text("إعادة المحاولة","Retry")}</button></div>}
    <div aria-busy={loading} className="overflow-hidden rounded-2xl border border-secondary-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="hidden grid-cols-[1.2fr_1.4fr_1.2fr_1fr] gap-4 border-b border-secondary-100 bg-secondary-50/60 px-5 py-3 text-[11px] font-semibold text-secondary-500 md:grid dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">{[text("الشخص","Person"),text("الحركة","Action"),text("العنصر","Item"),text("التوقيت","Time")].map(label=><span key={label}>{label}</span>)}</div>
      {!data && loading ? <div className="space-y-5 p-6">{[0,1,2,3].map(value=><div key={value} className="h-12 animate-pulse rounded-xl bg-secondary-100 dark:bg-slate-800"/>)}</div> : data?.events.length ? data.events.map(event=>{
        const Icon = icons[event.category as keyof typeof icons] || History
        const role = event.actor.role === "super_admin" ? text("أدمن","Admin") : event.actor.role === "staff" ? text("موظف","Staff") : text("عميل","Customer")
        return <div key={event.id} className="border-b border-secondary-100 last:border-b-0 dark:border-slate-800">
          <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_1.4fr_1.2fr_1fr] md:items-center md:gap-4">
            <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-100 text-xs font-bold text-secondary-600 dark:bg-slate-800 dark:text-slate-300">{event.actor.name.slice(0,2).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-secondary-900 dark:text-white">{event.actor.name}</div><div className="mt-0.5 truncate text-[11px] text-secondary-500 dark:text-slate-400">{role}{event.actor.username ? ` · @${event.actor.username}` : ""}</div></div></div>
            <button aria-expanded={open===event.id} onClick={()=>setOpen(open===event.id?null:event.id)} className="flex items-center gap-2 text-start"><span className={`rounded-lg p-2 ${colors[event.category]||"bg-secondary-100 text-secondary-600 dark:bg-slate-800 dark:text-slate-300"}`}><Icon className="h-3.5 w-3.5"/></span><span className="text-xs font-medium text-secondary-800 dark:text-slate-200">{operations[event.action]?.[index] || categories[event.category as keyof typeof categories]?.[index] || text("تحديث","Update")}</span><ChevronDown className={`h-3.5 w-3.5 text-secondary-400 transition-transform ${open===event.id?"rotate-180":""}`}/></button>
            <div className="min-w-0"><div className="truncate text-xs font-medium text-secondary-700 dark:text-slate-300" title={event.target.label}>{event.target.label}</div><div className="mt-0.5 text-[11px] text-secondary-400">{types[event.target.type]?.[index] || text("عنصر","Item")}</div></div>
            <time dateTime={event.createdAt} className="text-xs tabular-nums leading-5 text-secondary-500 dark:text-slate-400">{new Intl.DateTimeFormat(ar?"ar-EG":"en-GB",{timeZone:"Africa/Cairo",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}).format(new Date(event.createdAt))}</time>
          </div>
          {open===event.id && <div className="mx-5 mb-4 space-y-2 rounded-xl bg-secondary-50 p-4 text-xs dark:bg-slate-900"><p className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5"/>{text("تمت العملية بنجاح","Operation completed successfully")}</p>{event.changedFields.length>0 && <p className="text-secondary-600 dark:text-slate-400">{text("الحقول المحدّثة: ","Updated fields: ")}{event.changedFields.map(key=>fields[key]?.[index] || text("بيانات العنصر","Item details")).join("، ")}</p>}<p className="break-all text-secondary-400">{text("مرجع العنصر: ","Item reference: ")}<span dir="ltr">{event.target.id}</span></p><p className="break-all text-[10px] text-secondary-400">{text("مرجع الحركة: ","Activity reference: ")}<span dir="ltr">{event.id}</span></p></div>}
        </div>
      }) : <div className="px-6 py-16 text-center"><History className="mx-auto mb-3 h-9 w-9 text-secondary-300 dark:text-slate-600"/><p className="text-sm font-semibold text-secondary-700 dark:text-slate-200">{text("لا توجد حركات لعرضها","No activity to display")}</p><p className="mt-2 text-xs text-secondary-500">{active?text("جرّب تغيير البحث أو الفلاتر.","Try changing your search or filters."):text("ستظهر هنا الحركات الجديدة بعد تفعيل السجل.","New actions will appear here after the log is enabled.")}</p></div>}
      {data && data.pages>1 && <div className="flex items-center justify-between border-t border-secondary-100 px-5 py-3 text-xs text-secondary-500 dark:border-slate-800 dark:text-slate-400"><span>{text("صفحة","Page")} {page} / {data.pages}</span><div className="flex gap-2"><button aria-label={text("الصفحة السابقة","Previous page")} disabled={page===1||loading} onClick={()=>setPage(page-1)} className="rounded-lg border p-2 disabled:opacity-30 dark:border-slate-700"><ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180"/></button><button aria-label={text("الصفحة التالية","Next page")} disabled={page>=data.pages||loading} onClick={()=>setPage(page+1)} className="rounded-lg border p-2 disabled:opacity-30 dark:border-slate-700"><ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180"/></button></div></div>}
    </div>
    <p className="text-center text-[11px] text-secondary-400">{text("سجل للعرض فقط · يُحفظ تلقائيًا مع العمليات الجديدة · لا يعرض كلمات المرور أو محتوى البريد","Read-only log · Saved automatically with new operations · No passwords or email content")}</p>
  </div>
}

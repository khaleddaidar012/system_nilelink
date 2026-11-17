"use client"
import Image from "next/image"
import { Dialog } from "@headlessui/react"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Camera, CheckCircle2, Loader2, LogOut, Moon, Sun, X } from "lucide-react"
import { useLocale } from "next-intl"
import { Link, usePathname } from "@/navigation"
import { usePortal } from "../PortalContext"
import { useTheme } from "@/components/layout/ThemeProvider"

const schema = z.object({ firstName: z.string().trim().min(2).max(80), lastName: z.string().trim().min(2).max(80), phone: z.string().regex(/^\+[1-9]\d{7,14}$/) })
type Fields = z.infer<typeof schema>
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
const dialingCodes = ["+20", "+966", "+971", "+965", "+974", "+973", "+968", "+962", "+961", "+218", "+216", "+213", "+212", "+249", "+964", "+44", "+1", "+49", "+33", "+86", "+90", "+91"]

export function AccountDropdown() {
  const { user, customer, refreshData, logout } = usePortal(), locale = useLocale(), ar = locale === "ar", pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null), [preview, setPreview] = useState("")
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [progress, setProgress] = useState(0)
  const [dial, setDial] = useState("+20")
  const fileInput = useRef<HTMLInputElement>(null)
  const { register, reset, handleSubmit, setValue, formState: { errors } } = useForm<Fields>({ resolver: zodResolver(schema) })
  useEffect(() => { if (!photo) { setPreview(""); return }; const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url) }, [photo])
  if (!user) return null
  const initials = (user.firstName[0] || "") + (user.lastName[0] || "")
  const startEdit = () => {
    reset({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || customer?.contactPhone || "" })
    setDial([...dialingCodes].sort((a,b)=>b.length-a.length).find(code=>(user.phone || customer?.contactPhone || "").startsWith(code)) || "+20")
    setEditing(true); setError(""); setMessage("")
  }
  const close = () => { if (busy) return; setOpen(false); setEditing(false); setPhoto(null); setError(""); setMessage("") }
  const save = handleSubmit(async fields => {
    setBusy(true); setError(""); setMessage("")
    let profileSaved = false
    try {
      const response = await fetch("/api/portal/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to save profile")
      profileSaved = true
      if (photo) {
        const form = new FormData(); form.append("file", photo)
        await new Promise<void>((resolve,reject)=>{
          const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/portal/profile/avatar")
          xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded/event.total*100)) }
          xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(ar ? "تعذّر حفظ الصورة. جرّب مرة أخرى." : "Unable to save photo. Please retry."))
          xhr.onerror = () => reject(new Error(ar ? "تعذّر الاتصال" : "Connection failed")); xhr.timeout = 45000; xhr.ontimeout = xhr.onerror
          xhr.send(form)
        })
      }
      await refreshData(); setPhoto(null); setEditing(false); setMessage(ar ? "تم حفظ حسابك بنجاح" : "Your profile was saved")
    } catch (failure) {
      if (profileSaved) await refreshData()
      setError((profileSaved ? ar ? "بيانات الحساب اتحفظت، لكن " : "Profile saved, but " : "") + (failure instanceof Error ? failure.message : ar ? "تعذّر الحفظ" : "Unable to save"))
    } finally { setBusy(false); setProgress(0) }
  })
  return <>
    <button type="button" data-tour="account" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-start shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {user.avatarUrl ? <Image unoptimized width={32} height={32} src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">{initials}</span>}
      <span className="hidden max-w-36 truncate pe-2 text-xs sm:block"><strong className="block truncate">{user.firstName} {user.lastName}</strong><span className="text-slate-500">{ar ? "حسابي" : "My account"}</span></span>
      <span className="sr-only">{ar ? "فتح حسابي" : "Open my account"}</span>
    </button>
    <Dialog open={open} onClose={close} className="relative z-[80]" dir={ar ? "rtl" : "ltr"}>
      <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-end justify-end sm:items-start sm:p-4 sm:pt-20">
        <Dialog.Panel className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:w-80 sm:rounded-2xl dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between"><Dialog.Title className="font-bold">{ar ? "حسابي" : "My account"}</Dialog.Title><button type="button" disabled={busy} onClick={close} aria-label={ar ? "إغلاق" : "Close"}><X className="h-5 w-5" /></button></div>
          <div className="mb-4 flex items-center gap-3">
            <button type="button" disabled={busy} onClick={()=>{ if(!editing)startEdit(); fileInput.current?.click() }} className="relative h-16 w-16 shrink-0 rounded-full bg-primary-600 text-xl font-bold text-white" aria-label={ar ? "تغيير صورة الحساب" : "Change profile photo"}>
              {preview || user.avatarUrl ? <Image unoptimized width={64} height={64} src={preview || user.avatarUrl || ""} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
              <Camera className="absolute bottom-0 end-0 h-5 w-5 rounded-full bg-slate-800 p-0.5" />
            </button>
            <input ref={fileInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={event=>{
              const file=event.target.files?.[0]; event.target.value=""; if(!file)return
              if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>2*1024*1024) {setError(ar ? "اختر JPG أو PNG أو WEBP بحد أقصى 2MB" : "Choose JPG, PNG or WEBP up to 2MB");return}
              setPhoto(file);setError("")
            }} />
            <div className="min-w-0"><p className="truncate font-semibold">{user.firstName} {user.lastName}</p><p className="text-xs text-slate-500">JPG · PNG · WEBP · 2MB</p></div>
          </div>
          {message && <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}
          {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
          {editing ? <form onSubmit={save} className="space-y-3">
            {(["firstName","lastName"] as const).map((field,index)=><label key={field} className="block text-sm">{ar ? index ? "اسم العائلة" : "الاسم الأول" : index ? "Last name" : "First name"}<input {...register(field)} disabled={busy} className={inputClass} autoComplete={field === "firstName" ? "given-name" : "family-name"} />{errors[field] && <span className="text-xs text-rose-600">{ar ? "اكتب من 2 إلى 80 حرف" : "Enter 2–80 characters"}</span>}</label>)}
            <label className="block text-sm">{ar ? "رقم واتساب بكود الدولة" : "WhatsApp including country code"}
              <select value={dial} disabled={busy} aria-label={ar ? "كود الدولة" : "Country calling code"} className={inputClass} onChange={event=>{ const next=event.target.value;const current=(document.getElementById("account-phone") as HTMLInputElement)?.value || "";setDial(next);setValue("phone",next+(current.startsWith(dial)?current.slice(dial.length):current.replace(/^\+/,"")),{shouldValidate:true}) }}>{dialingCodes.map(code=><option key={code}>{code}</option>)}</select>
              <input id="account-phone" {...register("phone")} type="tel" dir="ltr" autoComplete="tel" disabled={busy} className={inputClass} />{errors.phone && <span className="text-xs text-rose-600">{ar ? "اكتب الرقم الدولي مثل +201012345678" : "Use international format, e.g. +201012345678"}</span>}
            </label>
            <div className="flex gap-2"><button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? photo ? `${progress}%` : ar ? "جارٍ الحفظ" : "Saving" : ar ? "حفظ" : "Save"}</button><button type="button" disabled={busy} onClick={()=>{setEditing(false);setPhoto(null);setError("")}} className="rounded-lg border px-3 py-2 text-sm">{ar ? "إلغاء" : "Cancel"}</button></div>
          </form> : <div className="space-y-3 text-sm"><div><p className="text-xs text-slate-500">{ar ? "واتساب" : "WhatsApp"}</p><p dir="ltr">{user.phone || customer?.contactPhone || "—"}</p></div><button type="button" onClick={startEdit} className="w-full rounded-lg border border-primary-200 py-2 font-semibold text-primary-700">{ar ? "تعديل البيانات والصورة" : "Edit profile and photo"}</button></div>}
          <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800"><div><dt className="text-xs text-slate-500">{ar ? "البريد الإلكتروني" : "Email"}</dt><dd className="flex items-center gap-1 break-all"><span dir="ltr">{user.email}</span>{user.emailVerified && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}</dd><Link href="/portal/profile" onClick={close} className="text-xs text-primary-600">{ar ? "تغيير البريد وتأكيده" : "Change and verify email"}</Link></div><div><dt className="text-xs text-slate-500">{ar ? "الشركة" : "Company"}</dt><dd>{customer?.companyName || "—"}</dd></div><div><dt className="text-xs text-slate-500">{ar ? "السجل التجاري" : "Commercial register"}</dt><dd>{customer?.commercialRegisterNumber || "—"}</dd></div></dl>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm dark:border-slate-800"><button type="button" onClick={()=>{close();setTimeout(()=>window.dispatchEvent(new Event("nilelink:replay-tour")),0)}} className="block w-full rounded-lg p-2 text-start hover:bg-slate-50 dark:hover:bg-slate-800">{ar ? "إعادة الجولة التعريفية" : "Replay portal tour"}</button><Link href="/portal/profile#password" onClick={close} className="block rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800">{ar ? "تغيير كلمة المرور" : "Change password"}</Link><div className="flex items-center justify-between"><Link href={pathname} locale={ar ? "en" : "ar"} onClick={close} className="rounded-lg p-2">{ar ? "English" : "العربية"}</Link><button type="button" onClick={()=>setTheme(theme==="dark"?"light":"dark")} className="flex items-center gap-2 p-2">{theme==="dark"?<Sun className="h-4 w-4" />:<Moon className="h-4 w-4" />}{ar ? "المظهر" : "Theme"}</button></div><button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg p-2 text-rose-600"><LogOut className="h-4 w-4" />{ar ? "تسجيل الخروج" : "Sign out"}</button></div>
        </Dialog.Panel>
      </div>
    </Dialog>
  </>
}

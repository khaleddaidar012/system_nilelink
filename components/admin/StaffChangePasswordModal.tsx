"use client"

import { useState } from "react"
import { useLocale } from "next-intl"
import { KeyRound, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

export function StaffChangePasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ar = useLocale() === "ar"
  const t = (a: string, e: string) => (ar ? a : e)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  if (!isOpen) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setDone(false)
    if (newPassword !== confirmPassword) {
      setError(t("كلمتا المرور غير متطابقتين", "Passwords do not match"))
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t("تعذر تغيير كلمة المرور", "Unable to change password"))
        return
      }
      setDone(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      setError(t("خطأ في الاتصال بالخادم", "Network error"))
    } finally {
      setBusy(false)
    }
  }

  const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" dir={ar ? "rtl" : "ltr"}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{t("تغيير كلمة المرور", "Change Password")}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3.5">
          {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          {done && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{t("تم تغيير كلمة المرور بنجاح", "Password updated successfully")}</p>}

          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {t("كلمة المرور الحالية", "Current password")}
            <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {t("كلمة المرور الجديدة", "New password")}
            <input type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {t("تأكيد كلمة المرور الجديدة", "Confirm new password")}
            <input type="password" required minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
          </label>
          <p className="text-[11px] text-slate-500">{t("8 أحرف على الأقل: حرف كبير وصغير ورقم ورمز خاص.", "At least 8 characters with uppercase, lowercase, number and symbol.")}</p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700">{t("إغلاق", "Close")}</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("حفظ كلمة المرور", "Save password")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"

interface Item { id: string; verifiedAt: string; trigger: string; records: number; files: number; omittedFiles: number; encryptedBytes: number; status: string }
interface Inventory { items: Item[]; scope?: string; nextCursor?: string | null; canCreate?: boolean }
export function D1BackupsManager() {
  const ar = useLocale() === "ar"
  const [data, setData] = useState<Inventory | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [creationState, setCreationState] = useState<string | null>(null)
  const requestKey = "nilelink-d1-backup-request"
  const load = useCallback(async (cursor?: string) => {
    setLoading(true); setError(false)
    try {
      const response = await fetch("/api/admin/system/d1-backups" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { cache: "no-store" })
      if (!response.ok) throw new Error("Unavailable")
      setData(await response.json())
    } catch { setData(null); setError(true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const stored = sessionStorage.getItem(requestKey)
    if (stored && /^[a-f0-9-]{36}$/.test(stored)) setRequestId(stored)
    void load()
  }, [load])
  async function create() {
    if (creating) return
    setCreating(true)
    const id = requestId || crypto.randomUUID()
    setRequestId(id); sessionStorage.setItem(requestKey, id)
    try {
      const response = await fetch("/api/admin/system/d1-backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: id }), cache: "no-store" })
      const result = await response.json()
      if (result.requestId !== id || !["completed", "processing", "uncertain", "rate_limited"].includes(result.state)) throw new Error("Unavailable")
      setCreationState(result.state)
      if (result.state === "completed" || result.state === "rate_limited") { setRequestId(null); sessionStorage.removeItem(requestKey) }
      if (result.state === "completed") await load()
    } catch { setCreationState("connection_lost") }
    finally { setCreating(false) }
  }
  return <div className="space-y-6">
    <AdminHeader title={ar ? "نسخ D1 الاحتياطية" : "D1 backups"} subtitle={ar ? "سجلات النسخ المشفرة على Cloudflare R2" : "Encrypted backup records on Cloudflare R2"} />
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      {data?.scope === "first-launch" ? (ar ? "هذه نسخ من قاعدة وملفات النظام المنقولة إلى الوجهة الجديدة. تعرض هذه الشاشة سجل الاكتمال ووجود الملف؛ اختبار فك التشفير والاسترجاع مستقل، ولا يعني عرض النسخة أنها تتضمن تغييرات حدثت بعد وقت إنشائها." : "These backups cover the new system destination. This screen checks completion receipts and stored objects. Restore testing is separate; changes after a backup was created are not included in that backup.") : (ar ? "تظهر النسخ حسب الوجهة المربوطة. نسخ بيئة التدريب مستقلة عن نسخ وجهة أول النشر. التحقق هنا من سجل الاكتمال ووجود الملف؛ اختبار الاسترجاع منفصل." : "Backups are shown for the configured destination. Training backups are separate from first-launch backups. Restore testing is separate from this metadata view.")}
    </div>
    <button type="button" disabled={loading} onClick={() => void load()} className="rounded-lg border px-4 py-2 disabled:opacity-50">{loading ? (ar ? "جارٍ التحميل…" : "Loading…") : (ar ? "تحديث" : "Refresh")}</button>
    {data?.canCreate && <button type="button" disabled={creating || creationState === "uncertain"} onClick={() => void create()} className="mx-2 rounded-lg border px-4 py-2 disabled:opacity-50">{creating ? (ar ? "جارٍ إنشاء النسخة…" : "Creating backup…") : requestId ? (ar ? "متابعة نتيجة الطلب" : "Check request outcome") : data.scope === "first-launch" ? (ar ? "إنشاء نسخة احتياطية الآن" : "Create backup now") : (ar ? "إنشاء نسخة من بيانات التجربة" : "Back up staging data")}</button>}
    {creationState && <p role="status" className="rounded-lg border p-3 text-sm">{
      creationState === "completed" ? (ar ? "اكتملت النسخة المشفرة وتم التحقق منها." : "Encrypted backup completed and verified.") :
      creationState === "processing" ? (ar ? "الطلب قيد التنفيذ. تابع نفس الطلب لمعرفة النتيجة." : "The request is processing. Check the same request for its outcome.") :
      creationState === "rate_limited" ? (ar ? "يوجد حد لنسخة يدوية واحدة كل خمس دقائق. حاول لاحقًا." : "Manual backups are limited to one per five-minute window. Try later.") :
      creationState === "uncertain" ? (ar ? "النتيجة تحتاج مراجعة المسؤول. لن يُعاد تنفيذ الطلب تلقائيًا." : "The outcome requires operator review. This request will not run again automatically.") :
      (ar ? "تعذر تأكيد النتيجة. استخدم متابعة نفس الطلب لتجنب إنشاء نسخة أخرى." : "The outcome could not be confirmed. Check the same request to avoid creating another backup.")
    }</p>}
    {error && <p role="alert" className="text-red-600">{ar ? "تعذر عرض النسخ. تحقق من الصلاحيات وإعداد اتصال النسخ الاحتياطية." : "Backups are unavailable. Check permissions and backup bindings."}</p>}
    {data && <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-start text-sm"><thead><tr>
      {[ar ? "وقت التحقق" : "Verified at", ar ? "التشغيل" : "Trigger", ar ? "السجلات" : "Records", ar ? "الملفات" : "Files", ar ? "الحجم" : "Size", ar ? "الحالة" : "Status"].map(label => <th className="p-3 text-start" key={label}>{label}</th>)}
    </tr></thead><tbody>{data.items.map(item => <tr className="border-t" key={item.id}>
      <td className="p-3">{new Date(item.verifiedAt).toLocaleString(ar ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo" })}</td>
      <td className="p-3">{item.trigger === "scheduled" ? (ar ? "مجدول" : "Scheduled") : item.trigger === "manual" ? (ar ? "يدوي" : "Manual") : (ar ? "غير مسجل" : "Not recorded")}</td>
      <td className="p-3">{item.records}</td><td className="p-3">{item.files}{item.omittedFiles > 0 && <span className="block text-amber-700 dark:text-amber-300">{ar ? `استثناءات: ${item.omittedFiles}` : `Exceptions: ${item.omittedFiles}`}</span>}</td>
      <td className="p-3">{(item.encryptedBytes / 1048576).toFixed(2)} MiB</td><td className="p-3">{item.status === "stored" ? (ar ? "مخزنة" : "Stored") : (ar ? "تحتاج مراجعة" : "Needs review")}</td>
    </tr>)}</tbody></table>{data.items.length === 0 && <p className="p-4">{ar ? "لا توجد نسخ مكتملة في هذه الصفحة." : "No completed backups on this page."}</p>}</div>}
    {data?.nextCursor && <button type="button" disabled={loading} onClick={() => void load(data.nextCursor!)} className="rounded-lg border px-4 py-2">{ar ? "الصفحة التالية" : "Next page"}</button>}
    <p className="text-sm text-secondary-500">{ar ? "لا يمكن حذف النسخ أو الاسترجاع إلى النظام من هذه الشاشة." : "Deleting backups and restoring into the application are not available from this screen."}</p>
  </div>
}

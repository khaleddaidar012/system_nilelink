"use client"

import { useState, useEffect, useRef } from "react"
import { Mail, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Clock, ShieldAlert, LogIn, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdminOverviewData } from "./types"
import { LiveStatusDot, LiveSystemStatus } from "./LiveStatusDot"

interface Props {
  email: AdminOverviewData["email"]
  locale: string
}

const WEBMAIL_URL = "https://webmail.nilelinklogistics.com/Mondo/lang/sys/login.aspx"

function WebmailActions({ locale }: { locale: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(WEBMAIL_URL)
      setCopyState("copied")
    } catch { setCopyState("error") }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopyState("idle"), 3000)
  }
  const ar = locale === "ar"
  return <div className="mt-auto border-t border-secondary-100 pt-4 dark:border-slate-800">
    <div className="flex flex-wrap items-center gap-2">
      <a href={WEBMAIL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
        <LogIn className="h-4 w-4" />{ar ? "تسجيل الدخول" : "Log in"}
      </a>
      <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-secondary-200 px-4 py-2 text-sm font-bold text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
        {copyState === "copied" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copyState === "copied" ? (ar ? "تم نسخ الرابط" : "Link copied") : (ar ? "نسخ الرابط" : "Copy link")}
      </button>
    </div>
    <p role="status" aria-live="polite" className={cn("mt-2 min-h-4 text-xs", copyState === "error" ? "text-rose-600" : "text-emerald-600")}>
      {copyState === "error" ? (ar ? "تعذر النسخ. اضغط بزر الماوس الأيمن على تسجيل الدخول واختر نسخ الرابط." : "Could not copy. Right-click Log in and choose Copy link.") : copyState === "copied" ? (ar ? "تم نسخ رابط البريد الإلكتروني." : "Webmail link copied.") : ""}
    </p>
  </div>
}

export function EmailStatusCard({ email, locale }: Props) {
  if (email.provider === "resend" && email.configured) return <div className="flex flex-col gap-4 rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold"><Mail className="h-5 w-5 text-primary-600" />{locale === "ar" ? "البريد الإلكتروني" : "Email"}</h3><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Resend</span></div>
    <p className="text-sm leading-7 text-secondary-600 dark:text-slate-300">{locale === "ar" ? "إرسال البريد مفعّل للفواتير وكشوف الحساب وأكواد التحقق واسترجاع كلمة المرور. قبول مزوّد البريد للرسالة لا يعني وصولها إلى صندوق الوارد؛ راجع سجل الرسائل لدى المزوّد." : "Email sending is enabled for invoices, statements, verification and password resets. Provider acceptance does not confirm inbox delivery; review the provider's message log."}</p>
    <WebmailActions locale={locale} />
  </div>
  if (email.deferred) return <div className="flex flex-col gap-4 rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold"><Mail className="h-5 w-5 text-primary-600" />{locale === "ar" ? "البريد الإلكتروني" : "Email"}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">{locale === "ar" ? "الإعداد مؤجل" : "Setup deferred"}</span></div>
    <p className="text-sm leading-7 text-secondary-600 dark:text-slate-300">{locale === "ar" ? "لم يتم اختيار مزود البريد بعد. الإرسال بالبريد غير مفعّل حاليًا، ولن تُعرض حالة خادم أو طوابير بريد حتى يتم ربط الخدمة." : "An email provider has not been selected. Sending is disabled; server and queue status will appear when the service is connected."}</p>
    <WebmailActions locale={locale} />
  </div>
  return <LegacyEmailStatusCard email={email} locale={locale} />
}
function LegacyEmailStatusCard({ email, locale }: Props) {
  const isAr = locale === "ar"

  const liveStatus: LiveSystemStatus = email.status === "online" ? "healthy" : email.status

  const [shouldShake, setShouldShake] = useState(false)
  const prevStatusRef = useRef<LiveSystemStatus>(liveStatus)

  useEffect(() => {
    if (prevStatusRef.current !== "offline" && liveStatus === "offline") {
      setShouldShake(true)
      const timer = setTimeout(() => setShouldShake(false), 600)
      return () => clearTimeout(timer)
    }
    prevStatusRef.current = liveStatus
  }, [liveStatus])

  const statusConfig = {
    online: {
      label: isAr ? "متصل ومستقر" : "Online & Healthy",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      icon: CheckCircle2,
    },
    degraded: {
      label: isAr ? "أداء منخفض" : "Degraded Performance",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      icon: AlertTriangle,
    },
    offline: {
      label: isAr ? "غير متصل" : "Offline",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      icon: XCircle,
    },
    unknown: {
      label: isAr ? "غير معروف" : "Unknown / Unreachable",
      badgeClass: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800",
      icon: HelpCircle,
    },
  }[email.status]

  const monitoringUnavailable = email.monitoring !== "available"
  const unknownLabel =
    email.monitoring === "endpoint_missing"
      ? isAr ? "المراقبة غير متاحة (عميل قديم)" : "Monitoring unavailable (agent outdated)"
      : email.monitoring === "agent_unreachable"
        ? isAr ? "العميل غير متصل" : "Agent unreachable"
        : isAr ? "بيانات المراقبة غير متاحة" : "Monitoring data unavailable"
  const displayLabel = email.status === "unknown" && monitoringUnavailable ? unknownLabel : statusConfig.label
  const fmtQueue = (n: number | null) => (n === null ? "—" : String(n))

  const StatusIcon = statusConfig.icon

  const formatServiceStatus = (status: string) => {
    switch (status) {
      case "running":
        return { label: isAr ? "يعمل" : "Running", class: "text-emerald-600 dark:text-emerald-400 font-semibold" }
      case "stopped":
        return { label: isAr ? "متوقف" : "Stopped", class: "text-rose-600 dark:text-rose-400 font-bold" }
      case "not_installed":
        return { label: isAr ? "غير مثبت" : "Not Found", class: "text-secondary-400" }
      default:
        return { label: isAr ? "غير معروف" : "Unknown", class: "text-secondary-400" }
    }
  }

  const smtpFormatted = formatServiceStatus(email.smtpStatus)
  const imapFormatted = formatServiceStatus(email.imapStatus)

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                {isAr ? "خادم البريد (MailEnable)" : "MailEnable Email Server"}
              </h3>
              <span className="text-[11px] text-secondary-500 dark:text-slate-400">
                {isAr ? "مراقبة خدمات SMTP و IMAP" : "Windows Server Service Monitor"}
              </span>
            </div>
          </div>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-xs",
              statusConfig.badgeClass
            )}
          >
            <LiveStatusDot status={liveStatus} />
            <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", shouldShake && "animate-subtle-shake")} />
            <span>{displayLabel}</span>
          </span>
        </div>

        {/* Core Services Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3 text-xs dark:border-slate-800/80 dark:bg-slate-950/40">
          <div className="space-y-1">
            <span className="text-[11px] text-secondary-500 dark:text-slate-400">
              {isAr ? "خدمة SMTP (إرسال)" : "SMTP Service (MESMTPCS)"}
            </span>
            <div className="flex items-center justify-between pr-1">
              <span className={smtpFormatted.class}>{smtpFormatted.label}</span>
              {monitoringUnavailable ? (
                <span className="text-[10px] text-secondary-400 font-medium">—</span>
              ) : email.smtpReachable ? (
                <span className="text-[10px] text-emerald-600 font-medium dark:text-emerald-400">
                  {email.responseTimeMs ? `${email.responseTimeMs}ms` : "✓ Port 25"}
                </span>
              ) : (
                <span className="text-[10px] text-rose-500 font-medium">✕ Port 25</span>
              )}
            </div>
          </div>

          <div className="space-y-1 border-r border-secondary-200 pr-2.5 rtl:border-r-0 rtl:border-l rtl:pl-2.5 rtl:pr-0 dark:border-slate-800">
            <span className="text-[11px] text-secondary-500 dark:text-slate-400">
              {isAr ? "خدمة IMAP (استقبال)" : "IMAP Service (MEIMAPS)"}
            </span>
            <div className="flex items-center justify-between pr-1">
              <span className={imapFormatted.class}>{imapFormatted.label}</span>
              {monitoringUnavailable ? (
                <span className="text-[10px] text-secondary-400 font-medium">—</span>
              ) : email.imapReachable ? (
                <span className="text-[10px] text-emerald-600 font-medium dark:text-emerald-400">✓ Port 143</span>
              ) : (
                <span className="text-[10px] text-rose-500 font-medium">✕ Port 143</span>
              )}
            </div>
          </div>
        </div>

        {/* Queues Metrics */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-secondary-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[10px] text-secondary-500 dark:text-slate-400 block">
              {isAr ? "الوارد" : "Inbound"}
            </span>
            <span className="text-sm font-bold text-secondary-900 dark:text-white">
              {fmtQueue(email.queues.inbound)}
            </span>
          </div>
          <div className="rounded-xl border border-secondary-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[10px] text-secondary-500 dark:text-slate-400 block">
              {isAr ? "الصادر" : "Outbound"}
            </span>
            <span className="text-sm font-bold text-secondary-900 dark:text-white">
              {fmtQueue(email.queues.outbound)}
            </span>
          </div>
          <div
            className={cn(
              "rounded-xl border p-2 transition-colors",
              email.queues.badMail !== null && email.queues.badMail > 0
                ? "border-amber-200 bg-amber-50/50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                : "border-secondary-100 bg-white dark:border-slate-800 dark:bg-slate-900 text-secondary-900 dark:text-white"
            )}
          >
            <span className="text-[10px] text-secondary-500 dark:text-slate-400 block">
              {isAr ? "معطوبة / Bad" : "Bad Mail"}
            </span>
            <span className="text-sm font-bold">{fmtQueue(email.queues.badMail)}</span>
          </div>
        </div>
        {!email.queues.accessible && (
          <p className="mt-1.5 text-center text-[10px] text-secondary-400">
            {isAr ? "— = تعذر قراءة الطوابير" : "— = queue data unavailable"}
          </p>
        )}

        {email.diagnostics.length > 0 && email.status !== "online" && (
          <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            {email.diagnostics.slice(0, 3).map((d, i) => (
              <li key={i} className="break-words">• {d}</li>
            ))}
          </ul>
        )}
      </div>

      <WebmailActions locale={locale} />
      {/* Footer Info */}
      <div className="mt-4 border-t border-secondary-100 pt-3 text-[11px] text-secondary-500 dark:border-slate-800 dark:text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5 truncate">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {isAr ? "آخر فحص ناجح:" : "Last successful check:"}{" "}
            {email.lastSuccessfulCheck ? new Date(email.lastSuccessfulCheck).toLocaleString(isAr ? "ar-EG" : "en-US", { dateStyle: "short", timeStyle: "short" }) : (isAr ? "لا يوجد" : "None yet")}
          </span>
        </div>

        {email.lastOutage && (
          <span className="flex items-center gap-1 text-rose-500 font-medium" title={email.lastOutage.reason}>
            <ShieldAlert className="h-3 w-3" />
            <span>{isAr ? "انقطاع مسجل" : "Outage logged"}</span>
          </span>
        )}
      </div>
    </div>
  )
}

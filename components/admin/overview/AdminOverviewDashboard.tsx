"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useLocale } from "next-intl"
import { RefreshCw, CheckCircle2, AlertTriangle, AlertOctagon, Server, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdminOverviewData } from "./types"
import { OverviewAlertsBanner } from "./OverviewAlertsBanner"
import { EmailStatusCard } from "./EmailStatusCard"
import { BackupStatusCard } from "./BackupStatusCard"
import { EmployeesStatusCard } from "./EmployeesStatusCard"
import { RecentActivityFeed } from "./RecentActivityFeed"
import { OverviewSkeleton } from "./OverviewSkeleton"

export function AdminOverviewDashboard() {
  const locale = useLocale()
  const isAr = locale === "ar"

  const [data, setData] = useState<AdminOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)

  const isMountedRef = useRef(true)

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/overview", {
        headers: { "Cache-Control": "no-cache" },
      })
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }
      const json: AdminOverviewData = await res.json()
      if (isMountedRef.current) {
        setData(json)
        setLastUpdated(new Date())
        setSecondsAgo(0)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load overview data")
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    fetchData()

    // Auto-refresh every 45 seconds while tab is active
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData()
      }
    }, 45_000)

    // Tick seconds ago counter
    const secondsInterval = setInterval(() => {
      setSecondsAgo((prev) => prev + 1)
    }, 1000)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
      clearInterval(secondsInterval)
    }
  }, [fetchData])

  if (loading && !data) {
    return <OverviewSkeleton />
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
        <AlertOctagon className="mx-auto h-10 w-10 text-rose-500" />
        <h3 className="mt-2 text-base font-bold">
          {isAr ? "تعذر تحميل لوحة النظرة العامة" : "Failed to Load Overview Dashboard"}
        </h3>
        <p className="mt-1 text-xs opacity-90">{error}</p>
        <button
          onClick={() => fetchData(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{isAr ? "إعادة المحاولة" : "Try Again"}</span>
        </button>
      </div>
    )
  }

  const systemStatus = data?.systemStatus || "healthy"
  const isHealthy = systemStatus === "healthy"
  const isWarning = systemStatus === "warning"

  const overallBadge = isHealthy
    ? {
        label: isAr ? "الخدمات المفعّلة تعمل بكفاءة" : "Enabled Services Operational",
        icon: CheckCircle2,
        class: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
        dot: "bg-emerald-500",
      }
    : isWarning
    ? {
        label: isAr ? "تحذيرات تشغيلية قيد المتابعة" : "Operational Warnings",
        icon: AlertTriangle,
        class: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
        dot: "bg-amber-500 animate-pulse",
      }
    : {
        label: isAr ? "تنبيه حرج يتطلب التدخل" : "Critical Attention Required",
        icon: AlertOctagon,
        class: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
        dot: "bg-rose-500",
      }

  const OverallIcon = overallBadge.icon

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black tracking-tight text-secondary-900 dark:text-white">
              {isAr ? "نظرة عامة على المنظومة" : "System Overview"}
            </h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
                overallBadge.class
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", overallBadge.dot)} />
              <OverallIcon className="h-3 w-3" />
              <span>{overallBadge.label}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-secondary-500 dark:text-slate-400">
            {isAr
              ? "حالة الخدمات المفعّلة والنسخ الاحتياطي وفريق العمل"
              : "Enabled services, backups, and staff status"}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <div
            title={lastUpdated ? (isAr ? `توقيت التحديث: ${lastUpdated.toLocaleTimeString("ar-EG")}` : `Updated at: ${lastUpdated.toLocaleTimeString("en-US")}`) : undefined}
            className="flex items-center gap-1.5 rounded-xl border border-secondary-200 bg-white px-3 py-1.5 text-xs text-secondary-500 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
          >
            <Clock className="h-3.5 w-3.5 text-secondary-400" />
            <span className="font-mono text-[11px]">
              {isAr ? `تحديث منذ ${secondsAgo} ث` : `Updated ${secondsAgo}s ago`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-secondary-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-secondary-700 shadow-xs hover:bg-secondary-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            title={isAr ? "تحديث يدوي الآن" : "Manual Refresh Now"}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-primary-600")} />
            <span>{isAr ? "تحديث" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Prominent Alerts Section */}
      {data && data.alerts && data.alerts.length > 0 && (
        <OverviewAlertsBanner alerts={data.alerts} locale={locale} />
      )}

      {/* Main 3 Core KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <EmailStatusCard email={data.email} locale={locale} />
          <BackupStatusCard backups={data.backups} locale={locale} />
          <EmployeesStatusCard employees={data.employees} locale={locale} />
        </div>
      )}

      {/* Lower Details Grid */}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Audit Timeline Feed (2 Cols) */}
          <div className="lg:col-span-2">
            <RecentActivityFeed activities={data.recentActivity} locale={locale} />
          </div>

          {/* System Specs & Team Quick View (1 Col) */}
          <div className="space-y-6">
            {/* Recently Added Staff */}
            <div className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between border-b border-secondary-100 pb-3 dark:border-slate-800">
                <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                  {isAr ? "أحدث الموظفين المسجلين" : "Recently Added Staff"}
                </h3>
                <span className="text-[11px] text-secondary-400">
                  {data.employees.recentlyAdded.length} {isAr ? "أعضاء" : "Members"}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {data.employees.recentlyAdded.length === 0 ? (
                  <p className="text-center text-xs text-secondary-400 py-4">
                    {isAr ? "لا يوجد موظفون مضافون مؤخراً" : "No recent staff members"}
                  </p>
                ) : (
                  data.employees.recentlyAdded.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-bold dark:bg-purple-950/40 dark:text-purple-400">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-secondary-900 dark:text-white truncate">
                            {member.name}
                          </p>
                          <p className="text-[10px] text-secondary-400 truncate">
                            {member.jobTitle || member.email}
                          </p>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          member.role === "super_admin"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-secondary-100 text-secondary-600 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        {member.role === "super_admin" ? (isAr ? "مشرف" : "Super") : isAr ? "موظف" : "Staff"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Infrastructure & Security Info */}
            <div className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm text-xs dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-sm font-bold text-secondary-900 dark:text-white flex items-center gap-2 border-b border-secondary-100 pb-3 dark:border-slate-800">
                <Server className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                <span>{isAr ? "بيئة التشغيل والحماية" : "Environment & Security"}</span>
              </h3>

              <div className="mt-3 space-y-2.5 text-secondary-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>{isAr ? "نفق الحماية:" : "Tunnel Security:"}</span>
                  <span className="font-medium text-secondary-900 dark:text-white">{data.databaseProvider === "d1" ? (data.previewOnly ? (isAr ? "بوابة مراجعة مؤقتة" : "Protected review gate") : (isAr ? "دخول بالحساب والصلاحيات" : "Account-based access")) : "Cloudflare Access (Service Auth)"}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? "مصادقة العميل:" : "Agent Auth:"}</span>
                  <span className="font-medium text-secondary-900 dark:text-white">{data.databaseProvider === "d1" ? (data.previewOnly ? (isAr ? "جلسة حساب وبوابة موقعة" : "Account session + signed review gate") : (isAr ? "جلسة حساب موقعة" : "Signed account session")) : "HMAC-SHA256 Signed"}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? "خادم البريد:" : "Mail Server:"}</span>
                  <span className="font-medium text-secondary-900 dark:text-white">{data.email.deferred ? (isAr ? "اختيار المزود مؤجل" : "Provider not selected") : "MailEnable (Windows Server)"}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? "النطاق الزمني:" : "System Timezone:"}</span>
                  <span className="font-medium text-secondary-900 dark:text-white">Africa/Cairo (UTC+2 / UTC+3)</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? "قاعدة البيانات:" : "Database Cluster:"}</span>
                  <span className="font-medium text-secondary-900 dark:text-white">{data.databaseProvider === "d1" ? "Cloudflare D1 · R2" : "MongoDB Atlas Production"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import React from "react"
import { useTranslations } from "next-intl"
import { ShieldAlert, UploadCloud, ArrowRight, ArrowLeft, Clock, AlertTriangle } from "lucide-react"
import { Link } from "@/navigation"
import { Button } from "@/components/ui/Button"
import { usePortal } from "./PortalContext"

interface ServiceLockoutGuardProps {
  children: React.ReactNode
}

export function ServiceLockoutGuard({ children }: ServiceLockoutGuardProps) {
  const t = useTranslations()
  const { customer, user, loading, isLoggingOut } = usePortal()

  if (loading || isLoggingOut) {
    return (
      <div className="flex min-h-[450px] w-full items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  // If user or customer is not available (e.g. logging out or unauthenticated), do not flash lockout
  if (!customer || !user) {
    return null
  }

  const isLocked = customer.accountStatus !== "active"

  if (!isLocked) {
    return <>{children}</>
  }

  const isUnderReview = customer.accountStatus === "under_review"
  const isInactive = customer.accountStatus === "inactive"
  const isUnverified = customer.accountStatus === "unverified"

  return (
    <div className="flex min-h-[500px] w-full items-center justify-center p-4 sm:p-8">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-secondary-200/80 bg-white/95 p-8 text-center shadow-premium-lg backdrop-blur-md dark:border-secondary-800 dark:bg-slate-900/95 sm:p-10">
        {/* Glow ambient decoration */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary-500/15 blur-3xl" />

        {/* Status Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-600 shadow-inner ring-8 ring-amber-500/10 dark:bg-amber-950/40 dark:text-amber-400">
          {isUnderReview ? (
            <Clock className="h-10 w-10 animate-pulse text-sky-600 dark:text-sky-400" />
          ) : isInactive ? (
            <AlertTriangle className="h-10 w-10 text-rose-600 dark:text-rose-400" />
          ) : (
            <ShieldAlert className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          )}
        </div>

        {/* Status Badge */}
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>
            {isUnderReview
              ? t("portal.accountStatus.under_review") || "جاري المراجعة"
              : isInactive
                ? t("portal.accountStatus.inactive") || "حساب غير نشط"
                : t("portal.accountStatus.unverified") || "لم يوثق بعد"}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-xl font-black text-secondary-900 dark:text-white sm:text-2xl">
          {t("portal.serviceLockout.title") || "الرجاء توثيق الحساب أولاً لاستخدام خدماتنا"}
        </h2>

        {/* Description */}
        <p className="mt-3 text-sm font-medium leading-relaxed text-secondary-600 dark:text-secondary-400">
          {isUnderReview
            ? t("portal.serviceLockout.underReviewDesc") ||
              "تم رفع مستندات شركتك وجاري مراجعتها حالياً من قبل الإدارة. ستفتح جميع خدمات الشحن والتخليص الجمركي تلقائياً فور اعتماد الحساب."
            : t("portal.serviceLockout.desc") ||
              "خدمات الشحن، التخليص الجمركي، وطلبات عروض الأسعار تتطلب توثيق مستندات الشركة الرسمية (السجل التجاري والبطاقة الضريبية) واعتماد الحساب."}
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <Link href="/portal/documents">
            <Button
              size="lg"
              className="w-full rounded-2xl bg-primary-600 px-6 font-bold text-white shadow-lg shadow-primary-600/25 transition-all hover:bg-primary-700 hover:shadow-primary-600/40 sm:w-auto"
            >
              <UploadCloud className="mr-2 h-5 w-5 rtl:mr-0 rtl:ml-2" />
              <span>
                {isUnderReview
                  ? t("portal.serviceLockout.viewDocsBtn") || "عرض المستندات المرفوعة"
                  : t("portal.serviceLockout.uploadDocsBtn") || "رفع المستندات والتوثيق"}
              </span>
            </Button>
          </Link>

          <Link href="/portal">
            <Button
              variant="outline"
              size="lg"
              className="w-full rounded-2xl border-secondary-300 font-bold text-secondary-700 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-800 sm:w-auto"
            >
              <span>{t("portal.serviceLockout.backToDashboard") || "العودة للوحة التحكم"}</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ArrowUpRight, Bell, DatabaseBackup, FileCheck2, FileSpreadsheet, History, LayoutDashboard, Mail, MessageSquare, PackageSearch, Receipt, Settings2, UsersRound, type LucideIcon } from "lucide-react"
import { useWorkspaceCounts } from "@/components/admin/WorkspaceActivity"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { AdminOverviewDashboard } from "@/components/admin/overview/AdminOverviewDashboard"
import { AdminAnalyticsOverview } from "@/components/admin/analytics/AdminAnalyticsOverview"
import { CustomerOverviewTable } from "@/components/admin/customers/CustomerOverviewTable"
import { cn } from "@/lib/utils"
import { Link } from "@/navigation"
import { useAdminNavPermissions, useAdminRole, useCanAccessAccounts, useCanManageAdminBackups, useCanMarkReadyForAccounts, useCanViewShipmentData, useSimpleAdminExperience } from "@/components/admin/AdminExperienceContext"

type WorkspaceAction = {
  href: string
  title: string
  detail?: string
  icon: LucideIcon
  group: "daily" | "management"
  tone: "sky" | "violet" | "emerald" | "amber" | "blue" | "rose"
  illustration?: "faceless-people"
}

const workspaceToneStyles = {
  sky: "bg-sky-50 text-sky-700 ring-sky-100 group-hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900/70 dark:group-hover:bg-sky-900/70",
  violet: "bg-violet-50 text-violet-700 ring-violet-100 group-hover:bg-violet-100 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900/70 dark:group-hover:bg-violet-900/70",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100 group-hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900/70 dark:group-hover:bg-emerald-900/70",
  amber: "bg-amber-50 text-amber-700 ring-amber-100 group-hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900/70 dark:group-hover:bg-amber-900/70",
  blue: "bg-blue-50 text-blue-700 ring-blue-100 group-hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900/70 dark:group-hover:bg-blue-900/70",
  rose: "bg-rose-50 text-rose-700 ring-rose-100 group-hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900/70 dark:group-hover:bg-rose-900/70",
} as const

function FacelessPeopleIllustration() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="h-7 w-7" fill="none">
    <circle cx="18" cy="15" r="7" fill="currentColor" />
    <circle cx="33" cy="18" r="5.5" fill="currentColor" opacity=".58" />
    <path d="M4.5 39a13.5 13.5 0 0 1 27 0v1h-27v-1Z" fill="currentColor" />
    <path d="M27.5 39a10.5 10.5 0 0 1 16 0v1h-16v-1Z" fill="currentColor" opacity=".58" />
  </svg>
}

export default function AdminDashboardPage() {
  const counts = useWorkspaceCounts()
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === "ar"
  const simpleView = useSimpleAdminExperience()
  const role = useAdminRole()
  const navPerms = useAdminNavPermissions()
  const canManageBackups = useCanManageAdminBackups()

  const canViewShipmentData = useCanViewShipmentData()
  const canAccessAccounts = useCanAccessAccounts()
  const canMarkReadyForAccounts = useCanMarkReadyForAccounts()
  const shipmentTitle = isAr ? "بيانات الشحنات" : "Shipment data"
  const shipmentHref = "/admin/coming-soon/shipments"

  const [activeTab, setActiveTab] = useState<"overview" | "compliance">("overview")

  if (simpleView) {
    const isAdmin = role === "super_admin"
    const isAccountsOnly = !isAdmin && navPerms.staffCategory === "accounts"
    const isOperations = !isAdmin && navPerms.staffCategory === "operations"
    const isCategorized = isOperations || isAccountsOnly
    const canSeeDocs = isAdmin || navPerms.canReviewDocuments === true
    const canSeeCustomers = isAdmin || navPerms.canManageCustomers === true || navPerms.canReviewDocuments === true || navPerms.viewCustomerStatements === true || !isCategorized
    const canSeeInvoices = isAdmin || canAccessAccounts || navPerms.createInvoice === true || navPerms.viewCustomerStatements === true
    const canSeeRequests = isAdmin || !isAccountsOnly
    const canSeeQuotes = isAdmin || !isAccountsOnly

    const actions: WorkspaceAction[] = [
      ...(canAccessAccounts ? [{ href: "/admin/shipment-invoices", title: isAr ? "الحسابات" : "Accounts", detail: isAr ? "تكاليف الشحنات ومسودات الفواتير" : "Shipment costs and invoice drafts", icon: Receipt, group: "daily" as const, tone: "emerald" as const }] : []),
      ...((canAccessAccounts || canMarkReadyForAccounts) ? [{ href: "/admin/accounts-ready", title: isAr ? "جاهزة للحسابات" : "Ready for accounts", detail: isAr ? "اعتماد الشحنات الجاهزة وإحالتها للحسابات" : "Review and approve shipments ready for invoicing", icon: FileCheck2, group: "daily" as const, tone: "amber" as const }] : []),
      ...(canViewShipmentData ? [{ href: shipmentHref, title: shipmentTitle, icon: PackageSearch, group: "daily" as const, tone: "sky" as const }] : []),
      { href: "/admin/chat", title: isAr ? "الشات" : "Chat", detail: isAr ? "تابع رسائلك مع الفريق والعملاء" : "Catch up with staff and customer conversations", icon: MessageSquare, group: "daily", tone: "violet" },
      ...(canSeeRequests ? [{ href: "/admin/requests", title: isAr ? "الطلبات" : "Requests", detail: isAr ? "افتح طلبات الخدمة وتابع حالتها" : "Open service requests and follow their status", icon: PackageSearch, group: "daily" as const, tone: "sky" as const }] : []),
      ...(canSeeCustomers ? [{ href: "/admin/customers", title: isAr ? "العملاء" : "Customers", detail: isAr ? "ابحث عن حسابات العملاء" : "Find customer accounts", icon: UsersRound, group: "daily" as const, tone: "emerald" as const, illustration: "faceless-people" as const }] : []),
      ...(isAdmin || !isCategorized ? [{ href: "/admin/mailbox", title: isAr ? "البريد الإلكتروني" : "Email", detail: isAr ? "راجع أحدث رسائل العمل" : "Review your latest work email", icon: Mail, group: "daily" as const, tone: "blue" as const }] : []),
      ...(isAdmin || !isCategorized ? [{ href: "/admin/activity", title: isAr ? "سجل الحركات" : "Activity log", detail: isAr ? "راجع آخر أنشطة العملاء والفريق" : "Review recent customer and team activity", icon: History, group: "daily" as const, tone: "amber" as const }] : []),
      ...(canSeeDocs ? [{ href: "/admin/documents/review", title: isAr ? "مراجعة المستندات" : "Document review", detail: isAr ? "راجع مستندات العملاء وطلبات التحقق" : "Review customer documents and verification requests", icon: FileCheck2, group: "daily" as const, tone: "sky" as const }] : []),
      ...(canSeeQuotes ? [{ href: "/admin/quotes", title: isAr ? "عروض الأسعار" : "Quotations", detail: isAr ? "تابع عروض الأسعار وحالاتها" : "Review quotations and their status", icon: FileSpreadsheet, group: "management" as const, tone: "violet" as const }] : []),
      ...(canSeeInvoices ? [{ href: "/admin/invoices", title: isAr ? "الفواتير والمدفوعات" : "Invoices & Billing", detail: isAr ? "تابع الفواتير والتحصيلات" : "Manage invoices, payments, and balances", icon: Receipt, group: "management" as const, tone: "emerald" as const }] : []),
      { href: "/admin/notifications", title: isAr ? "مركز الإشعارات" : "Notification center", detail: isAr ? "تابع التنبيهات ومواعيد انتهاء المستندات" : "Track alerts and document expiry dates", icon: Bell, group: "management", tone: "rose" },
      ...(isAdmin ? [{ href: "/admin/staff", title: isAr ? "الموظفون والصلاحيات" : "Staff & Permissions", detail: isAr ? "إدارة حسابات الفريق وصلاحياته" : "Manage team accounts and permissions", icon: UsersRound, group: "management" as const, tone: "blue" as const }] : []),
      ...(isAdmin ? [{ href: "/admin/settings", title: isAr ? "إعدادات النظام" : "System settings", detail: isAr ? "إدارة أنواع المستندات وإعدادات التشغيل" : "Manage document types and operational settings", icon: Settings2, group: "management" as const, tone: "amber" as const }] : []),
      ...(canManageBackups ? [{ href: "/admin/system/backups", title: isAr ? "النسخ الاحتياطية" : "System backups", detail: isAr ? "راجع النسخ الاحتياطية وحالة الحماية" : "Review backups and protection status", icon: DatabaseBackup, group: "management" as const, tone: "sky" as const }] : []),
    ]
    const sections = [
      { id: "daily", title: isAr ? "العمل اليومي" : "Daily work", detail: isAr ? "التواصل ومتابعة الطلبات والعملاء" : "Messages, customers, and active work" },
      { id: "management", title: isAr ? "الإدارة والماليات" : "Management & finance", detail: isAr ? "المتابعة المالية وإدارة النظام" : "Finance and system administration" },
    ] as const
    return <div className="flex min-h-screen flex-col">
      <AdminHeader title={isAr ? "مساحة العمل" : "My workspace"} subtitle={isAr ? "اختار القسم اللي عايز تتابعه" : "Choose what you want to work on"} />
      <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-7 lg:p-9" dir={isAr ? "rtl" : "ltr"}>
        <section className="relative isolate overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/80 to-blue-100/70 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 sm:p-8">
          <div aria-hidden="true" className="absolute -end-14 -top-24 -z-10 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl dark:bg-sky-700/10" />
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/80 text-sky-700 shadow-sm ring-1 ring-sky-100 dark:bg-slate-800 dark:text-sky-300 dark:ring-slate-700"><LayoutDashboard className="h-5 w-5" /></span>
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-sky-700 dark:text-sky-300">NileLink Workspace</p><h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{isAr ? "أهلاً بيك" : "Welcome back"}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{isAr ? "كل أدواتك الأساسية مرتبة هنا للوصول السريع." : "Your essential tools, organized for quick access."}</p></div>
          </div>
        </section>
        {sections.map(section => {
          const sectionActions = actions.filter(action => action.group === section.id)
          const newCount = sectionActions.reduce((sum, action) => sum + (counts[action.href.replace("/admin/", "")] || 0), 0)
          if (!sectionActions.length) return null
          return <section key={section.id} className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div><h3 className="text-base font-extrabold text-slate-900 dark:text-white">{section.title}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{section.detail}</p></div>
              {newCount > 0 && <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-bold text-white" aria-live="polite">{isAr ? "جديد" : "New"}: {newCount > 99 ? "99+" : newCount}</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sectionActions.map(action => {
                const Icon = action.icon
                const count = counts[action.href.replace("/admin/", "")] || 0
                return <Link key={action.href} href={action.href} className="group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:focus-visible:ring-offset-slate-950">
                  <div className="flex items-start justify-between gap-3"><span aria-hidden="true" className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 transition-colors", workspaceToneStyles[action.tone])}>{action.illustration === "faceless-people" ? <FacelessPeopleIllustration /> : <Icon className="h-5 w-5" />}</span>{count > 0 && <span className="ms-auto rounded-full bg-blue-700 px-2 py-0.5 text-xs font-bold text-white" aria-label={`${count} ${isAr ? "جديد" : "new updates"}`}>{count > 99 ? "99+" : count}</span>}<ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-600 rtl:rotate-[-90deg] dark:text-slate-600" /></div>
                  <span className="mt-6 block"><span className="block text-sm font-bold text-slate-900 transition-colors group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-300">{action.title}</span>{action.detail && <span className="mt-1.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{action.detail}</span>}</span>
                </Link>
              })}
            </div>
          </section>
        })}
      </div>
    </div>
  }

  return (
    <div className="flex flex-col">
      <AdminHeader
        title={isAr ? "لوحة التحكم والنظرة العامة" : "Admin Overview & Operations"}
        subtitle={
          isAr
            ? "المراقبة التشغيلية الحية، خوادم البريد، النسخ الاحتياطي، وفريق العمل"
            : "Central operational health, email server, backups, staff and recent audit events"
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        {canAccessAccounts && <Link href="/admin/shipment-invoices" className="flex max-w-sm items-center gap-3 rounded-2xl border border-secondary-200 bg-white p-5 font-bold shadow-sm hover:border-primary-400 dark:border-slate-700 dark:bg-slate-900">
          <Receipt className="h-5 w-5 text-emerald-600" />{isAr ? "الحسابات" : "Accounts"}<ArrowUpRight className="ms-auto h-4 w-4" />
        </Link>}
        {(canAccessAccounts || canMarkReadyForAccounts) && <Link href="/admin/accounts-ready" className="flex max-w-sm items-center gap-3 rounded-2xl border border-secondary-200 bg-white p-5 font-bold shadow-sm hover:border-primary-400 dark:border-slate-700 dark:bg-slate-900">
          <FileCheck2 className="h-5 w-5 text-amber-600" />{isAr ? "جاهزة للحسابات" : "Ready for accounts"}<ArrowUpRight className="ms-auto h-4 w-4" />
        </Link>}
        {canViewShipmentData && (
          <Link href={shipmentHref} className="flex max-w-sm items-center gap-3 rounded-2xl border border-secondary-200 bg-white p-5 font-bold shadow-sm hover:border-primary-400 dark:border-slate-700 dark:bg-slate-900">
            <PackageSearch className="h-5 w-5 text-primary-600" />
            {shipmentTitle}
            <ArrowUpRight className="ms-auto h-4 w-4" />
          </Link>
        )}
        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-secondary-200 pb-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs",
              activeTab === "overview"
                ? "bg-primary-600 text-white shadow-sm"
                : "bg-white text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>{isAr ? "نظرة عامة على المنظومة" : "System Overview"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("compliance")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs",
              activeTab === "compliance"
                ? "bg-primary-600 text-white shadow-sm"
                : "bg-white text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            )}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{isAr ? "امتثال المستندات والعملاء" : "Compliance & Accounts"}</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" ? (
          <AdminOverviewDashboard />
        ) : (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            {/* Executive KPIs & Fast Actions */}
            <AdminAnalyticsOverview />

            {/* Customer Accounts Quick Overview */}
            <div className="pt-2">
              <div className="mb-4">
                <h3 className="text-base font-bold text-secondary-900 dark:text-white">
                  {t("admin.customerTable.title") || "Customer Accounts Overview"}
                </h3>
              </div>
              <CustomerOverviewTable />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useTranslations, useLocale } from "next-intl"
import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  FileCheck,
  Users,
  Bell,
  LogOut,
  Activity,
  Ship,
  FileCheck2,
  Receipt,
  Warehouse,
  Truck,
  FileSpreadsheet,
  Layers,
  DatabaseBackup,
  Mail,
  History,
  MessageSquare,
  LockKeyhole,
  LockKeyholeOpen,
} from "lucide-react"
import Image from "next/image"
import logoImg from "@/public/images/logo.png"
import { Link, usePathname, useRouter } from "@/navigation"
import { cn } from "@/lib/utils"
import { MailboxUnreadBadge } from "./mailbox/MailboxUnreadBadge"
import { useWorkspaceCounts } from "./WorkspaceActivity"

export function AdminSidebar({ canManageBackups = false, canViewShipmentData = false, canAccessAccounts = false, canMarkReadyForAccounts = false, userId }: { canManageBackups?: boolean; canViewShipmentData?: boolean; canAccessAccounts?: boolean; canMarkReadyForAccounts?: boolean; userId?: string }) {
  const counts=useWorkspaceCounts()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [mode, setMode] = useState<"auto" | "open" | "closed">("auto")
  const expanded = mode === "open" || (mode === "auto" && (hovered || focused))
  const storageKey = `nilelink:admin-sidebar-lock:${userId || "default"}`
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      setMode(saved === "open" || saved === "closed" ? saved : "auto")
    } catch { setMode("auto") }
  }, [storageKey])
  const changeMode = (next: "auto" | "open" | "closed") => {
    setMode(next)
    try { localStorage.setItem(storageKey, next) } catch { /* The controls still work when storage is unavailable. */ }
  }
  const t = useTranslations()
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const isAr = locale === "ar"

  const coreNavItems = [
    {
      href: "/admin",
      label: isAr ? "نظرة عامة" : "Overview",
      icon: LayoutDashboard,
    },
    ...(canViewShipmentData ? [{ href: "/admin/coming-soon/shipments", label: isAr ? "بيانات الشحنات" : "Shipment data", icon: Ship }] : []),
    ...(canAccessAccounts ? [{ href: "/admin/shipment-invoices", label: isAr ? "الحسابات" : "Accounts", icon: Receipt }] : []),
    ...((canAccessAccounts || canMarkReadyForAccounts) ? [{ href: "/admin/accounts-ready", label: isAr ? "جاهزة للحسابات" : "Ready for accounts", icon: FileCheck2 }] : []),
    { href: "/admin/activity", label: isAr ? "سجل الحركات" : "Activity log", icon: History },
    { href: "/admin/chat", label: isAr ? "الشات" : "Chat", icon: MessageSquare },
    {
      href: "/admin/documents/review",
      label: t("admin.sidebar.reviewQueue") || "Document Review Queue",
      icon: FileCheck,
    },
    {
      href: "/admin/customers",
      label: t("admin.sidebar.customers") || "Customer Accounts",
      icon: Users,
    },
    {
      href: "/admin/requests",
      label: t("admin.sidebar.requests") || "Service Requests",
      icon: Layers,
    },
    {
      href: "/admin/quotes",
      label: isAr ? "عروض الأسعار" : "Quotations",
      icon: FileSpreadsheet,
    },
    {
      href: "/admin/invoices",
      label: isAr ? "إدارة الفواتير والماليات" : "Invoices & Billing",
      icon: Receipt,
    },
    {
      href: "/admin/notifications",
      label: t("admin.sidebar.notifications") || "Notification Center",
      icon: Bell,
    },
    {
      href: "/admin/mailbox",
      label: isAr ? "البريد الإلكتروني" : "Email",
      icon: Mail,
    },
    {
      href: "/admin/staff",
      label: t("admin.sidebar.staff") || "Staff & Permissions",
      icon: Users,
    },
    {
      href: "/admin/settings",
      label: t("admin.sidebar.settings") || "System Settings",
      icon: Activity,
    },
    ...(canManageBackups
      ? [
          {
            href: "/admin/system/backups",
            label: isAr ? "النسخ الاحتياطي" : "System Backups",
            icon: DatabaseBackup,
          },
        ]
      : []),
  ]

  const upcomingLogisticsModules = [

    {
      href: "/admin/coming-soon/customs",
      label: isAr ? "الإقرارات الجمركية و ACID" : "Customs & ACID Nafeza",
      icon: FileCheck2,
    },
    {
      href: "/admin/coming-soon/warehouses",
      label: isAr ? "المستودعات والساحات" : "Bonded Warehouses",
      icon: Warehouse,
    },
    {
      href: "/admin/coming-soon/fleet",
      label: isAr ? "أسطول النقل البري (GPS)" : "Fleet & Truck Dispatch",
      icon: Truck,
    },
  ]

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/login"
      } else {
        router.push("/login")
      }
    }
  }

  const collapsed = !expanded

  return (
    <aside
      id="admin-primary-navigation"
      onMouseOver={event => { if (!(event.target as Element).closest("[data-sidebar-lock]")) setHovered(true) }}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={event => { if (!(event.target as Element).closest("[data-sidebar-lock]")) setFocused((event.target as Element).matches(":focus-visible")) }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}
      className={cn("admin-sidebar sticky top-0 flex h-screen shrink-0 flex-col text-secondary-900 transition-[width,background-color] duration-200 ease-in-out dark:text-white", collapsed ? "w-16 border-e-transparent bg-transparent md:w-[72px] dark:border-e-transparent dark:bg-transparent" : "w-64 border-e border-secondary-200 bg-white dark:border-slate-800 dark:bg-slate-950")}
    >
      {/* Brand Header */}
      <div className={cn("flex h-16 items-center border-b border-secondary-100 dark:border-slate-800", collapsed ? "justify-center px-2" : "gap-2.5 px-4")} dir="ltr">
        <div className={cn("relative shrink-0", collapsed ? "h-[36px] w-[36px]" : "h-[34px] w-[60px]")}>
          <Image
            src={logoImg}
            alt="NileLink"
            fill
            sizes={collapsed ? "36px" : "60px"}
            className="object-contain"
          />
        </div>
        {!collapsed && <div className="flex w-fit shrink-0 flex-col justify-center leading-none">
          <span className="w-fit whitespace-nowrap text-base font-black tracking-widest text-secondary-900 dark:text-white uppercase">
            NileLink
          </span>
          <span className="my-[3px] border-t-2 border-primary-500 w-full rounded-full" />
          <span className="flex w-full justify-between text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
            {"LOGISTICS".split("").map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </span>
        </div>}
      </div>

      <div data-sidebar-lock className={cn("flex shrink-0 items-center gap-1 border-b border-secondary-100 py-1.5 dark:border-slate-800", collapsed ? "justify-center px-1" : "justify-end px-3")}>
        <button
          type="button"
          aria-pressed={mode !== "auto"}
          aria-label={isAr ? (mode === "auto" ? "تثبيت وضع القائمة الحالي" : "إلغاء التثبيت والفتح تلقائيًا") : (mode === "auto" ? "Lock current sidebar position" : "Unlock automatic sidebar")}
          title={isAr ? (mode === "auto" ? "تثبيت وضع القائمة الحالي" : "إلغاء التثبيت والفتح تلقائيًا") : (mode === "auto" ? "Lock current sidebar position" : "Unlock automatic sidebar")}
          onClick={() => changeMode(mode === "auto" ? (expanded ? "open" : "closed") : "auto")}
          className={cn("rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500", mode === "auto" ? "text-secondary-500 hover:bg-secondary-100 dark:text-slate-400 dark:hover:bg-slate-800" : "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300")}
        >{mode === "auto" ? <LockKeyholeOpen className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}</button>
      </div>

      {/* Navigation Body */}
      <nav className={cn("admin-sidebar-scroll flex-1 space-y-6 py-4 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
        {/* Core Group */}
        <div>
          {!collapsed && <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-secondary-400 dark:text-slate-500">
            {isAr ? "العمليات الأساسية" : "Core Operations"}
          </span>}
          <div className="mt-1.5 space-y-1">
            {coreNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (pathname.startsWith(item.href) && item.href !== "/admin")

              if (item.href === "/admin/mailbox") return (
                <div key={item.href} className={cn("flex items-center rounded-xl text-xs font-semibold transition-colors", isActive ? "bg-primary-600 text-white shadow-sm" : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white")}>
                  {collapsed ? <MailboxUnreadBadge ar={isAr} /> : <>
                    <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-3 py-2 ps-3 pe-1">
                      <item.icon className="h-4 w-4 shrink-0" /><span className="truncate">{item.label}</span>
                    </Link>
                    <MailboxUnreadBadge ar={isAr} />
                  </>}
                </div>
              )
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center rounded-xl py-2 text-xs font-semibold transition-colors",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    isActive
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0 rtl:scale-x-[-1]" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {(counts[item.href.replace("/admin/","")]??0)>0&&<span className={cn("inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white",collapsed?"absolute -end-1 -top-1":"ms-auto")}>{counts[item.href.replace("/admin/","")]>99?"99+":counts[item.href.replace("/admin/","")]}</span>}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Logistics Industry Roadmap Group ("Coming Soon" / "قريباً") */}
        <div>
          {!collapsed && <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary-400 dark:text-slate-500">
              {isAr ? "منظومة الشحن المتكاملة" : "Enterprise Logistics"}
            </span>
            <span className="inline-flex items-center rounded-full bg-purple-50 px-1.5 py-0.2 text-[9px] font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              {isAr ? "قريباً" : "Soon"}
            </span>
          </div>}

          <div className="mt-1.5 space-y-1">
            {upcomingLogisticsModules.map((item) => {
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group flex items-center justify-between rounded-xl py-2 text-xs font-medium transition-colors",
                    collapsed ? "justify-center px-2" : "px-3",
                    isActive
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                  )}
                >
                  <div className={cn("flex min-w-0 items-center truncate", collapsed ? "justify-center" : "gap-2.5")}>
                    <item.icon className="h-4 w-4 shrink-0 text-secondary-400 group-hover:text-purple-600 dark:text-slate-500 dark:group-hover:text-purple-400 transition-colors" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!collapsed && <span className="shrink-0 rounded bg-secondary-100 px-1.5 py-0.5 text-[9px] font-bold text-secondary-600 group-hover:bg-purple-100 group-hover:text-purple-700 dark:bg-secondary-800 dark:text-secondary-400 dark:group-hover:bg-purple-950 dark:group-hover:text-purple-300">
                    {isAr ? "قريباً" : "Soon"}
                  </span>}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Bottom Logout */}
      <div className={cn("border-t border-secondary-100 dark:border-slate-800", collapsed ? "p-2" : "p-3")}>
        <button
          onClick={handleLogout}
          title={collapsed ? (t("common.logout") || "Sign Out") : undefined}
          className={cn("flex w-full items-center rounded-xl py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 transition-colors", collapsed ? "justify-center" : "gap-3 px-3.5")}
        >
          <LogOut className="h-4 w-4 rtl:rotate-180" />
          {!collapsed && <span>{t("common.logout") || "Sign Out"}</span>}
        </button>
      </div>
    </aside>
  )
}

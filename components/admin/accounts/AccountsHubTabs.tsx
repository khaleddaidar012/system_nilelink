"use client"

import { useLocale } from "next-intl"
import { Link, usePathname } from "@/navigation"
import { Receipt, Users } from "lucide-react"
import { useCanAccessAccounts } from "@/components/admin/AdminExperienceContext"

export function AccountsHubTabs() {
  const isAr = useLocale() === "ar"
  const pathname = usePathname()
  const canAccessAccounts = useCanAccessAccounts()

  const onCompanies = pathname.startsWith("/admin/customers")
  const onShipmentAccounts = pathname.startsWith("/admin/shipment-invoices")

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="flex flex-wrap items-center gap-2 border-b border-secondary-200 bg-white px-4 py-3 sm:px-7 dark:border-slate-800 dark:bg-slate-950"
    >
      <Link
        href="/admin/customers"
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
          onCompanies
            ? "bg-primary-600 text-white shadow-sm"
            : "border border-secondary-200 bg-secondary-50 text-secondary-700 hover:bg-secondary-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        }`}
      >
        <Users className="h-4 w-4" />
        <span>{isAr ? "حسابات الشركات" : "Company Accounts"}</span>
      </Link>

      {canAccessAccounts && (
        <Link
          href="/admin/shipment-invoices"
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            onShipmentAccounts
              ? "bg-primary-600 text-white shadow-sm"
              : "border border-secondary-200 bg-secondary-50 text-secondary-700 hover:bg-secondary-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>{isAr ? "حسابات وفواتير الشحنات" : "Shipment Accounts & Invoices"}</span>
        </Link>
      )}
    </div>
  )
}

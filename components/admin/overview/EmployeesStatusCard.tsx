"use client"

import { Users, UserCheck, UserX, Shield, ArrowUpRight } from "lucide-react"
import { Link } from "@/navigation"
import { AdminOverviewData } from "./types"

interface Props {
  employees: AdminOverviewData["employees"]
  locale: string
}

export function EmployeesStatusCard({ employees, locale }: Props) {
  const isAr = locale === "ar"

  const superAdminCount = employees.roleDistribution?.super_admin || 0
  const staffCount = employees.roleDistribution?.staff || 0

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                {isAr ? "فريق العمل والموظفين" : "Employees & Staff"}
              </h3>
              <span className="text-[11px] text-secondary-500 dark:text-slate-400">
                {isAr ? "الصلاحيات والوصول التشغيلي" : "Internal Team Management"}
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            <span>{employees.total} {isAr ? "عضو" : "Members"}</span>
          </span>
        </div>

        {/* Status Metrics */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3 text-xs dark:border-slate-800/80 dark:bg-slate-950/40">
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-[11px] text-secondary-500 dark:text-slate-400">
              <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>{isAr ? "الموظفون النشطون" : "Active Staff"}</span>
            </span>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {employees.active}
            </div>
          </div>

          <div className="space-y-1 border-r border-secondary-200 pr-2.5 rtl:border-r-0 rtl:border-l rtl:pl-2.5 rtl:pr-0 dark:border-slate-800">
            <span className="flex items-center gap-1.5 text-[11px] text-secondary-500 dark:text-slate-400">
              <UserX className="h-3.5 w-3.5 text-rose-500" />
              <span>{isAr ? "غير نشط / معلق" : "Inactive / Suspended"}</span>
            </span>
            <div className="text-base font-bold text-secondary-900 dark:text-white">
              {employees.inactive}
            </div>
          </div>
        </div>

        {/* Roles Distribution */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-[11px] text-secondary-400 shrink-0">
            {isAr ? "توزيع الرتب:" : "Roles:"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <Shield className="h-3 w-3" />
              <span>{superAdminCount} {isAr ? "مدير نظام" : "Super Admin"}</span>
            </span>
            <span className="inline-flex items-center rounded-md bg-secondary-100 px-2 py-0.5 text-[10px] font-medium text-secondary-700 dark:bg-slate-800 dark:text-slate-300">
              <span>{staffCount} {isAr ? "موظف عمليات" : "Staff"}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Footer Action Link */}
      <div className="mt-4 border-t border-secondary-100 pt-3 dark:border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-secondary-400 truncate">
          {isAr ? "إدارة الصلاحيات والمستخدمين" : "RBAC & Permissions"}
        </span>

        <Link
          href="/admin/staff"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
        >
          <span>{isAr ? "إدارة فريق العمل" : "Manage Employees"}</span>
          <ArrowUpRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}

"use client"

import { canAccessShipmentData } from "@/lib/auth/shipment-access"
import { canAccessAccounts as accountsAccess } from "@/lib/auth/accounts-access"
import { normalizeStaffCategory, userCanMarkReadyForAccounts } from "@/lib/auth/staff-categories"
import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Shield,
  Bell,
  FileCheck,
  Users,
  Loader2,
  CheckCircle2,
  Ban,
  Receipt,
  FileSpreadsheet,
  Send,
  Ship,
  FileCheck2,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/Button"

export interface StaffItem {
  id: string
  firstName: string
  lastName: string
  jobTitle?: string
  email: string
  username?: string
  phone: string
  role: string
  status: string
  staffPermissions: {
    staffCategory?: "operations" | "accounts"
    canMarkReadyForAccounts?: boolean
    canAccessAccounts?: boolean
    canViewShipmentData?: boolean
    canSendAlerts: boolean
    canReviewDocuments: boolean
    canManageCustomers: boolean
    canUseTieredPricing?: boolean
    issueTaxInvoice?: boolean
    createInvoice?: boolean
    editInvoice?: boolean
    viewCustomerStatements?: boolean
    exportCustomerStatements?: boolean
    sendFinancialDocuments?: boolean
  }
}

interface EditPermissionsModalProps {
  staff: StaffItem | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function EditPermissionsModal({
  staff,
  isOpen,
  onClose,
  onSuccess,
}: EditPermissionsModalProps) {
  const t = useTranslations()
  const isAr = useLocale() === "ar"
  const staffCategory = normalizeStaffCategory(staff?.staffPermissions?.staffCategory)
  const isOperations = staff?.role === "staff" && staffCategory === "operations"
  const [canMarkReadyForAccounts, setCanMarkReadyForAccounts] = useState(() => staff ? userCanMarkReadyForAccounts(staff) : false)
  const [canAccessAccounts, setCanAccessAccounts] = useState(() => staff ? accountsAccess(staff) : false)
  const [canViewShipmentData, setCanViewShipmentData] = useState(() =>
    staff ? canAccessShipmentData({
      email: staff.email,
      role: staff.role,
      staffPermissions: staff.staffPermissions,
    }) : false
  )
  const [canSendAlerts, setCanSendAlerts] = useState(
    staff?.staffPermissions?.canSendAlerts ?? true
  )
  const [canReviewDocuments, setCanReviewDocuments] = useState(
    staff?.staffPermissions?.canReviewDocuments ?? true
  )
  const [canManageCustomers, setCanManageCustomers] = useState(
    staff?.staffPermissions?.canManageCustomers ?? false
  )
  const [issueTaxInvoice, setIssueTaxInvoice] = useState(
    staff?.staffPermissions?.issueTaxInvoice ?? false
  )
  // Preserved silently for backward compatibility with existing records; hidden from staff permissions UI.
  const canUseTieredPricing = staff?.staffPermissions?.canUseTieredPricing ?? false
  const [createInvoice, setCreateInvoice] = useState(
    staff?.staffPermissions?.createInvoice ?? true
  )
  const [viewCustomerStatements, setViewCustomerStatements] = useState(
    staff?.staffPermissions?.viewCustomerStatements ?? true
  )
  const [sendFinancialDocuments, setSendFinancialDocuments] = useState(
    staff?.staffPermissions?.sendFinancialDocuments ?? false
  )
  const [status, setStatus] = useState(staff?.status || "active")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !staff) return null

  const categoryBadge = staff.role === "super_admin"
    ? (isAr ? "مدير النظام" : "Super Admin")
    : staffCategory === "operations"
      ? (isAr ? "التشغيل" : "Operations")
      : staffCategory === "accounts"
        ? (isAr ? "الحسابات" : "Accounts")
        : (isAr ? "موظف" : "Staff")

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/admin/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          staffPermissions: {
            ...(staffCategory ? { staffCategory } : {}),
            canMarkReadyForAccounts,
            canAccessAccounts: isOperations ? false : canAccessAccounts,
            canViewShipmentData,
            canSendAlerts,
            canReviewDocuments,
            canManageCustomers,
            canUseTieredPricing: isOperations ? false : canUseTieredPricing,
            issueTaxInvoice: isOperations ? false : issueTaxInvoice,
            createInvoice: isOperations ? false : createInvoice,
            editInvoice: isOperations ? false : createInvoice,
            viewCustomerStatements: isOperations ? false : viewCustomerStatements,
            exportCustomerStatements: isOperations ? false : viewCustomerStatements,
            sendFinancialDocuments: isOperations ? false : sendFinancialDocuments,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || (isAr ? "فشل تحديث صلاحيات الموظف" : "Failed to update staff permissions"))
        return
      }

      onSuccess()
      onClose()
    } catch {
      setError(isAr ? "خطأ في الاتصال أثناء تحديث الصلاحيات" : "Network error while updating staff")
    } finally {
      setLoading(false)
    }
  }

  const operationalPermissions = [
    {
      id: "canSendAlerts",
      checked: canSendAlerts,
      onChange: setCanSendAlerts,
      icon: Bell,
      iconTone: "text-primary-500",
      title: isAr ? "إرسال التنبيهات والإشعارات" : "Send Alerts & Broadcasts",
      description: isAr
        ? "إرسال إشعارات يدوية للعملاء وتنبيهات انتهاء المستندات"
        : "Trigger manual client notifications and expiry warnings",
    },
    {
      id: "canReviewDocuments",
      checked: canReviewDocuments,
      onChange: setCanReviewDocuments,
      icon: FileCheck,
      iconTone: "text-teal-500",
      title: isAr ? "مراجعة واعتماد المستندات" : "Review & Verify Documents",
      description: isAr
        ? "فحص مستندات الامتثال وتحديد الصلاحية واعتماد أو رفض الملفات"
        : "Verify compliance files, set validity dates, and approve or reject uploads",
    },
    {
      id: "canManageCustomers",
      checked: canManageCustomers,
      onChange: setCanManageCustomers,
      icon: Users,
      iconTone: "text-indigo-500",
      title: isAr ? "إدارة حسابات العملاء" : "Manage Customer Accounts",
      description: isAr
        ? "تغيير حالة حساب العميل (نشط، تحذير، مقيّد) ومتابعة بياناته"
        : "Update customer account status (Active, Warning, Restricted)",
    },
    {
      id: "canViewShipmentData",
      checked: canViewShipmentData,
      onChange: setCanViewShipmentData,
      icon: Ship,
      iconTone: "text-sky-500",
      title: isAr ? "عرض وإدارة بيانات الشحنات" : "View & Manage Shipment Data",
      description: isAr
        ? "الوصول إلى قسم بيانات الشحنات وإضافة ومتابعة تفاصيل الشحنات"
        : "Access shipment records and manage shipment details",
    },
    {
      id: "canMarkReadyForAccounts",
      checked: canMarkReadyForAccounts,
      onChange: setCanMarkReadyForAccounts,
      icon: FileCheck2,
      iconTone: "text-amber-500",
      title: isAr ? "تحويل الشحنة إلى «جاهزة للحسابات»" : "Mark Shipment Ready for Accounts",
      description: isAr
        ? "إشعار الإدارة بجاهزية الشحنة لتحويلها إلى فريق الحسابات"
        : "Notify administrators that a shipment is ready for billing",
    },
  ]

  const financialPermissions = [
    {
      id: "canAccessAccounts",
      checked: canAccessAccounts,
      onChange: setCanAccessAccounts,
      disabled: staff.role === "super_admin",
      icon: Wallet,
      iconTone: "text-emerald-600",
      title: isAr ? "الوصول إلى قسم الحسابات" : "Access Accounts Workspace",
      description: isAr
        ? "عرض كارت الحسابات والوصول إلى تكاليف الشحنات ومسودات الفواتير"
        : "View the Accounts card and access shipment costs and invoice drafts",
    },
    {
      id: "createInvoice",
      checked: createInvoice,
      onChange: setCreateInvoice,
      icon: Receipt,
      iconTone: "text-blue-500",
      title: isAr ? "إنشاء وإدارة الفواتير" : "Create & Manage Invoices",
      description: isAr
        ? "إنشاء وتعديل مسودات الفواتير والمطالبات المالية"
        : "Create and edit invoice drafts and billing requests",
    },
    {
      id: "issueTaxInvoice",
      checked: issueTaxInvoice,
      onChange: setIssueTaxInvoice,
      highlight: true,
      icon: Shield,
      iconTone: "text-emerald-600",
      title: isAr ? "إصدار فواتير ضريبية" : "Issue Tax Invoices",
      description: isAr
        ? "صلاحية أمنية خاصة لإصدار وطباعة الفاتورة الضريبية الرسمية"
        : "Restricted permission to issue and print official tax invoices",
    },
    {
      id: "viewCustomerStatements",
      checked: viewCustomerStatements,
      onChange: setViewCustomerStatements,
      icon: FileSpreadsheet,
      iconTone: "text-purple-500",
      title: isAr ? "كشوف حسابات العملاء" : "Customer Account Statements",
      description: isAr
        ? "استخراج ومراجعة كشوف الحسابات وحركات المدين والدائن"
        : "View and export customer statements and ledger movements",
    },
    {
      id: "sendFinancialDocuments",
      checked: sendFinancialDocuments,
      onChange: setSendFinancialDocuments,
      icon: Send,
      iconTone: "text-amber-500",
      title: isAr ? "إرسال المستندات المالية بالبريد" : "Email Financial Documents",
      description: isAr
        ? "إرسال الفواتير وكشوف الحسابات إلى البريد الإلكتروني للعميل"
        : "Send invoices and account statements to customer email addresses",
    },
  ]

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
        dir={isAr ? "rtl" : "ltr"}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-secondary-200 bg-white shadow-2xl dark:border-secondary-800 dark:bg-secondary-900"
        >
          {/* Fixed Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-secondary-100 px-5 py-4 dark:border-secondary-800">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400">
                <Shield className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-secondary-900 dark:text-white">
                    {isAr ? "تعديل صلاحيات الموظف" : (t("admin.staff.editTitle") || "Edit Staff Permissions")}
                  </h3>
                  <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-bold text-secondary-700 dark:bg-secondary-800 dark:text-secondary-300">
                    {categoryBadge}
                  </span>
                </div>
                <p className="truncate text-xs text-secondary-500">
                  {staff.firstName} {staff.lastName} • <bdi dir="ltr">{staff.email || staff.username}</bdi>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? "إغلاق" : "Close"}
              className="shrink-0 rounded-lg p-1.5 text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700 dark:hover:bg-secondary-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable Body + Fixed Footer */}
          <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              {/* Account Status Toggle */}
              <div>
                <label className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                  {isAr ? "حالة حساب الموظف" : "Employee Account Status"}
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("active")}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition-all ${
                      status === "active"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-400"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isAr ? "نشط" : "Active"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("suspended")}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition-all ${
                      status === "suspended"
                        ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                        : "border-secondary-200 text-secondary-600 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-400"
                    }`}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>{isAr ? "موقوف" : "Suspended"}</span>
                  </button>
                </div>
              </div>

              {/* Operational Permissions Group */}
              <div className="space-y-1.5 rounded-xl border border-secondary-200/80 bg-secondary-50/70 p-3.5 dark:border-secondary-800 dark:bg-secondary-800/40">
                <p className="mb-2 text-xs font-bold text-secondary-900 dark:text-white">
                  {isAr ? "الصلاحيات التشغيلية" : "Operational Permissions"}
                </p>
                {operationalPermissions.map((perm) => {
                  const Icon = perm.icon
                  return (
                    <label
                      key={perm.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl p-2.5 transition-colors hover:bg-white dark:hover:bg-secondary-800"
                    >
                      <input
                        type="checkbox"
                        checked={perm.checked}
                        onChange={(e) => perm.onChange(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded text-primary-600 focus:ring-primary-500"
                      />
                      <div className="min-w-0 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-secondary-900 dark:text-white">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${perm.iconTone}`} />
                          <span>{perm.title}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-secondary-500 dark:text-secondary-400">
                          {perm.description}
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Financial Permissions Group (Hidden for Operations) */}
              {!isOperations && (
                <div className="space-y-1.5 rounded-xl border border-secondary-200/80 bg-secondary-50/70 p-3.5 dark:border-secondary-800 dark:bg-secondary-800/40">
                  <p className="mb-2 text-xs font-bold text-secondary-900 dark:text-white">
                    {isAr ? "الصلاحيات المالية والحسابات" : "Financial & Accounts Permissions"}
                  </p>
                  {financialPermissions.map((perm) => {
                    const Icon = perm.icon
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-start gap-2.5 rounded-xl p-2.5 transition-colors ${
                          perm.disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-white dark:hover:bg-secondary-800"
                        } ${
                          perm.highlight
                            ? "border border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                            : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={perm.checked}
                          disabled={perm.disabled}
                          onChange={(e) => perm.onChange(e.target.checked)}
                          className={`mt-0.5 h-4 w-4 shrink-0 rounded ${
                            perm.highlight ? "text-emerald-600 focus:ring-emerald-500" : "text-primary-600 focus:ring-primary-500"
                          }`}
                        />
                        <div className="min-w-0 text-xs">
                          <div
                            className={`flex items-center gap-1.5 font-bold ${
                              perm.highlight
                                ? "text-emerald-800 dark:text-emerald-300"
                                : "text-secondary-900 dark:text-white"
                            }`}
                          >
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${perm.iconTone}`} />
                            <span>{perm.title}</span>
                          </div>
                          <p
                            className={`mt-0.5 text-[11px] leading-relaxed ${
                              perm.highlight
                                ? "text-emerald-700/80 dark:text-emerald-400/80"
                                : "text-secondary-500 dark:text-secondary-400"
                            }`}
                          >
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Fixed Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-secondary-100 bg-white px-5 py-3.5 dark:border-secondary-800 dark:bg-secondary-900">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary-600 font-bold text-white hover:bg-primary-700">
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{isAr ? "جارٍ الحفظ..." : "Saving..."}</span>
                  </span>
                ) : (
                  <span>{isAr ? "حفظ الصلاحيات" : "Save Permissions"}</span>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

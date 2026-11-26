"use client"

import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  UserPlus,
  Shield,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
  Plus,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { ACCOUNTS_PRESET, OPERATIONS_PRESET } from "@/lib/auth/staff-categories"

interface CreateStaffModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface RoleConfig {
  id: string
  title: string
  permissions: {
    canSendAlerts: boolean
    canReviewDocuments: boolean
    canManageCustomers: boolean
    issueTaxInvoice?: boolean
    createInvoice?: boolean
    editInvoice?: boolean
    viewCustomerStatements?: boolean
    exportCustomerStatements?: boolean
    sendFinancialDocuments?: boolean
  }
}

export function CreateStaffModal({ isOpen, onClose, onSuccess }: CreateStaffModalProps) {
  const t = useTranslations()
  const isAr = useLocale() === "ar"
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [phone, setPhone] = useState("+20")
  const [password, setPassword] = useState("")
  const [canAccessAccounts, setCanAccessAccounts] = useState(false)

  // Roles State
  const [roles, setRoles] = useState<RoleConfig[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>("staff")
  const [loadingRoles, setLoadingRoles] = useState(false)

  // New Role Form State
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [newRoleTitle, setNewRoleTitle] = useState("")
  const [newCanSendAlerts, setNewCanSendAlerts] = useState(false)
  const [newCanReviewDocs, setNewCanReviewDocs] = useState(false)
  const [newCanManageCust, setNewCanManageCust] = useState(false)
  const [creatingRoleLoading, setCreatingRoleLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchRoles()
    }
  }, [isOpen])

  const fetchRoles = async () => {
    setLoadingRoles(true)
    try {
      const res = await fetch("/api/admin/roles")
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles || [])
      }
    } catch (err) {
      console.error("Failed to fetch roles", err)
    } finally {
      setLoadingRoles(false)
    }
  }

  const handleCreateRole = async () => {
    if (!newRoleTitle.trim()) return
    setCreatingRoleLoading(true)
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newRoleTitle,
          permissions: {
            canSendAlerts: newCanSendAlerts,
            canReviewDocuments: newCanReviewDocs,
            canManageCustomers: newCanManageCust,
          }
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setRoles([...roles, data.role])
        setSelectedRoleId(data.role.id)
        setIsCreatingRole(false)
        setNewRoleTitle("")
        setNewCanSendAlerts(false)
        setNewCanReviewDocs(false)
        setNewCanManageCust(false)
      } else {
        setError(data.error || (isAr ? "فشل إنشاء الدور الوظيفي" : "Failed to create role"))
      }
    } catch {
      setError(isAr ? "خطأ في الاتصال أثناء إنشاء الدور" : "Network error creating role")
    } finally {
      setCreatingRoleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      let roleType = "staff"
      let staffPermissions: Record<string, unknown> = {
        canSendAlerts: false,
        canReviewDocuments: false,
        canManageCustomers: false,
        issueTaxInvoice: false,
        createInvoice: false,
        editInvoice: false,
        viewCustomerStatements: false,
        exportCustomerStatements: false,
        sendFinancialDocuments: false,
      }
      let jobTitleStr = selectedRoleId === "staff" ? t("admin.staff.staff") : ""

      if (selectedRoleId === "super_admin") {
        roleType = "super_admin"
        staffPermissions = {
          canSendAlerts: true,
          canReviewDocuments: true,
          canManageCustomers: true,
          canViewShipmentData: true,
          canMarkReadyForAccounts: true,
          canAccessAccounts: true,
          issueTaxInvoice: true,
          createInvoice: true,
          editInvoice: true,
          viewCustomerStatements: true,
          exportCustomerStatements: true,
          sendFinancialDocuments: true,
        }
      } else if (selectedRoleId === "operations") {
        jobTitleStr = "Operation"
        staffPermissions = { ...OPERATIONS_PRESET }
      } else if (selectedRoleId === "accounts") {
        jobTitleStr = "Accounts"
        staffPermissions = { ...ACCOUNTS_PRESET }
      } else {
        const selectedRoleObj = roles.find(r => r.id === selectedRoleId)
        if (selectedRoleObj) {
          jobTitleStr = selectedRoleObj.title
          staffPermissions = {
            ...staffPermissions,
            ...(selectedRoleObj.permissions || {}),
          }
        }
      }

      const finalPermissions = selectedRoleId === "operations"
        ? staffPermissions
        : { ...staffPermissions, canAccessAccounts: roleType === "super_admin" || selectedRoleId === "accounts" || canAccessAccounts }

      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          jobTitle: jobTitleStr,
          email,
          username,
          phone,
          password,
          role: roleType,
          staffPermissions: finalPermissions,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const detail = data.details ? Object.values(data.details).flatMap(value =>
          value && typeof value === "object" && "_errors" in value ? (value as { _errors: string[] })._errors : []
        ).join(". ") : ""
        setError(detail || data.error || (isAr ? "فشل إنشاء حساب الموظف" : "Failed to create staff account"))
        return
      }

      onSuccess()
      onClose()
    } catch {
      setError(isAr ? "خطأ في الاتصال أثناء إنشاء الحساب" : "Network error while creating staff account")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  let currentPermissions = {
    canSendAlerts: selectedRoleId === "super_admin",
    canReviewDocuments: selectedRoleId === "super_admin",
    canManageCustomers: selectedRoleId === "super_admin",
    canViewShipmentData: selectedRoleId === "super_admin",
    canAccessAccounts: selectedRoleId === "super_admin" || canAccessAccounts,
  }
  if (selectedRoleId === "operations") {
    currentPermissions = {
      canSendAlerts: OPERATIONS_PRESET.canSendAlerts,
      canReviewDocuments: OPERATIONS_PRESET.canReviewDocuments,
      canManageCustomers: OPERATIONS_PRESET.canManageCustomers,
      canViewShipmentData: OPERATIONS_PRESET.canViewShipmentData,
      canAccessAccounts: false,
    }
  } else if (selectedRoleId === "accounts") {
    currentPermissions = {
      canSendAlerts: ACCOUNTS_PRESET.canSendAlerts,
      canReviewDocuments: ACCOUNTS_PRESET.canReviewDocuments,
      canManageCustomers: ACCOUNTS_PRESET.canManageCustomers,
      canViewShipmentData: ACCOUNTS_PRESET.canViewShipmentData,
      canAccessAccounts: true,
    }
  } else if (selectedRoleId !== "super_admin") {
    const r = roles.find(x => x.id === selectedRoleId)
    if (r) {
      currentPermissions = {
        ...currentPermissions,
        canSendAlerts: r.permissions.canSendAlerts,
        canReviewDocuments: r.permissions.canReviewDocuments,
        canManageCustomers: r.permissions.canManageCustomers,
      }
    }
  }

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
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-secondary-900 dark:text-white">
                  {isAr ? "إضافة موظف جديد" : (t("admin.staff.createTitle") || "Add New Employee")}
                </h3>
                <p className="truncate text-xs text-secondary-500">
                  {isAr ? "إنشاء حساب موظف جديد وتحديد تصنيفه وصلاحياته" : (t("admin.staff.createSubtitle") || "Create a staff account and configure operational permissions")}
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
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {isAr ? "الاسم الأول" : "First Name"}
                  </label>
                  <div className="relative mt-1">
                    <User className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400 rtl:right-3 rtl:left-auto" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={isAr ? "كريم" : "Karim"}
                      className="w-full rounded-xl border border-secondary-200 bg-white py-2 pr-3 pl-8 text-xs font-medium text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pr-8 rtl:pl-3"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {isAr ? "اسم العائلة" : "Last Name"}
                  </label>
                  <div className="relative mt-1">
                    <User className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400 rtl:right-3 rtl:left-auto" />
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={isAr ? "ناصر" : "Nasser"}
                      className="w-full rounded-xl border border-secondary-200 bg-white py-2 pr-3 pl-8 text-xs font-medium text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pr-8 rtl:pl-3"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                  {t("admin.staff.emailOptional")}
                </label>
                <div className="relative mt-1">
                  <Mail className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400 rtl:right-3 rtl:left-auto" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@nilelinklogistics.com"
                    dir="ltr"
                    className="w-full rounded-xl border border-secondary-200 bg-white py-2 pr-3 pl-8 text-xs font-medium text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pr-8 rtl:pl-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {isAr ? "رقم الموبايل / واتساب" : "WhatsApp / Mobile"}
                  </label>
                  <div className="relative mt-1">
                    <Phone className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400 rtl:right-3 rtl:left-auto" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+201000000000"
                      dir="ltr"
                      className="w-full rounded-xl border border-secondary-200 bg-white py-2 pr-3 pl-8 text-xs font-medium text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pr-8 rtl:pl-3"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {isAr ? "كلمة المرور الأولية" : "Initial Password"}
                  </label>
                  <div className="relative mt-1">
                    <Lock className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400 rtl:right-3 rtl:left-auto" />
                    <input
                      type="password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-secondary-200 bg-white py-2 pr-3 pl-8 text-xs font-medium text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pr-8 rtl:pl-3"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="staff-username" className="text-xs font-bold text-secondary-700 dark:text-secondary-300">
                  {t("admin.staff.username")}
                </label>
                <input
                  id="staff-username"
                  type="text"
                  autoComplete="off"
                  required={!email.trim()}
                  minLength={3}
                  maxLength={50}
                  pattern={"[a-zA-Z0-9_][a-zA-Z0-9_.\\-]{2,49}"}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="username"
                  dir="ltr"
                  className="mt-1 w-full rounded-xl border border-secondary-200 bg-white p-2.5 text-xs text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                />
              </div>

              {/* ROLES SELECTOR */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-secondary-700 dark:text-secondary-300">
                  <span>{isAr ? "التصنيف الوظيفي والصلاحيات" : "Job Category & Permissions"}</span>
                  <button
                    type="button"
                    onClick={() => setIsCreatingRole(!isCreatingRole)}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    <Plus className="h-3 w-3" />
                    {isAr ? "إضافة دور جديد" : "Add New Role"}
                  </button>
                </label>

                {isCreatingRole && (
                  <div className="mb-3 rounded-xl border border-primary-100 bg-primary-50/50 p-3 dark:border-primary-900/50 dark:bg-primary-950/30">
                    <input
                      type="text"
                      value={newRoleTitle}
                      onChange={(e) => setNewRoleTitle(e.target.value)}
                      placeholder={isAr ? "مثال: مراجع مالي" : "e.g. Finance Auditor"}
                      className="w-full rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-xs text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-3 text-[11px]">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={newCanSendAlerts} onChange={e => setNewCanSendAlerts(e.target.checked)} className="rounded text-primary-600" />
                        {isAr ? "إرسال التنبيهات" : "Send Alerts"}
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={newCanReviewDocs} onChange={e => setNewCanReviewDocs(e.target.checked)} className="rounded text-primary-600" />
                        {isAr ? "مراجعة المستندات" : "Review Documents"}
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={newCanManageCust} onChange={e => setNewCanManageCust(e.target.checked)} className="rounded text-primary-600" />
                        {isAr ? "إدارة العملاء" : "Manage Customers"}
                      </label>
                    </div>
                    <Button type="button" onClick={handleCreateRole} disabled={creatingRoleLoading} className="mt-2.5 h-7 w-full text-[11px]">
                      {creatingRoleLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : (isAr ? "حفظ الدور" : "Save Role")}
                    </Button>
                  </div>
                )}

                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400 rtl:left-auto rtl:right-3" />
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    disabled={loadingRoles}
                    className="w-full rounded-xl border border-secondary-200 bg-white p-2.5 pl-9 text-xs font-medium text-secondary-900 focus:border-primary-500 focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pl-2.5 rtl:pr-9"
                  >
                    <option value="staff">{isAr ? "موظف عام" : "Staff"}</option>
                    <option value="operations">{isAr ? "التشغيل — شحنات وطلبات و UCR" : "Operations — Shipments, Requests & UCR"}</option>
                    <option value="accounts">{isAr ? "الحسابات — الفواتير وكشوف الحساب" : "Accounts — Invoices & Statements"}</option>
                    <option value="super_admin">{isAr ? "مدير النظام — صلاحيات كاملة" : "Administrator — Full Access"}</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                </div>

                {selectedRoleId !== "operations" && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-secondary-200/80 bg-secondary-50/70 p-3 text-xs dark:border-secondary-800 dark:bg-secondary-800/40">
                    <input
                      type="checkbox"
                      checked={selectedRoleId === "super_admin" || selectedRoleId === "accounts" || canAccessAccounts}
                      disabled={selectedRoleId === "super_admin" || selectedRoleId === "accounts"}
                      onChange={event => setCanAccessAccounts(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded text-primary-600 focus:ring-primary-500"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-secondary-900 dark:text-white">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? "الوصول إلى قسم الحسابات" : "Access Accounts Workspace"}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-secondary-500">
                        {isAr ? "إظهار كارت الحسابات والوصول لتكاليف الشحنات ومسودات الفواتير" : "Show the Accounts card and allow access to shipment billing drafts"}
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Readonly Permissions Summary */}
              <div className="rounded-xl border border-secondary-200/80 bg-secondary-50/70 p-3.5 dark:border-secondary-800 dark:bg-secondary-800/40">
                <span className="text-xs font-bold text-secondary-900 dark:text-white">
                  {isAr ? "ملخص الصلاحيات الافتراضية لهذا التصنيف" : "Default Permissions for Selected Role"}
                </span>
                <div className="mt-2 space-y-1.5 text-[11px] text-secondary-600 dark:text-secondary-400">
                  <div className="flex items-center justify-between">
                    <span>{isAr ? "إرسال التنبيهات والإشعارات" : "Send Alerts & Broadcasts"}</span>
                    {currentPermissions.canSendAlerts ? <span className="font-bold text-emerald-600">✔</span> : <span className="text-secondary-300">✖</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{isAr ? "مراجعة واعتماد المستندات" : "Review & Verify Documents"}</span>
                    {currentPermissions.canReviewDocuments ? <span className="font-bold text-emerald-600">✔</span> : <span className="text-secondary-300">✖</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{isAr ? "إدارة حسابات العملاء" : "Manage Customer Accounts"}</span>
                    {currentPermissions.canManageCustomers ? <span className="font-bold text-emerald-600">✔</span> : <span className="text-secondary-300">✖</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{isAr ? "عرض وإدارة بيانات الشحنات" : "View & Manage Shipment Data"}</span>
                    {currentPermissions.canViewShipmentData ? <span className="font-bold text-emerald-600">✔</span> : <span className="text-secondary-300">✖</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{isAr ? "الوصول إلى قسم الحسابات" : "Access Accounts Workspace"}</span>
                    {currentPermissions.canAccessAccounts ? <span className="font-bold text-emerald-600">✔</span> : <span className="text-secondary-300">✖</span>}
                  </div>
                </div>
              </div>
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
                    <span>{isAr ? "جارٍ الإنشاء..." : "Creating..."}</span>
                  </span>
                ) : (
                  <span>{isAr ? "إنشاء الحساب" : "Create Employee"}</span>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

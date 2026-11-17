"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { PortalHeader } from "@/components/portal/PortalHeader"
import {
  Building2,
  User,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Phone,
  Mail,
  FileCheck2,
  Package,
  Globe,
  FileText,
  Clock,
  Sparkles,
  Radio,
  MessageSquare,
  ExternalLink,
  ShieldAlert,
  Check,
  KeyRound,
  ArrowRight,
  AtSign,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Link } from "@/navigation"
import { usePortal } from "@/components/portal/PortalContext"
import { PasswordRequirements } from "@/components/auth/PasswordRequirements"
import { ExpiringDocumentsList, ExpiringDocumentItem } from "@/components/portal/profile/ExpiringDocumentsList"
import { ShipmentServicesSummary, OperationsStats } from "@/components/portal/profile/ShipmentServicesSummary"
import { cn } from "@/lib/utils"

export default function PortalProfilePage() {
  const t = useTranslations()
  const locale = useLocale()
  const { user: authUser, customer: authCustomer, refreshData } = usePortal()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  const [activeTab, setActiveTab] = useState<"corporate" | "security" | "compliance" | "channels">(
    tabParam === "channels" || tabParam === "security" || tabParam === "compliance" || tabParam === "corporate"
      ? (tabParam as any)
      : "corporate"
  )
  const [loading, setLoading] = useState(true)

  // Profile data initialized from authUser / authCustomer to prevent flash of empty / unverified state
  const [companyName, setCompanyName] = useState(authCustomer?.companyName || "")
  const [commercialRegisterNumber, setCommercialRegisterNumber] = useState(authCustomer?.commercialRegisterNumber || "")
  const [taxCardNumber, setTaxCardNumber] = useState(authCustomer?.taxCardNumber || "")
  const [industry, setIndustry] = useState(authCustomer?.industry || "")
  const [address, setAddress] = useState(authCustomer?.address || "")
  const [city, setCity] = useState(authCustomer?.city || "Alexandria")
  const [country, setCountry] = useState(authCustomer?.country || "Egypt")

  const [username, setUsername] = useState(authUser?.username || "")
  const [firstName, setFirstName] = useState(authUser?.firstName || "")
  const [lastName, setLastName] = useState(authUser?.lastName || "")
  const [phone, setPhone] = useState(authUser?.phone || "")
  const [email, setEmail] = useState(authUser?.email || "")
  const [emailVerified, setEmailVerified] = useState(authUser?.emailVerified ?? false)
  const [whatsappVerified, setWhatsappVerified] = useState(authUser?.whatsappVerified ?? false)

  // Keep state synced with authUser when it becomes available
  useEffect(() => {
    if (authUser) {
      if (authUser.email && !email) setEmail(authUser.email)
      if (authUser.phone && !phone) setPhone(authUser.phone)
      if (authUser.username && !username) setUsername(authUser.username)
      if (authUser.firstName && !firstName) setFirstName(authUser.firstName)
      if (authUser.lastName && !lastName) setLastName(authUser.lastName)
      if (authUser.emailVerified !== undefined) setEmailVerified(!!authUser.emailVerified)
      if (authUser.whatsappVerified !== undefined) setWhatsappVerified(!!authUser.whatsappVerified)
    }
  }, [authUser])

  useEffect(() => {
    if (authCustomer) {
      if (authCustomer.companyName && !companyName) setCompanyName(authCustomer.companyName)
      if (authCustomer.commercialRegisterNumber && !commercialRegisterNumber) setCommercialRegisterNumber(authCustomer.commercialRegisterNumber)
      if (authCustomer.taxCardNumber && !taxCardNumber) setTaxCardNumber(authCustomer.taxCardNumber)
      if (authCustomer.industry && !industry) setIndustry(authCustomer.industry)
      if (authCustomer.address && !address) setAddress(authCustomer.address)
      if (authCustomer.city && !city) setCity(authCustomer.city)
      if (authCustomer.country && !country) setCountry(authCustomer.country)
    }
  }, [authCustomer])

  const [operations, setOperations] = useState<OperationsStats>({
    totalShipments: 0,
    activeShipments: 0,
    deliveredShipments: 0,
    activeServices: [
      "Sea Freight (FCL / LCL)",
      "Air Cargo Express",
      "Customs Clearance Alexandria & Sokhna",
      "Bonded Warehousing",
    ],
  })

  const [expiringDocuments, setExpiringDocuments] = useState<ExpiringDocumentItem[]>([])

  // Password Change
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const fetchProfileData = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/portal/profile")
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setUsername(data.user.username || "")
          setFirstName(data.user.firstName || "")
          setLastName(data.user.lastName || "")
          setPhone(data.user.phone || "")
          setEmail(data.user.email || "")
          setEmailVerified(!!data.user.emailVerified)
          setWhatsappVerified(!!data.user.whatsappVerified)
        }
        if (data.customer) {
          setCompanyName(data.customer.companyName || "")
          setCommercialRegisterNumber(data.customer.commercialRegisterNumber || "")
          setTaxCardNumber(data.customer.taxCardNumber || "")
          setIndustry(data.customer.industry || "")
          setAddress(data.customer.address || "")
          setCity(data.customer.city || "Alexandria")
          setCountry(data.customer.country || "Egypt")
        }
        if (data.operations) {
          setOperations(data.operations)
        }
        if (data.expiringDocuments) {
          setExpiringDocuments(data.expiringDocuments)
        }
      }
    } catch {
      // offline / error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfileData()
  }, [])

  useEffect(() => {
    if (tabParam && (tabParam === "channels" || tabParam === "security" || tabParam === "compliance" || tabParam === "corporate")) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  // Effective verified flags combine local state and authUser to eliminate flashes during initial network fetch
  const effectiveEmailVerified = emailVerified || !!authUser?.emailVerified
  const effectiveWhatsappVerified = whatsappVerified || !!authUser?.whatsappVerified
  const effectiveEmail = email || authUser?.email || ""
  const effectivePhone = phone || authUser?.phone || ""
  const isChannelsLoading = loading && !authUser

  const hasAnyVerifiedChannel = effectiveEmailVerified || effectiveWhatsappVerified
  const showChannelsAlert = !isChannelsLoading && !hasAnyVerifiedChannel

  const handleSaveCorporateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSuccess(null)
    setProfileError(null)

    try {
      const res = await fetch("/api/portal/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username ? username.trim() : undefined,
          firstName,
          lastName,
          phone,
          companyName,
          address,
          city,
          country,
          industry,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setProfileSuccess(
          locale === "ar"
            ? "تم حفظ وتحديث بيانات الملف المؤسسي بنجاح!"
            : "Corporate profile updated successfully!"
        )
        refreshData()
      } else {
        setProfileError(data.error || "Failed to update profile.")
      }
    } catch {
      setProfileError("Network error while updating profile.")
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordSuccess(null)
    setPasswordError(null)

    if (newPassword !== confirmPassword) {
      setPasswordError(
        locale === "ar" ? "كلمتا المرور غير متطابقتين" : "New passwords do not match"
      )
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await res.json()
      if (res.ok) {
        setPasswordSuccess(
          locale === "ar"
            ? "تم تغيير كلمة المرور بنجاح!"
            : "Password updated successfully!"
        )
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        setPasswordError(data.error || "Failed to change password.")
      }
    } catch {
      setPasswordError("Network error while changing password.")
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PortalHeader
        title={locale === "ar" ? "الملف المؤسسي والامتثال" : "Corporate Profile & Operations"}
        subtitle={
          locale === "ar"
            ? "إدارة البيانات القانونية، الشحنات، إعدادات الأمان، ومتابعة تواريخ انتهاء المستندات"
            : "Manage legal entity data, shipping operations, security credentials, and document compliance"
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Top Operations KPIs & Services Summary */}
        <ShipmentServicesSummary operations={operations} />

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-secondary-200/80 pb-3 dark:border-secondary-800">
          <button
            onClick={() => {
              setActiveTab("corporate")
              setProfileSuccess(null)
              setProfileError(null)
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all",
              activeTab === "corporate"
                ? "bg-primary-600 text-white shadow-md shadow-primary-500/20"
                : "text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-800"
            )}
          >
            <Building2 className="h-4 w-4" />
            <span>{locale === "ar" ? "بيانات الشركة والكيان القانوني" : "Corporate Legal Info"}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("channels")
              setProfileSuccess(null)
              setProfileError(null)
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all relative",
              activeTab === "channels"
                ? "bg-primary-600 text-white shadow-md shadow-primary-500/20"
                : "text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-800"
            )}
          >
            <Radio className="h-4 w-4" />
            <span>{t("portal.sidebar.channels") || (locale === "ar" ? "قنوات الاتصال" : "Communication Channels")}</span>
            {showChannelsAlert && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white animate-pulse">
                !
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("security")
              setPasswordSuccess(null)
              setPasswordError(null)
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all",
              activeTab === "security"
                ? "bg-primary-600 text-white shadow-md shadow-primary-500/20"
                : "text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-800"
            )}
          >
            <KeyRound className="h-4 w-4" />
            <span>{locale === "ar" ? "إعدادات الأمان وكلمة المرور" : "Security & Credentials"}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("compliance")
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all",
              activeTab === "compliance"
                ? "bg-primary-600 text-white shadow-md shadow-primary-500/20"
                : "text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-800"
            )}
          >
            <FileCheck2 className="h-4 w-4" />
            <span>
              {locale === "ar"
                ? "متابعة انتهاء المستندات والامتثال"
                : "Document Compliance & Expirations"}
            </span>
            {expiringDocuments.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {expiringDocuments.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Corporate Legal Info Form */}
        {activeTab === "corporate" && (
          <div className="space-y-6">
            {profileSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{profileSuccess}</span>
              </div>
            )}

            {profileError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-50 p-4 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{profileError}</span>
              </div>
            )}

            <form
              onSubmit={handleSaveCorporateProfile}
              className="rounded-2xl border border-secondary-200/80 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900"
            >
              <div className="mb-6 flex items-center justify-between border-b border-secondary-100 pb-4 dark:border-secondary-800">
                <div>
                  <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                    {locale === "ar" ? "بيانات السجل التجاري والضرائب" : "Official Commercial Registry & Tax Data"}
                  </h3>
                  <p className="mt-0.5 text-xs text-secondary-500 dark:text-secondary-400">
                    {locale === "ar"
                      ? "المعلومات القانونية المعتمدة لدى مصلحة الجمارك والموانئ المصرية"
                      : "Verified corporate identity registered with Egyptian maritime authorities"}
                  </p>
                </div>
                <span className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {locale === "ar" ? "حساب معتمد" : "Verified Entity"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "اسم الشركة التجاري *" : "Company Legal Name *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "رقم السجل التجاري (مغلق)" : "Commercial Register No. (Locked)"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={commercialRegisterNumber || "—"}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-100/60 p-2.5 text-xs font-semibold text-secondary-500 dark:border-secondary-800 dark:bg-secondary-800/40"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "رقم البطاقة الضريبية (مغلق)" : "Tax Card No. (Locked)"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={taxCardNumber || "—"}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-100/60 p-2.5 text-xs font-semibold text-secondary-500 dark:border-secondary-800 dark:bg-secondary-800/40"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "قطاع النشاط والصناعة" : "Industry & Sector"}
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Export & Import, Manufacturing"
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "المدينة / المحافظة" : "City / Governorate"}
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "العنوان المسجل للشركة" : "Registered Office / Facility Address"}
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 14 El-Horreya Avenue, Alexandria"
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  type="submit"
                  disabled={savingProfile}
                  className="rounded-xl bg-primary-600 px-5 text-xs font-bold text-white shadow hover:bg-primary-700"
                >
                  {savingProfile ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{locale === "ar" ? "جاري الحفظ..." : "Saving..."}</span>
                    </span>
                  ) : (
                    <span>{locale === "ar" ? "حفظ التعديلات المؤسسية" : "Save Company Changes"}</span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Communication Channels */}
        {activeTab === "channels" && (
          <div className="space-y-6">
            {/* Status Summary Banner */}
            {isChannelsLoading ? (
              <div className="h-20 animate-pulse rounded-2xl bg-secondary-100 dark:bg-secondary-800/50" />
            ) : effectiveEmailVerified && effectiveWhatsappVerified ? (
              <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-50/80 p-5 text-emerald-900 shadow-sm dark:bg-emerald-950/30 dark:text-emerald-200">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {locale === "ar" ? "كافة قنوات الاتصال موثقة ونشطة بالكامل" : "All Communication Channels Verified & Active"}
                  </h4>
                  <p className="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/80">
                    {locale === "ar"
                      ? "حسابك متصل وجاهز لاستلام تنبيهات الشحن، الفواتير، ومستجدات التخليص الجمركي الفورية."
                      : "Your company account is fully connected to receive freight tracking alerts, invoice receipts, and real-time customs updates."}
                  </p>
                </div>
              </div>
            ) : hasAnyVerifiedChannel ? (
              <div className="flex items-center gap-3.5 rounded-2xl border border-sky-500/30 bg-sky-50/80 p-5 text-sky-900 shadow-sm dark:bg-sky-950/30 dark:text-sky-200">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {locale === "ar" ? "قناة اتصال واحدة على الأقل موثقة" : "At Least One Channel Verified & Active"}
                  </h4>
                  <p className="mt-0.5 text-xs text-sky-700/90 dark:text-sky-300/80">
                    {locale === "ar"
                      ? "يمكنك توثيق القناة المتبقية لضمان استلام كافة الإشعارات الهامة والرسائل الفورية عبر القناتين معاً."
                      : "You have verified a communication channel. You can optionally verify the remaining channel to receive multi-channel alerts."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3.5 rounded-2xl border border-amber-500/30 bg-amber-50/90 p-5 text-amber-900 shadow-sm dark:bg-amber-950/40 dark:text-amber-200">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {locale === "ar" ? "تنبيه: لا توجد أي قناة اتصال موثقة حالياً" : "Action Required: No Verified Channels"}
                  </h4>
                  <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/80">
                    {locale === "ar"
                      ? "يرجى توثيق البريد الإلكتروني أو رقم الواتساب لتفعيل حسابك وتلقي عروض الأسعار وتحديثات الشحنات."
                      : "Please verify your email or WhatsApp number to unlock operational features and receive critical logistics updates."}
                  </p>
                </div>
              </div>
            )}

            {/* Channels Grid */}
            {isChannelsLoading ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="h-56 animate-pulse rounded-2xl bg-secondary-100 dark:bg-secondary-800/50" />
                <div className="h-56 animate-pulse rounded-2xl bg-secondary-100 dark:bg-secondary-800/50" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Channel 1: Corporate Work Email */}
                <div className="flex flex-col justify-between rounded-2xl border border-secondary-200/80 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900 transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400 shadow-sm">
                          <Mail className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-secondary-900 dark:text-white">
                            {t("portal.channels.email") || (locale === "ar" ? "البريد الإلكتروني للعمل" : "Corporate Work Email")}
                          </h4>
                          <p className="text-xs font-mono font-semibold text-secondary-600 dark:text-secondary-300 mt-0.5">
                            {effectiveEmail || "—"}
                          </p>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold border",
                          effectiveEmailVerified
                            ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                        )}
                      >
                        {effectiveEmailVerified ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{t("portal.channels.verified") || (locale === "ar" ? "موثق" : "Verified")}</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                            <span>{t("portal.channels.notVerified") || (locale === "ar" ? "غير موثق" : "Not Verified")}</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="mt-4 text-xs text-secondary-500 dark:text-secondary-400 leading-relaxed">
                      {locale === "ar"
                        ? "يُستخدم لاستلام الفواتير الرسمية، عروض الأسعار المعتمدة، وتنبيهات الأمان وإشعارات تسجيل الدخول."
                        : "Used for official quotation approvals, tax invoice receipts, document audit trails, and secure login alerts."}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-secondary-100 dark:border-secondary-800 flex items-center justify-between">
                    <span className="text-[11px] text-secondary-400 font-medium">
                      {effectiveEmailVerified ? (locale === "ar" ? "القناة نشطة وجاهزة" : "Channel active") : (locale === "ar" ? "يتطلب تأكيد الرابط" : "Requires verification link")}
                    </span>

                    {effectiveEmailVerified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <Check className="h-4 w-4" />
                        <span>{locale === "ar" ? "تم التحقق بنجاح" : "Verified"}</span>
                      </span>
                    ) : (
                      <Link href="/portal/verification">
                        <Button
                          size="sm"
                          className="rounded-xl bg-primary-600 text-xs font-bold text-white shadow hover:bg-primary-700"
                        >
                          <span>{t("portal.channels.verifyNow") || (locale === "ar" ? "توثيق البريد الآن" : "Verify Email Now")}</span>
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5 rtl:mr-1.5 rtl:ml-0 rtl:rotate-180" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Channel 2: WhatsApp Business Notifications */}
                <div className="flex flex-col justify-between rounded-2xl border border-secondary-200/80 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900 transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 shadow-sm">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-secondary-900 dark:text-white">
                            {t("portal.channels.whatsapp") || (locale === "ar" ? "واتساب للأعمال (WhatsApp)" : "WhatsApp Business Notifications")}
                          </h4>
                          <p className="text-xs font-mono font-semibold text-secondary-600 dark:text-secondary-300 mt-0.5">
                            {effectivePhone || "—"}
                          </p>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold border",
                          effectiveWhatsappVerified
                            ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "border-secondary-200 bg-secondary-50 text-secondary-600 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-400"
                        )}
                      >
                        {effectiveWhatsappVerified ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{t("portal.channels.verified") || (locale === "ar" ? "موثق" : "Verified")}</span>
                          </>
                        ) : (
                          <>
                            <Phone className="h-3.5 w-3.5 text-secondary-400" />
                            <span>{t("portal.channels.notVerified") || (locale === "ar" ? "غير موثق" : "Not Verified")}</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="mt-4 text-xs text-secondary-500 dark:text-secondary-400 leading-relaxed">
                      {locale === "ar"
                        ? "يُستخدم لإرسال تنبيهات وصول الحاويات، تحديثات الإفراج الجمركي اللحظية، وإشعارات الشحن السريعة."
                        : "Used for live container tracking alerts, customs milestone notifications, and direct logistics communications."}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-secondary-100 dark:border-secondary-800 flex items-center justify-between">
                    <span className="text-[11px] text-secondary-400 font-medium">
                      {effectiveWhatsappVerified ? (locale === "ar" ? "القناة نشطة وجاهزة" : "Channel active") : (locale === "ar" ? "يتطلب تأكيد رقم الهاتف" : "Requires WhatsApp confirmation")}
                    </span>

                    {effectiveWhatsappVerified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <Check className="h-4 w-4" />
                        <span>{locale === "ar" ? "تم التحقق بنجاح" : "Verified"}</span>
                      </span>
                    ) : (
                      <Link href="/portal/verification?channel=whatsapp#whatsapp-verification">
                        <Button
                          size="sm"
                          className="rounded-xl bg-emerald-600 text-xs font-bold text-white shadow hover:bg-emerald-700"
                        >
                          <span>{t("portal.channels.verifyNow") || (locale === "ar" ? "توثيق الواتساب الآن" : "Verify WhatsApp Now")}</span>
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5 rtl:mr-1.5 rtl:ml-0 rtl:rotate-180" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Security, Username & Password Management */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Account Manager & Username Box */}
            <form
              onSubmit={handleSaveCorporateProfile}
              className="rounded-2xl border border-secondary-200/80 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900"
            >
              <div className="mb-5 border-b border-secondary-100 pb-3 dark:border-secondary-800">
                <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                  {locale === "ar" ? "اسم المستخدم والمسؤول المعتمد" : "Authorized Manager & Username"}
                </h3>
                <p className="mt-0.5 text-xs text-secondary-500 dark:text-secondary-400">
                  {locale === "ar"
                    ? "اسم المستخدم المعتمد لتسجيل الدخول ومعلومات الاتصال"
                    : "Login username identifier and primary authorized contact"}
                </p>
              </div>

              <div className="space-y-4">
                {/* Username Input */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "اسم المستخدم (Username) *" : "Login Username *"}
                  </label>
                  <div className="relative">
                    <AtSign className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-secondary-400 rtl:right-3 rtl:left-auto" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. mohamed_alex"
                      className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 py-2.5 pr-4 pl-9 text-xs font-bold text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white rtl:pr-9 rtl:pl-4"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-secondary-500">
                    {locale === "ar"
                      ? "يمكنك استخدامه لتسجيل الدخول بدلاً من البريد الإلكتروني"
                      : "Can be used to sign in instead of your business email"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                      {locale === "ar" ? "الاسم الأول" : "First Name"}
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                      {locale === "ar" ? "اسم العائلة" : "Last Name"}
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "بريد العمل (مغلق)" : "Business Email (Verified)"}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      disabled
                      value={email}
                      className="w-full rounded-xl border border-secondary-200 bg-secondary-100/60 p-2.5 text-xs font-semibold text-secondary-500 dark:border-secondary-800 dark:bg-secondary-800/40"
                    />
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold",
                        emailVerified
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      )}
                    >
                      {emailVerified ? "Verified" : "Pending"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "رقم الهاتف / WhatsApp" : "Mobile Phone / WhatsApp"}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                    />
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold",
                        whatsappVerified
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      )}
                    >
                      {whatsappVerified ? "Verified" : "Pending"}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full rounded-xl bg-primary-600 text-xs font-bold text-white shadow hover:bg-primary-700"
                  >
                    {savingProfile ? "Saving..." : locale === "ar" ? "حفظ اسم المستخدم والبيانات" : "Save Username & Contact"}
                  </Button>
                </div>
              </div>
            </form>

            {/* Password Change Box with PasswordRequirements Component */}
            <form id="password"
              onSubmit={handleChangePassword}
              className="rounded-2xl border border-secondary-200/80 bg-white p-6 shadow-sm dark:border-secondary-800 dark:bg-secondary-900"
            >
              <div className="mb-5 border-b border-secondary-100 pb-3 dark:border-secondary-800">
                <h3 className="text-sm font-bold text-secondary-900 dark:text-white">
                  {locale === "ar" ? "تحديث كلمة المرور" : "Change Password"}
                </h3>
                <p className="mt-0.5 text-xs text-secondary-500 dark:text-secondary-400">
                  {locale === "ar"
                    ? "اختر كلمة مرور قوية لحماية حساب الشحن والتخليص الجمركي"
                    : "Set a secure password adhering to enterprise compliance rules"}
                </p>
              </div>

              {passwordSuccess && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "كلمة المرور الحالية *" : "Current Password *"}
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "كلمة المرور الجديدة *" : "New Password *"}
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>

                {/* Real-Time Password Complexity Checklist */}
                {newPassword && (
                  <div className="rounded-xl border border-secondary-200/80 bg-secondary-50/50 p-3.5 dark:border-secondary-800 dark:bg-secondary-800/40">
                    <PasswordRequirements password={newPassword} />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-secondary-700 dark:text-secondary-300">
                    {locale === "ar" ? "تأكيد كلمة المرور الجديدة *" : "Confirm New Password *"}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-secondary-200 bg-secondary-50/50 p-2.5 text-xs font-medium text-secondary-900 transition-all focus:border-primary-500 focus:bg-white focus:outline-none dark:border-secondary-700 dark:bg-secondary-800 dark:text-white"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingPassword}
                    className="w-full rounded-xl bg-primary-600 text-xs font-bold text-white shadow hover:bg-primary-700"
                  >
                    {savingPassword ? "Updating..." : locale === "ar" ? "تحديث كلمة المرور" : "Update Password"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Document Compliance & Sorted Expiring Documents Queue */}
        {activeTab === "compliance" && (
          <div className="space-y-6">
            <ExpiringDocumentsList documents={expiringDocuments} loading={loading} />
          </div>
        )}
      </div>
    </div>
  )
}

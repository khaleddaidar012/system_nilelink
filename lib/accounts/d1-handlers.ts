import { NextResponse } from "next/server"
import type { D1Binding } from "../db/d1"
import { D1AccountsRepository, AccountConflictError, newAccountId } from "../db/repositories/accounts"
import type { AccountCustomer } from "../db/repositories/accounts"
import { D1UsersRepository } from "../db/repositories/users"
import type { StoredUser, VersionedUser } from "../db/repositories/users"
import type { UserTokenData } from "../auth/token-service"
import {
  getSessionFromRequest, createAccessToken, createRefreshToken, setAuthCookies,
  verifyAuthToken, REFRESH_COOKIE_NAME, clearAuthCookies,
} from "../auth/token-service"
import { hashPassword, verifyPassword, generateSecureToken } from "../auth/password"
import { manualWhatsappCode } from "../auth/manual-whatsapp-code"
import { checkRateLimit, resetRateLimit } from "../auth/rate-limiter"
import { dispatchOtpNotification, generateNumericOtp } from "../auth/otp-service"
import type { SendOtpOptions, DispatchResult } from "../auth/otp-service"
import { liveEmailConfigured } from "../email/readiness"
import { sendEmailWithReceipt } from "../email/send"
import { taxReferenceKey } from "../references/tax-reference"

type Action = "login" | "register" | "refresh" | "me" | "verification-status" | "change-password"
  | "forgot-password" | "reset-password" | "verify-email" | "send-otp" | "verify-otp" | "update-contact"
  | "password-reset-request" | "password-reset-confirm" | "profile-get" | "profile-put"
  | "staff-list" | "staff-create" | "staff-update" | "staff-suspend" | "roles-list" | "roles-create"
  | "customers-list" | "customers-search" | "customer-get" | "customer-delete" | "customer-status"

/** Inputs have already passed the existing route's Zod validation and rate limiter. */
export interface D1AccountAction {
  action: Action
  request: Request
  input?: Record<string, any>
  id?: string
}
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message) }
const json = (value: unknown, status = 200) => NextResponse.json(value, { status })
const staffRole = (user: StoredUser) => user.role === "staff" || user.role === "super_admin"
const active = (user: StoredUser) => user.status === "active" || user.status === "pending_verification"
const defaults = {
  canSendAlerts: true, canReviewDocuments: true, canManageCustomers: false,
  issueTaxInvoice: false, createInvoice: true, editInvoice: true,
  viewCustomerStatements: true, exportCustomerStatements: true,
  sendFinancialDocuments: false, canManageBackups: false, canUseTieredPricing:false,
}

function createUser(fields: Partial<StoredUser> & Pick<StoredUser, "email" | "firstName" | "lastName" | "passwordHash" | "role">): StoredUser {
  const now = new Date().toISOString()
  return {
    _id: newAccountId(), status: "active", customerId: null, avatarUrl: null, hasCompletedOnboarding: false,
    emailVerified: false, whatsappVerified: false,
    emailVerificationToken: null, emailVerificationExpires: null,
    emailVerificationOtp: null, emailVerificationOtpExpires: null,
    whatsappVerificationCode: null, whatsappVerificationExpires: null,
    passwordResetToken: null, passwordResetExpires: null,
    passwordResetOtp: null, passwordResetOtpExpires: null, passwordResetChannel: null,
    lastLoginAt: null, createdAt: now, updatedAt: now, __v: 0,
    ...fields, email: fields.email.toLowerCase().trim(),
    firstName: fields.firstName.trim(), lastName: fields.lastName.trim(),
    staffPermissions: { ...defaults, ...fields.staffPermissions },
  }
}

function userView(user: StoredUser) {
  return {
    id: user._id, email: user.email, username: user.username, role: user.role,
    firstName: user.firstName, lastName: user.lastName, phone: user.phone,
    avatarUrl: user.avatarUrl, hasCompletedOnboarding: user.hasCompletedOnboarding, status: user.status, staffPermissions: user.staffPermissions,
    emailVerified: !!user.emailVerified, whatsappVerified: !!user.whatsappVerified,
  }
}
function customerView(customer: AccountCustomer, admin = false) {
  return { id: customer._id, ...selectFields(customer, ["customerCode", "companyName", "commercialRegisterNumber", "taxCardNumber", "contactEmail", "contactPhone", "accountStatus", "statusReason", "industry", "country", "city", "address", "maxAllowedDocuments", "createdAt", "updatedAt", ...(admin ? ["notes"] : [])]) }
}
function claims(user: StoredUser, customer?: AccountCustomer | null): UserTokenData {
  return {
    userId: user._id, email: user.email, role: user.role, customerId: user.customerId ?? null,
    accountStatus: customer?.accountStatus, firstName: user.firstName, lastName: user.lastName,
    phone: user.phone, staffPermissions: user.staffPermissions,
    emailVerified: !!user.emailVerified, whatsappVerified: !!user.whatsappVerified,
  }
}
async function withCookies(response: NextResponse, user: StoredUser, customer?: AccountCustomer | null, rememberMe = true) {
  const payload = claims(user, customer)
  setAuthCookies(response, await createAccessToken(payload), await createRefreshToken(payload), rememberMe)
  return response
}
function selectFields(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]))
}
function regexSearch(pattern: string): RegExp {
  try { return new RegExp(pattern, "i") } catch { return fail(400, "Invalid search expression") }
}

/** Database-injected entry point used by both route dispatch and real D1 tests. */
export function createD1AccountsHandler(db: D1Binding, options: { sendOtp?: (input: SendOtpOptions) => Promise<DispatchResult> } = {}) {
  const repository = new D1AccountsRepository(db)
  const users = new D1UsersRepository(db)
  const sendOtp = options.sendOtp ?? dispatchOtpNotification

  async function current(request: Request, password = false): Promise<VersionedUser> {
    const session = await getSessionFromRequest(request)
    if (!session || session.tokenType !== "access") return fail(401, "Unauthorized")
    const loaded = await repository.findUser("id", session.userId, password)
    if (!loaded || !active(loaded.user)) return fail(401, "User account unavailable")
    return loaded
  }

  async function customerFor(user: StoredUser) {
    if (!user.customerId) return null
    const customer = await repository.findCustomer(user.customerId)
    if (!customer) return fail(409, "Customer relationship requires migration review")
    return customer
  }

  async function issueOtp(loaded: VersionedUser, channel: "email" | "whatsapp", purpose: "account_verification" | "password_reset") {
    if (channel !== "email" && channel !== "whatsapp") return fail(400, "Invalid verification channel")
    if (channel === "whatsapp" && purpose === "account_verification") {
      if (!manualWhatsappCode(loaded.user.phone || "")) return fail(400, "A valid registered phone number is required")
      return { success: true, channel, manual: true, expiresInSeconds: 0 }
    }
    const code = generateNumericOtp(6)
    const expires = new Date(Date.now() + 600_000).toISOString()
    const recipient = channel === "email" ? loaded.user.email : loaded.user.phone || ""
    if (!recipient) return fail(400, "Verification recipient is missing")
    const patch = purpose === "password_reset"
      ? { passwordResetOtp: code, passwordResetOtpExpires: expires, passwordResetChannel: channel }
      : channel === "email" ? { emailVerificationOtp: code, emailVerificationOtpExpires: expires }
        : { whatsappVerificationCode: code, whatsappVerificationExpires: expires }
    await repository.patchUser(loaded, patch)
    const result = await sendOtp({ to: recipient, channel, code, purpose, recipientName: `${loaded.user.firstName} ${loaded.user.lastName}` })
    if (!result.success) return fail(502, "Failed to dispatch verification code")
    return { success: true, channel, previewCode: result.previewCode, expiresInSeconds: 600 }
  }

  function verifyCode(loaded: VersionedUser, channel: "email" | "whatsapp", code: string, reset = false) {
    const user = loaded.user
    if (channel !== "email" && channel !== "whatsapp") return fail(400, "Invalid verification channel")
    if (!reset && channel === "whatsapp") {
      const expected = manualWhatsappCode(user.phone || "")
      if (!expected || !/^\d{6}$/.test(code.trim()) || expected !== code.trim()) return fail(400, "Invalid verification code")
      return
    }
    const expected = reset ? user.passwordResetOtp : channel === "email" ? user.emailVerificationOtp : user.whatsappVerificationCode
    const expires = reset ? user.passwordResetOtpExpires : channel === "email" ? user.emailVerificationOtpExpires : user.whatsappVerificationExpires
    if ((reset && user.passwordResetChannel !== channel) || !expected || expected !== code.trim()
      || !expires || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now()) {
      return fail(400, "Invalid or expired verification code")
    }
  }

  return async ({ action, request, input = {}, id }: D1AccountAction): Promise<NextResponse> => {
    const repository = new D1AccountsRepository(db)
    try {
      if (action === "login") {
        const loaded = await users.findForIdentifier(input.identifier)
        if (!loaded || !await verifyPassword(input.password, loaded.user.passwordHash || "")) return fail(401, "Invalid email/username or password")
        if (!active(loaded.user)) return fail(403, "User account unavailable")
        const customer = await customerFor(loaded.user)
        repository.activity = { user: loaded.user, action }
        await repository.patchUser(loaded, { lastLoginAt: new Date().toISOString() })
        resetRateLimit(`login:${request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"}`)
        return withCookies(json({ success: true, message: "Login successful", user: {
          ...userView(loaded.user), customerId: loaded.user.customerId ?? null,
          companyName: customer?.value.companyName, accountStatus: customer?.value.accountStatus, statusReason: customer?.value.statusReason,
        } }), loaded.user, customer?.value, input.rememberMe ?? true)
      }

      if (action === "register") {
        if (!taxReferenceKey(input.taxCardNumber)) return fail(400, "Tax number is required")
        if (await repository.customerByTaxNumber(input.taxCardNumber)) return fail(409, "A company with this Tax Number is already registered")
        if (input.username && await repository.findUser("username", input.username)) return fail(409, "Username is already taken")
        if (await repository.findUser("email", input.email)) return fail(409, "An account with this email address already exists")
        if (await repository.customerByRegistration(input.commercialRegisterNumber)) return fail(409, "A company with this Commercial Registration Number is already registered")
        const now = new Date().toISOString()
        const customer: AccountCustomer = {
          _id: newAccountId(), ...selectFields(input, ["companyName", "commercialRegisterNumber", "taxCardNumber", "industry", "country", "city"]) as Pick<AccountCustomer, "companyName" | "commercialRegisterNumber" | "taxCardNumber">,
          contactPhone: input.phone, contactEmail: input.email,
          accountStatus: "unverified", statusReason: "Account is not verified yet. Please upload required documents to begin verification.",
          industry: input.industry ?? "Logistics & Trade", country: input.country ?? "Egypt", city: input.city ?? "Cairo",
          address: "", notes: "", assignedStaffId: null, maxAllowedDocuments: 20, createdAt: now, updatedAt: now, __v: 0,
        }
        const user = createUser({
          email: input.email, firstName: input.firstName, lastName: input.lastName,
          ...(input.username ? { username: input.username.toLowerCase().trim() } : {}),
          phone: input.phone, passwordHash: await hashPassword(input.password), role: "customer_admin", customerId: customer._id,
          emailVerificationToken: generateSecureToken(32), emailVerificationExpires: new Date(Date.now() + 86400000).toISOString(),
        })
        repository.activity = { user, action }
        await repository.register(customer, user)
        let verificationEmailSent = false
        if (liveEmailConfigured()) {
          const link = `${process.env.NEXT_PUBLIC_APP_URL}/ar/verify-email?token=${encodeURIComponent(user.emailVerificationToken as string)}`
          try { await sendEmailWithReceipt({ to: user.email, subject: "NileLink — Verify your email", html: `<p>Welcome to NileLink.</p><p><a href="${link}">Verify your email address</a></p>`, idempotencyKey: `nilelink-register-${user._id}` }); verificationEmailSent = true } catch { /* Account is created; the user can request a fresh verification code. */ }
        }
        return withCookies(json({ success: true, message: "Account registered successfully", user: {
          ...userView(user), customerId: customer._id, companyName: customer.companyName, accountStatus: customer.accountStatus,
        }, verificationEmailSent }, 201), user, customer)
      }

      if (action === "refresh") {
        const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${REFRESH_COOKIE_NAME}=`))?.slice(REFRESH_COOKIE_NAME.length + 1)
        const payload = cookie ? await verifyAuthToken(cookie) : null
        const loaded = payload?.tokenType === "refresh" ? await repository.findUser("id", payload.userId) : null
        if (!loaded || !active(loaded.user)) {
          const response = json({ error: "User account unavailable" }, 401)
          clearAuthCookies(response)
          return response
        }
        const customer = await customerFor(loaded.user)
        return withCookies(json({ success: true, user: { ...userView(loaded.user), customerId: loaded.user.customerId ?? null, accountStatus: customer?.value.accountStatus } }), loaded.user, customer?.value)
      }

      if (action === "forgot-password") {
        const loaded = await repository.findUser("email", input.email)
        if (loaded) {
          const token = generateSecureToken(32)
          await repository.patchUser(loaded, { passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 3600000).toISOString() })
          if (liveEmailConfigured()) {
            const link = `${process.env.NEXT_PUBLIC_APP_URL}/ar/reset-password?token=${encodeURIComponent(token)}`
            try { await sendEmailWithReceipt({ to: loaded.user.email, subject: "NileLink — Reset your password", html: `<p>A password reset was requested for your account.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in one hour. Ignore this email if you did not request it.</p>` }) }
            catch { return fail(502, "Password reset email could not be sent. Try again later.") }
          }
        }
        return json({ success: true, message: "If an account with that email exists, password reset instructions have been sent." })
      }

      if (action === "reset-password" || action === "verify-email") {
        const loaded = await repository.findUserByToken(action === "reset-password" ? "passwordReset" : "emailVerification", input.token)
        if (!loaded) return fail(400, "Invalid or expired verification link")
        const patch = action === "reset-password"
          ? { passwordHash: await hashPassword(input.newPassword), passwordResetToken: undefined, passwordResetExpires: undefined, passwordResetOtp: undefined, passwordResetOtpExpires: undefined, passwordResetChannel: undefined }
          : { emailVerified: true, emailVerificationToken: undefined, emailVerificationExpires: undefined, ...(loaded.user.status === "pending_verification" ? { status: "active" } : {}) }
        await repository.patchUser(loaded, patch)
        if (action === "verify-email") {
          const session = await getSessionFromRequest(request)
          if (session?.tokenType === "access" && session.userId === loaded.user._id) {
            Object.assign(loaded.user, patch)
            const customer = await customerFor(loaded.user)
            return withCookies(json({ success: true, message: "Email verified successfully" }), loaded.user, customer?.value)
          }
        }
        return json({ success: true, message: action === "reset-password" ? "Your password has been successfully reset. You can now login." : "Email verified successfully" })
      }

      if (action === "password-reset-request" || action === "password-reset-confirm") {
        const limit = checkRateLimit(`d1-password-reset:${action}:${request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"}`, { windowMs: 900_000, maxAttempts: 10 })
        if (!limit.allowed) return fail(429, "Too many reset attempts. Please try again later.")
        const loaded = await repository.findResetUser(input.identifier, input.channel)
        if (action === "password-reset-request") {
          if (!loaded) return json({ success: true, channel: input.channel, message: "If an account matches, a 6-digit reset code has been sent.", expiresInSeconds: 600 })
          return json({ ...await issueOtp(loaded, input.channel, "password_reset"), message: "Password reset code sent" })
        }
        if (!loaded) return fail(400, "Invalid or expired verification code")
        verifyCode(loaded, input.channel, input.code, true)
        await repository.patchUser(loaded, { passwordHash: await hashPassword(input.newPassword), passwordResetOtp: undefined, passwordResetOtpExpires: undefined, passwordResetChannel: undefined, passwordResetToken: undefined, passwordResetExpires: undefined })
        return json({ success: true, message: "Password has been successfully reset. You can now log in with your new password." })
      }

      const loaded = await current(request, action === "change-password")
      const user = loaded.user
      repository.activity = { user, action }

      if (action === "change-password") {
        if (!await verifyPassword(input.currentPassword, user.passwordHash || "")) return fail(400, "Current password is incorrect")
        await repository.patchUser(loaded, { passwordHash: await hashPassword(input.newPassword) })
        return json({ success: true, message: "Password changed successfully" })
      }

      if (action === "verification-status") {
        return json({ success: true, email: user.email, phone: user.phone || "", emailVerified: !!user.emailVerified, whatsappVerified: !!user.whatsappVerified, firstName: user.firstName, lastName: user.lastName })
      }
      if (action === "send-otp") return json({ ...await issueOtp(loaded, input.channel, "account_verification"), message: "Verification code dispatched" })
      if (action === "verify-otp") {
        const limit = checkRateLimit(`d1-verify-otp:${user._id}`, { windowMs: 600_000, maxAttempts: 10 })
        if (!limit.allowed) return fail(429, "Too many verification attempts")
        verifyCode(loaded, input.channel, input.code)
        const patch = input.channel === "email" ? { emailVerified: true, emailVerificationOtp: undefined, emailVerificationOtpExpires: undefined }
          : { whatsappVerified: true, whatsappVerificationCode: undefined, whatsappVerificationExpires: undefined }
        await repository.patchUser(loaded, patch)
        Object.assign(user, patch)
        const customer = await customerFor(user)
        return withCookies(json({ success: true, channel: input.channel, message: `${input.channel === "email" ? "Business Email" : "WhatsApp"} verified successfully!`, emailVerified: user.emailVerified, whatsappVerified: user.whatsappVerified, allVerified: !!user.emailVerified, isFullyVerified: !!user.emailVerified }), user, customer?.value)
      }

      if (action === "update-contact") {
        const customer = await customerFor(user)
        const code = generateNumericOtp(6)
        const expires = new Date(Date.now() + 600000).toISOString()
        const email = String(input.newValue).trim().toLowerCase()
        if (input.channel === "email") {
          const { z } = await import("zod")
          if (!z.email().safeParse(email).success) return fail(400, "Please enter a valid email address.")
          const existing = await repository.findUser("email", email)
          if (existing && existing.user._id !== user._id) return fail(409, "This email address is already registered by another corporate account.")
        } else if (String(input.newValue).length < 8) return fail(400, "Please provide a valid phone / WhatsApp number with country code.")
        const patch = input.channel === "email"
          ? { email, emailVerified: false, emailVerificationOtp: code, emailVerificationOtpExpires: expires, emailVerificationToken: undefined, emailVerificationExpires: undefined, passwordResetToken: undefined, passwordResetExpires: undefined }
          : { phone: input.newValue, whatsappVerified: false, whatsappVerificationCode: code, whatsappVerificationExpires: expires }
        await repository.updateProfile(loaded, patch, customer ?? undefined, input.channel === "email" ? { contactEmail: email } : { contactPhone: input.newValue })
        Object.assign(user, patch)
        const result = await sendOtp({ to: input.channel === "email" ? email : input.newValue, channel: input.channel, code, purpose: "account_verification", recipientName: `${user.firstName} ${user.lastName}` })
        if (!result.success) return fail(502, "Contact updated; verification delivery failed. Request a new code.")
        return withCookies(json({ success: true, channel: input.channel, newValue: input.channel === "email" ? email : user.phone, message: "Contact updated successfully. Fresh verification code sent.", previewCode: result.previewCode, expiresInSeconds: 600 }), user, customer?.value)
      }

      if (action === "me" || action === "profile-get" || action === "profile-put") {
        const customer = await customerFor(user)
        if (!customer && (user.role === "customer" || user.role === "customer_admin")) return fail(409, "Customer relationship requires migration review")
        if (action === "profile-put") {
          const patch = selectFields(input, ["username", "firstName", "lastName", "phone", "hasCompletedOnboarding"])
          if (typeof patch.username === "string") patch.username = patch.username.toLowerCase().trim()
          if (typeof patch.phone === "string" && patch.phone !== user.phone) Object.assign(patch, { whatsappVerified: false, whatsappVerificationCode: null, whatsappVerificationExpires: null })
          await repository.updateProfile(loaded, patch, customer ?? undefined, selectFields(input, ["companyName", "address", "city", "country", "industry"]))
          return json({ success: true, message: "Profile updated successfully" })
        }
        if (action === "me") {
          const stats = customer ? await repository.documentStats(customer.value._id) : null
          return json({ authenticated: true, user: userView(user), customer: customer ? customerView(customer.value) : null,
            documentStats: stats ? { ...stats, maxAllowed: customer?.value.maxAllowedDocuments || 20 } : null,
            unreadNotificationsCount: await repository.unreadCount(user) })
        }
        const operations = customer ? await repository.operationStats(customer.value._id) : { totalShipments: 0, activeShipments: 0, deliveredShipments: 0 }
        const documents = customer ? await repository.customerDocuments(customer.value._id, true) : []
        return json({ user: { ...userView(user), username: user.username || "", phone: user.phone || "", createdAt: user.createdAt },
          customer: customer ? customerView(customer.value) : null,
          operations: { ...operations, activeServices: ["Sea Freight (FCL / LCL)", "Air Cargo Express", "Customs Clearance Alexandria & Sokhna", "Bonded Warehousing"] },
          expiringDocuments: documents.map(doc => ({ id: doc._id, ...selectFields(doc, ["title", "category", "fileName", "fileUrl", "fileSize", "mimeType", "status", "createdAt"]), startDate: doc.startDate || null, expiryDate: doc.expiryDate || null, rejectionReason: doc.rejectionReason || null, warningEscalationTier: doc.warningEscalationTier || "none" })) })
      }

      if (!staffRole(user)) return fail(403, "Staff access required")
      if (["staff-create", "staff-update", "staff-suspend", "roles-create"].includes(action) && user.role !== "super_admin") return fail(403, "Only managers can manage employee accounts and roles")

      if (action === "staff-list") {
        const staff = (await repository.listStaff()).map(value => ({ ...userView(value), jobTitle: value.jobTitle || "", phone: value.phone || "", staffPermissions: { ...defaults, ...value.staffPermissions }, lastLoginAt: value.lastLoginAt, createdAt: value.createdAt }))
        return json({ success: true, staff, totalCount: staff.length })
      }
      if (action === "staff-create") {
        if (input.username && await repository.findUser("username", input.username)) return fail(409, "Username is already taken")
        const existing = await repository.findUser("email", input.email)
        if (existing && input.email.endsWith("@staff.nilelink.invalid")) return fail(409, "Username is already taken")
        let staff: StoredUser
        if (existing) {
          const patch = { ...selectFields(input, ["role", "firstName", "lastName", "jobTitle", "phone"]), staffPermissions: { ...defaults, ...input.staffPermissions }, status: "active", ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}) }
          await repository.patchUser(existing, { ...patch, ...(input.username ? { username: input.username } : {}) })
          staff = { ...existing.user, ...patch } as StoredUser
        } else {
          if (!input.password) return fail(400, "Password is required for new accounts")
          staff = createUser({ ...input, email: input.email, firstName: input.firstName, lastName: input.lastName, passwordHash: await hashPassword(input.password), role: input.role, emailVerified: true, whatsappVerified: true })
          // Input passwords are never persisted alongside their hash.
          delete staff.password
          await repository.createStaff(staff)
        }
        return json({ success: true, message: `Staff member ${staff.firstName} ${staff.lastName} created successfully.`, staff: { ...userView(staff), jobTitle: staff.jobTitle || "", createdAt: staff.createdAt } })
      }
      if (action === "staff-update" || action === "staff-suspend") {
        const target = id ? await repository.findUser("id", id) : null
        if (!target || !staffRole(target.user)) return fail(404, "Staff member not found")
        if (target.user._id === user._id && (action === "staff-suspend" || (input.status && input.status !== "active"))) return fail(400, "You cannot suspend or deactivate your own manager account.")
        const patch = action === "staff-suspend" ? { status: "suspended" } : {
          ...selectFields(input, ["firstName", "lastName", "phone", "status"]),
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
          ...(input.staffPermissions ? { staffPermissions: { ...defaults, ...target.user.staffPermissions, ...input.staffPermissions } } : {}),
        }
        await repository.patchUser(target, patch)
        return json({ success: true, message: action === "staff-suspend" ? `Staff member ${target.user.firstName} ${target.user.lastName} has been suspended.` : "Staff member updated successfully.", staff: userView({ ...target.user, ...patch } as StoredUser) })
      }
      if (action === "roles-list") return json({ success: true, roles: (await repository.listRoles()).map(role => ({ id: role._id, title: role.title, permissions: role.permissions, isSystem: role.isSystem })) })
      if (action === "roles-create") {
        if ((await repository.listRoles()).some(role => role.title.toLowerCase() === input.title.toLowerCase())) return fail(409, "A role with this title already exists.")
        const now = new Date().toISOString()
        const role = { _id: newAccountId(), title: input.title, permissions: input.permissions, isSystem: false, createdAt: now, updatedAt: now, __v: 0 }
        await repository.createRole(role)
        return json({ success: true, role: { id: role._id, title: role.title, permissions: role.permissions, isSystem: role.isSystem } })
      }

      if (action === "customers-list" || action === "customers-search") {
        const params = new URL(request.url).searchParams
        const pattern = params.get(action === "customers-search" ? "q" : "search") || ""
        const search = pattern ? regexSearch(pattern) : null
        let customers = await repository.listCustomers(action === "customers-list" ? params.get("status") || "all" : undefined)
        if (search) customers = customers.filter(customer => [String(customer.customerCode || ""), String(customer.legacyCustomerCode || ""), customer.taxCardNumber, customer.companyName, customer.commercialRegisterNumber, customer.contactEmail, ...(action === "customers-list" ? [customer.contactPhone] : [])].some(value => search.test(value || "")))
        if (action === "customers-search") {
          customers.sort((a, b) => a.companyName < b.companyName ? -1 : a.companyName > b.companyName ? 1 : 0)
          return json({ success: true, customers: customers.slice(0, 30).map(customer => ({ id: customer._id, ...selectFields(customer, ["customerCode", "companyName", "commercialRegisterNumber", "contactEmail", "contactPhone", "address", "city", "country"]) })) })
        }
        const enriched = await Promise.all(customers.map(async customer => {
          const docs = await repository.customerDocuments(customer._id)
          return { ...customerView(customer), totalDocs: docs.length, expiringCount: docs.filter(doc => doc.status === "expiring_soon").length, expiredCount: docs.filter(doc => doc.status === "expired").length, pendingCount: docs.filter(doc => doc.status === "pending_review").length, maxAllowed: customer.maxAllowedDocuments || 20 }
        }))
        return json({ customers: enriched, total: enriched.length })
      }
      const customer = id ? await repository.findCustomer(id) : null
      if (!customer) return fail(404, "Customer not found")
      if (action === "customer-delete") return fail(409, "Permanent deletion is disabled during D1 migration. Customer and financial records were preserved.")
      if (action === "customer-status") {
        if (user.role !== "super_admin" && !user.staffPermissions?.canManageCustomers) return fail(403, "Missing canManageCustomers permission")
        const now = new Date().toISOString()
        const notifications = (await repository.customerUsers(customer.value._id)).map(recipient => ({
          _id: newAccountId(), recipientUserId: recipient._id, recipientCustomerId: customer.value._id,
          title: input.accountStatus === "active" ? "Account Status Activated" : input.accountStatus === "warning" ? "Account Status: Action Required" : input.accountStatus === "under_review" ? "Account Under Review" : "Account Service Restricted",
          message: input.statusReason, channel: "in_app", type: "account_status_change",
          severity: input.accountStatus === "active" ? "normal" : input.accountStatus === "inactive" ? "critical" : "warning",
          targetAudience: "customer", actionUrl: "/portal", isRead: false, readBy: [], readAt: null,
          emailStatus: "not_applicable", whatsappStatus: "not_applicable", createdAt: now, updatedAt: now, __v: 0,
        }))
        await repository.updateCustomerStatus(customer, { accountStatus: input.accountStatus, statusReason: input.statusReason }, notifications)
        return json({ success: true, message: `Customer status updated from ${customer.value.accountStatus} to ${input.accountStatus}.`, customer: { id: customer.value._id, companyName: customer.value.companyName, accountStatus: input.accountStatus, statusReason: input.statusReason } })
      }
      if (action === "customer-get") {
        const [contacts, documents, invoices] = await Promise.all([repository.customerUsers(customer.value._id), repository.customerDocuments(customer.value._id), repository.recentInvoices(customer.value._id)])
        const stats = { totalDocs: documents.length, approvedDocs: 0, expiringDocs: 0, expiredDocs: 0, pendingDocs: 0, rejectedDocs: 0, maxAllowed: customer.value.maxAllowedDocuments || 20 }
        const statKeys = { approved: "approvedDocs", expiring_soon: "expiringDocs", expired: "expiredDocs", pending_review: "pendingDocs", rejected: "rejectedDocs" } as const
        for (const doc of documents) if (Object.hasOwn(statKeys, doc.status)) stats[statKeys[doc.status as keyof typeof statKeys]]++
        return json({ success: true, currentUserRole: user.role, customer: customerView(customer.value, true),
          users: contacts.map(contact => ({ id: contact._id, name: `${contact.firstName} ${contact.lastName}`, ...selectFields(contact, ["email", "phone", "role", "status", "emailVerified", "whatsappVerified", "lastLoginAt"]) })), complianceStats: stats,
          documents: documents.map(doc => ({ id: doc._id, ...selectFields(doc, ["title", "category", "fileName", "fileUrl", "fileSize", "mimeType", "status", "startDate", "expiryDate", "warningEscalationTier", "rejectionReason", "reviewNotes", "createdAt"]) })),
          recentInvoices: invoices.map(invoice => ({ id: invoice._id, invoiceNumber: invoice.invoiceNumber, amount: invoice.totalAmount, currency: invoice.currency, status: invoice.status, dueDate: invoice.dueDate })) })
      }
      return fail(503, "Account operation has not been converted to D1")
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      if (error instanceof AccountConflictError) return json({ error: error.message, code: "ACCOUNT_CONFLICT" }, 409)
      // Never return query text, raw documents, hashes, tokens or connection details.
      return json({ error: "Account operation failed", code: "D1_ACCOUNT_ERROR" }, 500)
    }
  }
}

export async function handleD1AccountAction(action: D1AccountAction): Promise<NextResponse> {
  try {
    const { getD1 } = await import("../db/d1")
    return await createD1AccountsHandler(await getD1())(action)
  } catch {
    return json({ error: "D1 accounts preview is unavailable", code: "D1_UNAVAILABLE" }, 503)
  }
}

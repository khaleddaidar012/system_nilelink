export type StaffCategory = "operations" | "accounts"

type PermissionBag = { staffCategory?: unknown; [key: string]: unknown }
type AccountLike = { role?: string; staffPermissions?: { staffCategory?: unknown; canMarkReadyForAccounts?: boolean } | null }

/** Permissions that only the Accounts team (and administrators) may ever hold. */
export const FINANCIAL_PERMISSION_KEYS = [
  "canAccessAccounts",
  "createInvoice",
  "editInvoice",
  "issueTaxInvoice",
  "viewCustomerStatements",
  "exportCustomerStatements",
  "sendFinancialDocuments",
  "canUseTieredPricing",
] as const

export const OPERATIONS_PRESET = {
  staffCategory: "operations" as const,
  canSendAlerts: true,
  canReviewDocuments: true,
  canManageCustomers: false,
  canViewShipmentData: true,
  canMarkReadyForAccounts: true,
  canAccessAccounts: false,
  createInvoice: false,
  editInvoice: false,
  issueTaxInvoice: false,
  viewCustomerStatements: false,
  exportCustomerStatements: false,
  sendFinancialDocuments: false,
  canUseTieredPricing: false,
}

export const ACCOUNTS_PRESET = {
  staffCategory: "accounts" as const,
  canSendAlerts: false,
  canReviewDocuments: false,
  canManageCustomers: false,
  canViewShipmentData: false,
  canMarkReadyForAccounts: false,
  canAccessAccounts: true,
  createInvoice: true,
  editInvoice: true,
  issueTaxInvoice: false,
  viewCustomerStatements: true,
  exportCustomerStatements: true,
  sendFinancialDocuments: false,
  canUseTieredPricing: false,
}

/** Permission keys an administrator may edit for each category (UI and server share this list). */
export const OPERATIONS_EDITABLE_KEYS = [
  "canSendAlerts",
  "canReviewDocuments",
  "canManageCustomers",
  "canViewShipmentData",
  "canMarkReadyForAccounts",
] as const

export function normalizeStaffCategory(value: unknown): StaffCategory | undefined {
  return value === "operations" || value === "accounts" ? value : undefined
}

export function staffCategoryOf(account: AccountLike | null | undefined): StaffCategory | undefined {
  if (!account || account.role !== "staff") return undefined
  return normalizeStaffCategory(account.staffPermissions?.staffCategory)
}

/**
 * Enforces category boundaries. Operations accounts can never hold financial
 * permissions, regardless of what the caller submitted.
 */
export function sanitizeStaffPermissions<T extends object>(permissions: T): T {
  const bag = permissions as PermissionBag
  const category = normalizeStaffCategory(bag.staffCategory)
  if (category !== "operations") return permissions
  const next: PermissionBag = { ...bag }
  for (const key of FINANCIAL_PERMISSION_KEYS) next[key] = false
  next.canMarkReadyForAccounts = bag.canMarkReadyForAccounts !== false
  return next as T
}

/** Administrators and operations staff may flag a shipment as ready for accounts. */
export function userCanMarkReadyForAccounts(account: AccountLike | null | undefined): boolean {
  if (!account) return false
  if (account.role === "super_admin") return true
  if (account.role !== "staff") return false
  const permissions = account.staffPermissions
  if (!permissions) return false
  if (permissions.canMarkReadyForAccounts !== undefined) return permissions.canMarkReadyForAccounts === true
  return normalizeStaffCategory(permissions.staffCategory) === "operations"
}

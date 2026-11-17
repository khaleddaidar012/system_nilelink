export function canAccessAccounts(account: {
  email: string
  role: string
  status?: string
  staffPermissions?: { canAccessAccounts?: boolean }
}): boolean {
  if (account.status && account.status !== "active") return false
  if (account.role === "super_admin") return true
  if (account.role !== "staff") return false
  if (account.staffPermissions?.canAccessAccounts !== undefined) return account.staffPermissions.canAccessAccounts
  return ["mohamedzanaty@staff.nilelink.invalid", "mahmoudzanaty@staff.nilelink.invalid"].includes(account.email.toLowerCase())
}

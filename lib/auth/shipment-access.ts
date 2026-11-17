export function canAccessShipmentData(account: {
  email: string
  role: string
  status?: string
  staffPermissions?: { canViewShipmentData?: boolean }
}): boolean {
  if (account.status && account.status !== "active") return false
  if (account.role !== "staff" && account.role !== "super_admin") return false
  if (account.staffPermissions?.canViewShipmentData !== undefined) {
    return account.staffPermissions.canViewShipmentData
  }
  if (account.role === "super_admin") return true

  return [
    "mohamedzanaty@staff.nilelink.invalid",
    "mahmoudzanaty@staff.nilelink.invalid",
  ].includes(account.email.toLowerCase())
}

import { cache } from "react"
import { getD1 } from "@/lib/db/d1"
import { getDatabaseProvider } from "@/lib/db/provider"
import { D1UsersRepository } from "@/lib/db/repositories/users"
import { connectDB } from "@/lib/mongodb"
import { User } from "@/lib/models/User"
import { canAccessShipmentData } from "./shipment-access"
import { canAccessAccounts } from "./accounts-access"
import { userCanMarkReadyForAccounts } from "./staff-categories"

const getAccessAccount = cache(async (userId: string) => {
  if (getDatabaseProvider() === "d1") {
    const account = await new D1UsersRepository(await getD1()).findById(userId)
    return account?.user ?? null
  }

  await connectDB()
  const account = await User.findById(userId).select("email role status staffPermissions").lean()
  return account
})

export const getShipmentAccess = cache(async (userId: string) => {
  const account = await getAccessAccount(userId)
  return account ? canAccessShipmentData(account) : false
})
export const getAccountsAccess = cache(async (userId: string) => {
  const account = await getAccessAccount(userId)
  return account ? canAccessAccounts(account) : false
})
export const getMarkReadyAccess = cache(async (userId: string) => {
  const account = await getAccessAccount(userId)
  return account ? userCanMarkReadyForAccounts(account) : false
})
export const getStaffPermissionsSnapshot = cache(async (userId: string) => {
  const account = await getAccessAccount(userId)
  return account?.staffPermissions ?? null
})

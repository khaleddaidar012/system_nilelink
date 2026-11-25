"use client"

import { createContext, useContext } from "react"

export interface AdminNavPermissions {
  staffCategory?: "operations" | "accounts"
  canSendAlerts?: boolean
  canReviewDocuments?: boolean
  canManageCustomers?: boolean
  createInvoice?: boolean
  viewCustomerStatements?: boolean
}

const AdminExperienceContext = createContext<{
  simple: boolean
  role: string
  canManageBackups: boolean
  canViewShipmentData: boolean
  canAccessAccounts: boolean
  canMarkReadyForAccounts: boolean
  permissions: AdminNavPermissions
}>({
  simple: false,
  role: "staff",
  canManageBackups: false,
  canViewShipmentData: false,
  canAccessAccounts: false,
  canMarkReadyForAccounts: false,
  permissions: {},
})

export function AdminExperienceProvider({
  simple,
  role = "staff",
  canManageBackups = false,
  canViewShipmentData = false,
  canAccessAccounts = false,
  canMarkReadyForAccounts = false,
  permissions = {},
  children,
}: {
  simple: boolean
  role?: string
  canManageBackups?: boolean
  canViewShipmentData?: boolean
  canAccessAccounts?: boolean
  canMarkReadyForAccounts?: boolean
  permissions?: AdminNavPermissions
  children: React.ReactNode
}) {
  return (
    <AdminExperienceContext.Provider
      value={{ simple, role, canManageBackups, canViewShipmentData, canAccessAccounts, canMarkReadyForAccounts, permissions }}
    >
      {children}
    </AdminExperienceContext.Provider>
  )
}

export function useSimpleAdminExperience() {
  return useContext(AdminExperienceContext).simple
}

export function useAdminRole() {
  return useContext(AdminExperienceContext).role
}

export function useCanManageAdminBackups() {
  return useContext(AdminExperienceContext).canManageBackups
}

export function useCanViewShipmentData() {
  return useContext(AdminExperienceContext).canViewShipmentData
}

export function useCanAccessAccounts() {
  return useContext(AdminExperienceContext).canAccessAccounts
}

export function useCanMarkReadyForAccounts() {
  return useContext(AdminExperienceContext).canMarkReadyForAccounts
}

export function useAdminNavPermissions() {
  return useContext(AdminExperienceContext).permissions
}

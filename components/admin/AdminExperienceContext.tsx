"use client"

import { createContext, useContext } from "react"

const AdminExperienceContext = createContext({
  simple: false,
  role: "staff",
  canManageBackups: false,
  canViewShipmentData: false,
  canAccessAccounts: false,
  canMarkReadyForAccounts: false,
})

export function AdminExperienceProvider({
  simple,
  role = "staff",
  canManageBackups = false,
  canViewShipmentData = false,
  canAccessAccounts = false,
  canMarkReadyForAccounts = false,
  children,
}: {
  simple: boolean
  role?: string
  canManageBackups?: boolean
  canViewShipmentData?: boolean
  canAccessAccounts?: boolean
  canMarkReadyForAccounts?: boolean
  children: React.ReactNode
}) {
  return (
    <AdminExperienceContext.Provider
      value={{ simple, role, canManageBackups, canViewShipmentData, canAccessAccounts, canMarkReadyForAccounts }}
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

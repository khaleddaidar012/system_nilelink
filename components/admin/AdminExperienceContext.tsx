"use client"

import { createContext, useContext } from "react"

const AdminExperienceContext = createContext({ simple: false, canManageBackups: false, canViewShipmentData: false, canAccessAccounts: false })

export function AdminExperienceProvider({ simple, canManageBackups = false, canViewShipmentData = false, canAccessAccounts = false, children }: { simple: boolean; canManageBackups?: boolean; canViewShipmentData?: boolean; canAccessAccounts?: boolean; children: React.ReactNode }) {
  return <AdminExperienceContext.Provider value={{ simple, canManageBackups, canViewShipmentData, canAccessAccounts }}>{children}</AdminExperienceContext.Provider>
}

export function useSimpleAdminExperience() {
  return useContext(AdminExperienceContext).simple
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

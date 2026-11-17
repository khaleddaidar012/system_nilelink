import { getAccountsAccess, getShipmentAccess } from "@/lib/auth/shipment-access-server"
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/token-service"
import { WorkspaceActivity } from "@/components/admin/WorkspaceActivity"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { ChatDeliveryObserver } from "@/components/chat/ChatDeliveryObserver"
import { AdminExperienceProvider } from "@/components/admin/AdminExperienceContext"

type Props = {
  children: React.ReactNode
}

export default async function AdminLayout({ children }: Props) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login?callbackUrl=/admin")
  }

  if (session.role !== "staff" && session.role !== "super_admin") {
    redirect("/portal")
  }

  const accountName = session.email.split("@")[0].toLowerCase()
  const simpleStaffView = ["mohamedzanaty", "mahmoudzanaty"].includes(accountName)
  const canViewShipmentData = await getShipmentAccess(session.userId)
  const canAccessAccounts = await getAccountsAccess(session.userId)
  const canManageBackups = session.role === "super_admin" || session.staffPermissions?.canManageBackups === true

  return (
    <WorkspaceActivity><div className="relative flex min-h-screen bg-slate-50 font-sans text-slate-900 transition-colors duration-200 dark:bg-[#0b0f19] dark:text-slate-100">
      <ChatDeliveryObserver />
      {/* Ambient Dark Mode Radial Lighting & Depth Effects */}
      <div className="pointer-events-none absolute inset-0 hidden overflow-hidden dark:block">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-primary-500/10 blur-[130px]" />
        <div className="absolute top-1/2 -right-40 h-[500px] w-[500px] rounded-full bg-indigo-500/8 blur-[140px]" />
      </div>

      <AdminSidebar
        canManageBackups={canManageBackups}
        canViewShipmentData={canViewShipmentData}
        canAccessAccounts={canAccessAccounts}
        userId={session.userId}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AdminExperienceProvider simple={simpleStaffView} canManageBackups={canManageBackups} canViewShipmentData={canViewShipmentData} canAccessAccounts={canAccessAccounts}><main className="flex-1">{children}</main></AdminExperienceProvider>
      </div>
    </div></WorkspaceActivity>
  )
}

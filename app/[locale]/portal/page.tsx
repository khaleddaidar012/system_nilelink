import { useTranslations } from "next-intl"
import { PortalHeader } from "@/components/portal/PortalHeader"
import { AccountHealthAlertBanner } from "@/components/portal/AccountHealthAlertBanner"
import { DashboardMetricsCards } from "@/components/portal/DashboardMetricsCards"
import { QuickUploadWidget } from "@/components/portal/QuickUploadWidget"
import { RecentActivityFeed } from "@/components/portal/RecentActivityFeed"

export default function PortalDashboardPage() {
  const t = useTranslations()
  
  return (
    <div className="flex flex-col">
      <PortalHeader 
        title={t("portal.sidebar.dashboard") || "Client Dashboard"} 
        subtitle={t("portal.dashboard.subtitle") || "Corporate legal files, shipping operations & compliance status"} 
      />

      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Urgent Account Health Alert Banner */}
        <AccountHealthAlertBanner />


        {/* 4 KPI Metrics Cards */}
        <DashboardMetricsCards />

        {/* Main Grid: Quick Dropzone & Activity Timeline */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          <QuickUploadWidget />
          <div>
            <RecentActivityFeed />
          </div>
        </div>
      </div>
    </div>
  )
}

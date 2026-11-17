import { ServiceLockoutGuard } from "@/components/portal/ServiceLockoutGuard"

export default function PortalRequestsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ServiceLockoutGuard>{children}</ServiceLockoutGuard>
}

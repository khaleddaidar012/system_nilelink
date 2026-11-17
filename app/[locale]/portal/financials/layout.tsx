import { ServiceLockoutGuard } from "@/components/portal/ServiceLockoutGuard"

export default function PortalFinancialsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ServiceLockoutGuard>{children}</ServiceLockoutGuard>
}

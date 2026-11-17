import { ServiceLockoutGuard } from "@/components/portal/ServiceLockoutGuard"

export default function PortalQuotesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ServiceLockoutGuard>{children}</ServiceLockoutGuard>
}

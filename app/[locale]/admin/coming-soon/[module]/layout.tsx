import { notFound } from "next/navigation"
import { getServerSession } from "@/lib/auth/token-service"
import { getShipmentAccess } from "@/lib/auth/shipment-access-server"

export default async function ModuleLayout({ children, params }: {
  children: React.ReactNode
  params: Promise<{ module: string }>
}) {
  const { module } = await params
  if (module === "shipments") {
    const session = await getServerSession()
    if (!session || !(await getShipmentAccess(session.userId))) notFound()
  }

  return children
}

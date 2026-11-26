import { ShipmentInvoiceList } from "@/components/admin/shipments/ShipmentInvoiceWorkspace"
import { getServerSession } from "@/lib/auth/token-service"
import { getAccountsAccess } from "@/lib/auth/shipment-access-server"
import { getD1 } from "@/lib/db/d1"
import { redirect } from "next/navigation"
import { z } from "zod"

export default async function Page({
  searchParams,
  params,
}: {
  searchParams: Promise<{ shipmentId?: string; customerId?: string; customerName?: string; scope?: string }>
  params: Promise<{ locale: string }>
}) {
  const sp = await searchParams
  const shipmentId = sp.shipmentId || ""
  const customerId = sp.customerId && /^[a-f\d]{24}$/i.test(sp.customerId) ? sp.customerId : ""
  const customerName = sp.customerName || ""
  const scope = sp.scope === "active" ? "active" : "all"

  if (z.uuid().safeParse(shipmentId).success) {
    const session = await getServerSession()
    if (session && (await getAccountsAccess(session.userId))) {
      const invoice = await (await getD1())
        .prepare("SELECT id FROM invoices WHERE json_extract(data,'$.shipmentRecordId')=?")
        .bind(shipmentId)
        .first<{ id: string }>()
      if (invoice) redirect(`/${(await params).locale}/admin/shipment-invoices/${invoice.id}`)
    }
  }
  return (
    <ShipmentInvoiceList
      initialShipmentId={shipmentId}
      initialCustomerId={customerId}
      initialCustomerName={customerName}
      initialScope={scope}
    />
  )
}

import { ShipmentInvoiceList } from "@/components/admin/shipments/ShipmentInvoiceWorkspace"
import { getServerSession } from "@/lib/auth/token-service"
import { getAccountsAccess } from "@/lib/auth/shipment-access-server"
import { getD1 } from "@/lib/db/d1"
import { redirect } from "next/navigation"
import { z } from "zod"
export default async function Page({ searchParams,params }: { searchParams: Promise<{ shipmentId?: string }>;params:Promise<{locale:string}> }) {
  const shipmentId=(await searchParams).shipmentId||""
  if(z.uuid().safeParse(shipmentId).success){
    const session=await getServerSession()
    if(session&&await getAccountsAccess(session.userId)){
      const invoice=await (await getD1()).prepare("SELECT id FROM invoices WHERE json_extract(data,'$.shipmentRecordId')=?").bind(shipmentId).first<{id:string}>()
      if(invoice)redirect(`/${(await params).locale}/admin/shipment-invoices/${invoice.id}`)
    }
  }
  return <ShipmentInvoiceList initialShipmentId={shipmentId} />
}

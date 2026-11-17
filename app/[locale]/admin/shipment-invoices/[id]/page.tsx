import { ShipmentInvoiceEditor } from "@/components/admin/shipments/ShipmentInvoiceWorkspace"
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ShipmentInvoiceEditor id={(await params).id} />
}

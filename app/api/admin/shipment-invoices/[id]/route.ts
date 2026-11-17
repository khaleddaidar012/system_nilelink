import { shipmentAccountingRoute } from "@/lib/shipments/accounting-route"
type Context = { params: Promise<{ id: string }> }
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: Context) {
  return shipmentAccountingRoute(request, "shipment-invoice-detail", (await context.params).id)
}
export async function PUT(request: Request, context: Context) {
  return shipmentAccountingRoute(request, "shipment-invoice-save", (await context.params).id)
}

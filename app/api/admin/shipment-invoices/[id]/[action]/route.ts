import { shipmentAccountingRoute } from "@/lib/shipments/accounting-route"
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params
  if (!["preview", "publish", "revise"].includes(action)) return Response.json({ error: "Not found" }, { status: 404 })
  return shipmentAccountingRoute(request, `shipment-invoice-${action}`, id)
}

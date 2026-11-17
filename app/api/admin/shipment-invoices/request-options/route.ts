import { shipmentAccountingRoute } from "@/lib/shipments/accounting-route"
export const dynamic = "force-dynamic"
export const GET = (request: Request) => shipmentAccountingRoute(request, "shipment-invoice-request-options")

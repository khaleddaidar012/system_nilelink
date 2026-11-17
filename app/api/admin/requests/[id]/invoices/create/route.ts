import {shipmentAccountingRoute} from "@/lib/shipments/accounting-route"
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return shipmentAccountingRoute(request,"shipment-invoice-from-request",(await params).id)}

export type ShipmentOption = {
  id: string; booking: string; shipper: string
  customerId?: string | null; customerCode?: string | null; customerName?: string | null
  requestId?: string | null; requestNumber?: string | null
}
/** Booking identifiers belong to carriers; only explicit relationships supply NL references. */
export function shipmentOptionLabel(item: ShipmentOption, ar: boolean) {
  const request = item.requestNumber ? `${ar ? "الطلب" : "Request"}: ${"\u2066" + item.requestNumber + "\u2069"}`
    : ar ? "بدون طلب مرتبط" : "No linked request"
  return `${request} · ${ar ? "الحجز" : "Booking"}: ${item.booking} · ${item.customerCode ? "\u2066" + item.customerCode + "\u2069 · " : ""}${item.shipper}`
}

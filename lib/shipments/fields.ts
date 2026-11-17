export const shipmentFields = [
  { key: "shipment_date", ar: "التاريخ", en: "Date", type: "date" },
  { key: "booking", ar: "رقم الحجز", en: "Booking", type: "text" },
  { key: "number_46", ar: "رقم 46", en: "Number 46", type: "text" },
  { key: "ucr", ar: "UCR", en: "UCR", type: "text" },
  { key: "shipping_line", ar: "الخط الملاحي", en: "Shipping line", type: "text" },
  { key: "container_count", ar: "عدد الحاويات", en: "Container count", type: "number" },
  { key: "container_size", ar: "مقاس الحاوية", en: "Container size", type: "text" },
  { key: "export_invoice", ar: "فاتورة التصدير", en: "Export invoice", type: "text" },
  { key: "broker", ar: "المخلّص", en: "Broker", type: "text" },
  { key: "shipper", ar: "الشاحن", en: "Shipper", type: "text" },
  { key: "port_of_loading", ar: "منفذ الشحن", en: "Loading location", type: "text" },
  { key: "port_of_discharge", ar: "منفذ الوصول", en: "Arrival location", type: "text" },
  { key: "item_name", ar: "الصنف", en: "Item name", type: "text" },
  { key: "hs_code", ar: "البند الجمركي", en: "HS code", type: "text" },
] as const

type ShipmentField = typeof shipmentFields[number]["key"]
export const containerFields = [
  { key: "number", ar: "رقم الحاوية", en: "Container number" },
  { key: "driver_number", ar: "رقم السائق", en: "Driver number" },
  { key: "truck_number", ar: "رقم العربية", en: "Truck number" },
] as const

export const shipmentSuggestionFields = [
  "shipping_line", "container_size", "broker", "shipper", "port_of_loading",
  "port_of_discharge", "item_name", "hs_code",
] as const

export type ShipmentContainer = Record<typeof containerFields[number]["key"], string>
export type ShipmentDraft = Record<Exclude<ShipmentField, "container_count">, string> & {
  container_count: number
  containers: ShipmentContainer[]
}
export type ShipmentRecord = ShipmentDraft & { id: string; revision: number }

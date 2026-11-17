export function validShippingOperation(input: {services: {serviceKey: string}[]; operationType: string}): boolean {
  return !input.services.some(service => ["sea_freight", "air_freight", "land_freight", "customs_clearance"].includes(service.serviceKey)) || ["import", "export", "transit"].includes(input.operationType)
}

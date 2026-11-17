/** Both shipment and request invoices use the same reviewed publication workflow. */
export function isAccountingInvoice(value:Record<string,unknown>){return !!value.shipmentRecordId||value.requestAccounting===true}

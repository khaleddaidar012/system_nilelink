export const shipmentInvoiceIndexes = [
  "CREATE UNIQUE INDEX invoices_shipment_record_unique\nON invoices(json_extract(data, '$.shipmentRecordId'))\nWHERE json_extract(data, '$.shipmentRecordId') IS NOT NULL",
  "CREATE UNIQUE INDEX invoices_request_current_unique\nON invoices(relatedRequestId)\nWHERE relatedRequestId IS NOT NULL",
]

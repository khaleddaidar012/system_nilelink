-- Existing invoices remain unchanged. A shipment has one canonical invoice.
CREATE UNIQUE INDEX invoices_shipment_record_unique
ON invoices(json_extract(data, '$.shipmentRecordId'))
WHERE json_extract(data, '$.shipmentRecordId') IS NOT NULL;

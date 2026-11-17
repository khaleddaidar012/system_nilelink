export const previousShipmentSchema = [
  "CREATE TABLE shipment_records (\n  id TEXT PRIMARY KEY,\n  shipment_date TEXT NOT NULL,\n  booking TEXT NOT NULL,\n  number_46 TEXT NOT NULL,\n  shipping_line TEXT NOT NULL,\n  container_count INTEGER NOT NULL CHECK (container_count BETWEEN 1 AND 10000),\n  container_size TEXT NOT NULL,\n  export_invoice TEXT NOT NULL,\n  broker TEXT NOT NULL,\n  shipper TEXT NOT NULL,\n  port_of_loading TEXT NOT NULL,\n  port_of_discharge TEXT NOT NULL,\n  item_name TEXT NOT NULL,\n  hs_code TEXT NOT NULL,\n  updated_by TEXT NOT NULL,\n  revision INTEGER NOT NULL DEFAULT 1\n)",
  "CREATE INDEX shipment_records_date_idx\nON shipment_records (shipment_date DESC, id DESC)"
]

export const previousShipmentTable = {
  "name": "shipment_records",
  "columns": [
    "id",
    "shipment_date",
    "booking",
    "number_46",
    "shipping_line",
    "container_count",
    "container_size",
    "export_invoice",
    "broker",
    "shipper",
    "port_of_loading",
    "port_of_discharge",
    "item_name",
    "hs_code",
    "updated_by",
    "revision"
  ]
}

// SQLite appends added columns immediately before the original closing parenthesis.
export const shipmentSchema = [
  previousShipmentSchema[0].slice(0, -1) +
    ", ucr TEXT NOT NULL DEFAULT '', containers_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(containers_json) AND json_type(containers_json) = 'array'))",
  previousShipmentSchema[1],
]

export const shipmentTable = {
  ...previousShipmentTable,
  columns: [...previousShipmentTable.columns, "ucr", "containers_json"],
}

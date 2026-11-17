CREATE TABLE shipment_records (
  id TEXT PRIMARY KEY,
  shipment_date TEXT NOT NULL,
  booking TEXT NOT NULL,
  number_46 TEXT NOT NULL,
  shipping_line TEXT NOT NULL,
  container_count INTEGER NOT NULL CHECK (container_count BETWEEN 1 AND 10000),
  container_size TEXT NOT NULL,
  export_invoice TEXT NOT NULL,
  broker TEXT NOT NULL,
  shipper TEXT NOT NULL,
  port_of_loading TEXT NOT NULL,
  port_of_discharge TEXT NOT NULL,
  item_name TEXT NOT NULL,
  hs_code TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX shipment_records_date_idx
ON shipment_records (shipment_date DESC, id DESC);

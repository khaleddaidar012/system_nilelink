ALTER TABLE shipment_records ADD COLUMN ucr TEXT NOT NULL DEFAULT '';
ALTER TABLE shipment_records ADD COLUMN containers_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(containers_json) AND json_type(containers_json) = 'array');

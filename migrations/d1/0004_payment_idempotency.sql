-- Only new D1 payments carry this key; imported records remain unchanged.
CREATE UNIQUE INDEX payments_idempotency_key
ON payments(json_extract(data, '$.d1IdempotencyKey'))
WHERE json_type(data, '$.d1IdempotencyKey') = 'text';

-- Add human references without changing primary keys, links or issued invoice numbers.
WITH missing AS MATERIALIZED (
  SELECT id, coalesce(CAST(strftime('%Y',json_extract(data,'$.createdAt')) AS INTEGER),2026) AS year
  FROM customers WHERE json_extract(data,'$.customerCode') IS NULL
), numbered AS MATERIALIZED (
  SELECT id, year, row_number() OVER (PARTITION BY year ORDER BY id) + max(
    coalesce((SELECT max(CAST(json_extract(c.data,'$.customerSequence') AS INTEGER)) FROM customers c
      WHERE json_extract(c.data,'$.customerYear')=missing.year),0),
    coalesce((SELECT seq FROM _nilelink_workflow_sequences WHERE id='customer:'||year),0)) AS seq FROM missing
)
UPDATE customers SET data=json_patch(data,(SELECT json_object('customerCode','NL'||year||printf('%04d',seq),
  'customerYear',year,'customerSequence',seq) FROM numbered WHERE numbered.id=customers.id)), revision=revision+1
WHERE id IN (SELECT id FROM numbered);

WITH numbered AS MATERIALIZED (
  SELECT r.id,c.id AS customerId,json_extract(c.data,'$.customerCode') AS code,
    row_number() OVER (PARTITION BY r.customerId ORDER BY coalesce(json_extract(r.data,'$.createdAt'),''),r.id) + max(
    coalesce((SELECT max(CAST(json_extract(old.data,'$.requestSequence') AS INTEGER)) FROM customer_requests old
      WHERE old.customerId=r.customerId),0),
    coalesce((SELECT seq FROM _nilelink_workflow_sequences WHERE id='request:'||r.customerId),0)) AS seq
  FROM customer_requests r JOIN customers c ON c.id=r.customerId
  WHERE json_extract(r.data,'$.requestSequence') IS NULL
)
UPDATE customer_requests SET data=json_patch(data,(SELECT json_object('legacyTrackingNumber',json_extract(customer_requests.data,'$.trackingNumber'),
  'trackingNumber',code||'-'||seq,'customerCode',code,'requestSequence',seq) FROM numbered WHERE numbered.id=customer_requests.id)),revision=revision+1
WHERE id IN (SELECT id FROM numbered);

WITH sources AS MATERIALIZED (
  SELECT i.id,i.customerId,c.data AS customerData,r.id AS requestId,r.trackingNumber,
    coalesce(json_extract(i.data,'$.createdAt'),'') AS createdAt
  FROM invoices i JOIN customers c ON c.id=i.customerId
  LEFT JOIN customer_requests r ON r.id=i.relatedRequestId AND r.customerId=i.customerId
  WHERE json_extract(i.data,'$.referenceNumber') IS NULL
), numbered AS MATERIALIZED (
  SELECT *,row_number() OVER (PARTITION BY customerId,coalesce(requestId,'') ORDER BY createdAt,id) + max(
    coalesce((SELECT max(CAST(json_extract(old.data,'$.invoiceSequence') AS INTEGER)) FROM invoices old
      WHERE old.customerId=sources.customerId AND coalesce(json_extract(old.data,'$.numberingRequestId'),'')=coalesce(sources.requestId,'')),0),
    coalesce((SELECT seq FROM _nilelink_workflow_sequences WHERE id='invoice:'||CASE WHEN requestId IS NULL THEN 'customer:'||customerId ELSE 'request:'||requestId END),0)) AS seq
  FROM sources
)
UPDATE invoices SET data=json_patch(data,(SELECT json_object('referenceNumber',coalesce(trackingNumber,json_extract(customerData,'$.customerCode'))||'-I'||seq,
  'customerCode',json_extract(customerData,'$.customerCode'),'numberingRequestId',requestId,'invoiceSequence',seq)
  FROM numbered WHERE numbered.id=invoices.id)),revision=revision+1
WHERE id IN (SELECT id FROM numbered);

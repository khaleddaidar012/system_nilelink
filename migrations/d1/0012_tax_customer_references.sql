-- Tax numbers replace display references only. Internal IDs and issued invoice numbers stay unchanged.
INSERT INTO _nilelink_write_guards(id,valid)
SELECT 'tax-reference-migration', CASE WHEN EXISTS (
 SELECT 1 FROM customers WHERE replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(upper(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'-',''),' ','')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9')<>'' GROUP BY replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(upper(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'-',''),' ','')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9') HAVING count(*)>1
) OR EXISTS (
 SELECT 1 FROM (SELECT CASE WHEN replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(upper(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'-',''),' ','')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9')<>'' THEN replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9') ELSE json_extract(data,'$.customerCode') END AS code FROM customers)
 WHERE code IS NOT NULL GROUP BY code HAVING count(*)>1
) THEN 0 ELSE 1 END;

UPDATE customers SET data=json_set(data,
 '$.legacyCustomerCode',coalesce(json_extract(data,'$.legacyCustomerCode'),json_extract(data,'$.customerCode')),
 '$.customerCode',replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9'),'$.taxReferenceKey',replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(upper(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'-',''),' ','')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9')),revision=revision+1
WHERE replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(upper(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'-',''),' ','')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9')<>'' AND (json_extract(data,'$.customerCode') IS NOT replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9') OR json_extract(data,'$.taxReferenceKey') IS NOT replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(upper(replace(replace(trim(coalesce(json_extract(data,'$.taxCardNumber'),'')),'-',''),' ','')),'٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9'),'۰','0'),'۱','1'),'۲','2'),'۳','3'),'۴','4'),'۵','5'),'۶','6'),'۷','7'),'۸','8'),'۹','9'));

WITH changed AS MATERIALIZED (
 SELECT r.id,json_extract(c.data,'$.customerCode') AS code,
 json_extract(c.data,'$.customerCode')||'-'||json_extract(r.data,'$.requestSequence') AS number
 FROM customer_requests r JOIN customers c ON c.id=r.customerId
 WHERE json_extract(r.data,'$.requestSequence') IS NOT NULL AND (json_extract(r.data,'$.customerCode') IS NOT json_extract(c.data,'$.customerCode') OR r.trackingNumber IS NOT (json_extract(c.data,'$.customerCode')||'-'||json_extract(r.data,'$.requestSequence')))
)
UPDATE customer_requests SET data=json_set(
 json_insert(json_set(data,'$.previousTrackingNumbers',json(coalesce(json_extract(data,'$.previousTrackingNumbers'),'[]'))),'$.previousTrackingNumbers[#]',trackingNumber),
 '$.customerCode',(SELECT code FROM changed WHERE changed.id=customer_requests.id),
 '$.trackingNumber',(SELECT number FROM changed WHERE changed.id=customer_requests.id)),revision=revision+1
WHERE id IN (SELECT id FROM changed);

WITH changed AS MATERIALIZED (
 SELECT i.id,json_extract(c.data,'$.customerCode') AS code,
 coalesce(r.trackingNumber,json_extract(c.data,'$.customerCode'))||'-I'||json_extract(i.data,'$.invoiceSequence') AS number
 FROM invoices i JOIN customers c ON c.id=i.customerId
 LEFT JOIN customer_requests r ON r.id=json_extract(i.data,'$.numberingRequestId') AND r.customerId=i.customerId
 WHERE json_extract(i.data,'$.invoiceSequence') IS NOT NULL AND (json_extract(i.data,'$.customerCode') IS NOT json_extract(c.data,'$.customerCode') OR json_extract(i.data,'$.referenceNumber') IS NOT (coalesce(r.trackingNumber,json_extract(c.data,'$.customerCode'))||'-I'||json_extract(i.data,'$.invoiceSequence')))
)
UPDATE invoices SET data=json_set(
 json_insert(json_set(data,'$.previousReferenceNumbers',json(coalesce(json_extract(data,'$.previousReferenceNumbers'),'[]'))),'$.previousReferenceNumbers[#]',json_extract(data,'$.referenceNumber')),
 '$.customerCode',(SELECT code FROM changed WHERE changed.id=invoices.id),
 '$.referenceNumber',(SELECT number FROM changed WHERE changed.id=invoices.id)),revision=revision+1
WHERE id IN (SELECT id FROM changed);

DELETE FROM _nilelink_write_guards WHERE id='tax-reference-migration';

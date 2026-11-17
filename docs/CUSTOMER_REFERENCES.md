# Customer, request and invoice references

Customer references use the registered tax number, for example `012-345-678`. Requests continue the existing per-customer sequence: `012-345-678-1`, `012-345-678-2`. Invoice references continue the per-request sequence: `012-345-678-1-I1`, `012-345-678-1-I2`.

Leading zeroes and tax-number separators are preserved. Arabic and Persian digits are rendered as ASCII digits for reference and barcode compatibility. Comparison ignores spaces, hyphens and letter case; concurrent registration with the same normalized tax number fails atomically, without orphan accounts.

Primary keys, tenant ownership, URLs, invoice tokens, payments and published invoice numbers remain unchanged. Existing invoice references and request tracking numbers are retained as searchable aliases. Published snapshots are not rewritten. New invoices without a selected request use a customer-level reference such as `012-345-678-I1`. External, unregistered customers retain standard invoice numbering.

Reservations use internal customer/request IDs, so changing a display prefix does not reset sequences or reuse numbers. Current invoice assignment and replacement rules remain unchanged. Carrier booking numbers are independent and never used to guess customer ownership.

Imported customers with no tax number retain a legacy reference until their tax number is supplied. Registration requires a tax number. No database table or index is added, so the reviewed backup schema remains unchanged.

## Rollout

`0011_customer_references.sql` established the original NL references. Deploy the tax-aware runtime first, then apply `0012_tax_customer_references.sql` in one database transaction after a private export and a successful rehearsal on that export. The second migration switches customer references and related tracking/reference prefixes, preserving previous numbers and all financial fields. Duplicate normalized tax numbers stop the migration before it changes any customer. Reapplying the migration does not append duplicate aliases.

Verify customer references against stored tax numbers, uniqueness, customer-code search, request prefixes and invoice references. Keep the official invoice numbers and immutable publications when checking financial history.

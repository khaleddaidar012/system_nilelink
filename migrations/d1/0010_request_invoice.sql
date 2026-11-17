-- Existing duplicate relationships must be reviewed and detached before applying.
CREATE UNIQUE INDEX invoices_request_current_unique
ON invoices(relatedRequestId)
WHERE relatedRequestId IS NOT NULL;

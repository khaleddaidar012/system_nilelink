# Tasks 14–19

## 14 — Account compliance consistency
A shared evaluator now feeds D1 account reads, request access, document review and expiry evaluation. Company compliance uses effective document copies by category and configured mandatory categories. Request attachments and final shipment files do not affect compliance. Explicit administrative restrictions, and legacy inactive accounts whose origin is uncertain, remain restricted until reviewed. Existing approved accounts are not silently stripped of their legacy approval merely because historical files lack a complete category set. New accounts require the configured coverage.

The dashboard banner uses the evaluated account state rather than deriving a separate state from document counts. Company profiles exclude shipment invoices and effective old copies from expiry tracking. Date-only review expiry uses the end of the named day in Africa/Cairo, including DST. Request invoice reviews do not require or store a fabricated expiry date. Unrealistic company expiry input is rejected. No historical production dates were bulk rewritten.

The read-only affected-account audit confirmed active status, valid approved tax/register documents, duplicate categories and one very distant stored expiry. Private audit results stay outside Git.

## 15 — Request next actions, agreements and UCR
The top workflow panel shows the next concrete action for new quotations, accepted quotations and direct processing. UCR is available in the confirmed direct workflow without waiting for a nonexistent quotation. A customs stage still requires its reference before completion.

Reusable agreements must be expressly offered and accepted with reuse terms. Ordinary historical accepted quotes are not converted automatically. Eligibility is limited to the same customer, operation, services, route, quantities and validity. Applying an eligible agreement creates a request-bound immutable price snapshot with a source reference; the original quote is retained. No price or financial publication occurs merely by selecting direct processing.

## 16 — Execution dependencies and history
Transport precedes customs, then freight, then other explicitly requested services. Omitted and rejected services do not create artificial blockers. The server enforces inter-service and intra-service order. Opening the next service does not start it. Structured stage events include service and stage IDs, previous/new state, note and timestamp. Identical saves are no-ops. Historical generic events are retained in their own collapsible group.

Actual completion updates the request once. Reopening cannot erase later execution history. An administrator can reconcile an old request whose services are already completed, with a reason and current revision; no automatic bulk completion is performed. Completion does not publish or settle invoices.

## 17 — Container count
The common selector provides 1–10 and manual entry above 10, including Arabic digits. The API validates safe positive integers and rejects conflicting counts within one shipment. The request retains one shipment count; service copies are not summed and prices are not automatically multiplied. Legacy requests without counts stay unspecified.

## 18 — Release handover label
The existing release stage is renamed to تسليم الإذن / تسليم الإفراج / Permit / release handover. Its key, order and historical status remain unchanged.

## 19 — Final shipment documents
After real service completion, authorized staff can deliver private final documents from the request page. Customers see the section, waiting state, files and authenticated view/download links. Actual byte signatures, per-file size, upload journalling, revision guards and idempotent batch IDs protect uploads. Files are not company verification documents. Administrative archiving requires a reason, retains the object/history and prevents future customer downloads. Existing documents remain available with a notice after reopening.

## Validation and release
Local D1 fixtures cover account isolation, workflow decisions, agreements, stage dependencies, duplicate saves, terminal completion, counts, label preservation, final document replay/download/archive and integrity. Release metadata and live validation are kept privately. No synthetic production requests or invoices are created for testing. The production path is Cloudflare D1/R2; development should use an isolated local D1 configuration, never copied production credentials.

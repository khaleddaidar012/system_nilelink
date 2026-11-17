# Task 10 — Shipment Integration & Freight Order Binding

## 1. Task Name
Shipment Integration: Request Binding, Quote Prefilling & Operational Linking

## 2. Goal
Connect the Invoice Management System directly with Nile Link's shipment and service request operations (`CustomerRequest`). Staff members viewing a shipment at `app/[locale]/admin/requests/[id]/page.tsx` must be able to click "+ Create Invoice for Shipment", automatically binding both the customer and shipment, and prefilling relevant service charges or accepted quotation items.

---

## 3. Existing System
- [app/[locale]/admin/requests/[id]/page.tsx](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/requests/%5Bid%5D/page.tsx): Main operational shipment management page.
- [app/api/admin/requests/[id]/route.ts](file:///d:/khaled/nile_link_website-main/app/api/admin/requests/%5Bid%5D/route.ts): Fetches request, populated customer, services, and associated `Quote` and `QuoteItem` records.
- [lib/models/CustomerRequest.ts](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts): Model containing `trackingNumber`, `serviceType`, `services`, `complianceType`, `complianceNumber`.
- [lib/models/Quote.ts](file:///d:/khaled/nile_link_website-main/lib/models/Quote.ts) & [QuoteItem.ts](file:///d:/khaled/nile_link_website-main/lib/models/QuoteItem.ts): Existing quotation system.

---

## 4. Architectural Decision: Dynamic Reference vs Immutable Snapshot

### The Problem:
A shipment evolves over time: container numbers get updated, customs ACID codes get confirmed, tracking numbers might be re-issued, or shipments might eventually be archived/deleted. If an invoice only holds a dynamic foreign key `relatedRequestId`, any modification to the shipment record would alter the historical commercial document, violating accounting and legal audit regulations.

### The Solution:
We adopt a hybrid reference + snapshot pattern:
1. **Dynamic Reference (`relatedRequestId`)**: Active Mongoose `ref: "CustomerRequest"` used during drafting and for interactive dashboard navigation (e.g. clicking the tracking number link from the invoice table).
2. **Immutable Snapshot (`shipmentSnapshot`)**: When the invoice transitions from `draft` to `confirmed`, the system takes a frozen snapshot of key shipping metrics:
   ```typescript
   shipmentSnapshot: {
     requestId: request._id.toString(),
     trackingNumber: request.trackingNumber,
     serviceType: request.serviceType || "Freight Logistics",
     complianceType: request.complianceType,   // "ACID" or "UCR"
     complianceNumber: request.complianceNumber, // Egyptian MTS Nafeza ACID code
     origin: request.details?.originPort || request.details?.pickupAddress,
     destination: request.details?.destinationPort || request.details?.deliveryAddress,
   }
   ```
3. **Rendering Rule**: Any customer-facing view, public invoice page, or generated PDF reads primarily from `shipmentSnapshot` if present, falling back to dynamic population only for drafts.

---

## 5. Requirements & UX Flow

### 5.1 Shipment Details Action
In `app/[locale]/admin/requests/[id]/page.tsx`:
- Add an action button in the header and Financials section:
  **"[+] Issue Commercial Invoice"**
- Display a dedicated **"Invoices Linked to Shipment"** card showing any invoices already generated for this tracking number.

### 5.2 Intelligent Prefilling from Accepted Quotations
When the invoice modal opens with `requestId`:
1. Check if an approved `Quote` exists for this request (via `/api/admin/requests/[id]`).
2. If `quoteItems` exist, automatically pre-fill the invoice line items:
   - Line Item 1: Quote description & agreed unit price
   - Line Item 2: Customs clearance fee from quote
3. If no quote exists, prefill a default line item with the shipment service type (e.g., "Ocean Freight Shipping Services - Ref: " + `trackingNumber`).
4. Staff can adjust, add port charges, or apply discounts before saving.

---

## 6. Technical Implementation Details

### Files To Modify:
- `app/[locale]/admin/requests/[id]/page.tsx`:
  - Add "+ Issue Invoice" trigger button.
  - Mount `InvoiceFormModal` passing `initialCustomerId={request.customerId._id}` and `initialRequestId={request._id}`.
  - Add an "Invoices" section in the request details tabs or side column displaying linked invoice badges and payment progress.
- `app/api/admin/invoices/route.ts`:
  - Support query `GET /api/admin/invoices?requestId={id}` to fetch all invoices linked to a specific shipment.

---

## 7. Security Considerations
- Validate that the specified `relatedRequestId` belongs to the selected `customerId`. Prevent cross-customer shipment linking.
- Ensure compliance codes (such as Egypt's Nafeza ACID numbers) are properly sanitized to prevent XSS in PDF outputs.

---

## 8. Edge Cases Handled
- **Multiple Invoices for One Shipment**: In logistics, it is common to issue multiple invoices for a single shipment (e.g., Invoice 1: Sea Freight, Invoice 2: Customs Clearance & Taxes, Invoice 3: Storage Demurrage). The system supports 1-to-many relationships (`CustomerRequest` to `Invoice[]`).
- **Shipment Without Customer**: Rejected at validation layer; every shipment must link to a valid customer.

---

## 9. Acceptance Criteria
- [ ] Shipment details page has an active "Issue Commercial Invoice" action.
- [ ] Triggering the action pre-populates customer, shipment ID, and tracking number.
- [ ] If an accepted quotation exists, line items are automatically imported into the invoice editor.
- [ ] Linked invoices are listed directly on the shipment details page with their statuses.
- [ ] Shipment snapshot is generated and preserved upon invoice confirmation.

---

## 10. Testing Instructions
1. Open a shipment with tracking number (e.g. `TRK-10023`) at `/admin/requests/[id]`.
2. Click "Issue Commercial Invoice".
3. Verify customer and shipment tracking number are pre-filled in the modal.
4. Save as draft. Return to the shipment page and verify the invoice appears in the shipment's billing card.

---

## 11. Dependencies
- Depends on: `02-database-models.md`, `04-invoice-backend-api.md`, `07-create-invoice.md`
- Pre-requisite for: `11-draft-confirm-workflow.md`

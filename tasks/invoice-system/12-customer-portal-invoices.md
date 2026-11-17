# Task 12 — Customer Portal Invoices & IDOR Security Barrier

## 1. Task Name
Customer Portal Financials, Strict Draft Isolation & IDOR Protection

## 2. Goal
Secure and enhance the customer-facing financials portal at `app/[locale]/portal/financials/page.tsx`. Guarantee that customers can ONLY view confirmed commercial invoices belonging strictly to their verified company account. Fix existing security vulnerabilities where drafts could leak or tokens could be exploited, and provide intuitive view, print, and PDF download capabilities.

---

## 3. Existing System
- [app/[locale]/portal/financials/page.tsx](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/portal/financials/page.tsx): Customer financials dashboard page.
- [app/api/portal/financials/route.ts](file:///d:/khaled/nile_link_website-main/app/api/portal/financials/route.ts): Existing API with **CRITICAL DEFECT**: queries all invoices without excluding drafts.
- [app/api/invoice/[token]/route.ts](file:///d:/khaled/nile_link_website-main/app/api/invoice/%5Btoken%5D/route.ts): Public invoice token endpoint lacking draft status check.
- [components/portal/financials/InvoiceLivePreview.tsx](file:///d:/khaled/nile_link_website-main/components/portal/financials/InvoiceLivePreview.tsx): Customer preview component. Action buttons lack active click handlers.
- [components/portal/financials/InvoiceDetailsModal.tsx](file:///d:/khaled/nile_link_website-main/components/portal/financials/InvoiceDetailsModal.tsx): Modal dialog displaying invoice.

---

## 4. Security Audit & Remediation Plan

### 4.1 Vulnerability 1: Draft Exposure in Customer Portal
- **Current Vulnerability**: In `app/api/portal/financials/route.ts` line 35:
  ```typescript
  const invoices = await Invoice.find({ customerId }).sort({ createdAt: -1 }).lean()
  ```
  Draft invoices are fetched and transmitted in the JSON response payload to client browsers.
- **Fix**: Apply strict status filter:
  ```typescript
  const invoices = await Invoice.find({
    customerId,
    status: { $ne: "draft" },
  })
    .sort({ createdAt: -1 })
    .lean()
  ```

### 4.2 Vulnerability 2: Draft Exposure via Token Endpoint
- **Current Vulnerability**: In `app/api/invoice/[token]/route.ts` line 14:
  An unconfirmed draft invoice can be accessed if the token is obtained.
- **Fix**: Strictly verify status is not draft:
  ```typescript
  const invoice = await Invoice.findOne({
    token,
    status: { $ne: "draft" },
  }).lean()

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found or unavailable" }, { status: 404 })
  }
  ```

### 4.3 Vulnerability 3: IDOR Protection on Direct Fetching
- When a customer requests a specific invoice by ID, the API MUST enforce:
  ```typescript
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    customerId: session.customerId,
    status: { $ne: "draft" },
  }).lean()
  ```
  If a customer attempts to query another customer's invoice ID, the query returns `null`, yielding a safe `404 Not Found` without disclosing the existence of the document.

---

## 5. Requirements & UX Enhancements

### 5.1 Customer Portal Views
1. **Summary Metrics**:
   - Total Invoiced (only confirmed/sent/paid)
   - Total Amount Paid
   - Outstanding Balance
2. **Invoices Table**:
   - Invoice Number
   - Linked Shipment (Tracking # link)
   - Issue Date & Due Date
   - Amount & Currency
   - Payment Status Badge (`Confirmed`, `Sent`, `Partially Paid`, `Paid`, `Overdue`)
   - Actions: "View Details", "Download PDF", "Print"
3. **Live Invoice Details Modal**:
   - Opens responsive preview of the invoice.
   - Wire up action buttons:
     - **Print**: Triggers native `window.print()` with clean `@media print` CSS rules.
     - **Download PDF**: Triggers `/api/portal/invoices/[id]/pdf` stream.
     - **Copy Shareable Link**: Copies `https://domain/invoice/[token]` to clipboard with confirmation toast.

---

## 6. Technical Implementation Details

### Files To Modify:
- `app/api/portal/financials/route.ts`: Apply draft filter `{ customerId, status: { $ne: "draft" } }`.
- `app/api/invoice/[token]/route.ts`: Enforce `{ token, status: { $ne: "draft" } }`.
- `components/portal/financials/InvoiceLivePreview.tsx`:
  - Hook up `onPrint`, `onDownloadPdf`, `onCopyLink` button actions.
  - Read company information dynamically from `invoice.issuerSnapshot` instead of hardcoded strings.
  - Read customer information from `invoice.customerSnapshot`.
  - Read shipment details from `invoice.shipmentSnapshot`.

### Files To Create:
- `app/api/portal/invoices/[id]/route.ts`: Dedicated customer route for single invoice lookup with IDOR guard.
- `app/api/portal/invoices/[id]/pdf/route.ts`: Customer PDF download endpoint with IDOR verification.

---

## 7. Security Considerations
- **Internal Notes Stripping**: Ensure `internalNotes` is omitted from portal responses (`select: "-internalNotes"` or manual projection).
- **Session Verification**: Require authenticated customer session (`session.role === "customer" || session.role === "customer_admin"`).
- **Session Customer Match**: Always use `session.customerId` extracted from the cryptographically verified JWT, never from user-supplied query params or body.

---

## 8. Edge Cases Handled
- **Cancelled Invoices**: Display with distinct greyed-out visual styling and "Void / Cancelled" badge so the customer understands no payment is expected.
- **Multiple Linked Users**: If a customer company has multiple registered contacts (e.g. Finance Officer and Logistics Coordinator), both users associated with the same `customerId` can view their company's invoices.

---

## 9. Acceptance Criteria
- [ ] Draft invoices NEVER appear in `/api/portal/financials` or the customer portal UI.
- [ ] Draft invoices NEVER render via `/invoice/[token]` (returns 404).
- [ ] Attempting to access another company's invoice ID returns 404 (IDOR safe).
- [ ] Customer can view invoice details in modal.
- [ ] Action buttons (Print, Download PDF, Copy Link) function properly.
- [ ] Internal staff notes are completely hidden from customer responses.

---

## 10. Testing Instructions
1. Seed database with Customer A and Customer B.
2. Create Invoice 1 (Draft) for Customer A.
3. Create Invoice 2 (Confirmed) for Customer A.
4. Create Invoice 3 (Confirmed) for Customer B.
5. Log in as Customer A:
   - Check `/portal/financials`: Verify ONLY Invoice 2 appears. Invoice 1 (Draft) is NOT visible.
   - Attempt to fetch `/api/portal/invoices/[Invoice_3_Id]`: Verify 404 response.
   - Attempt to access Invoice 1 token URL: Verify 404 response.
   - Access Invoice 2 token URL: Verify clean render.

---

## 11. Dependencies
- Depends on: `02-database-models.md`, `11-draft-confirm-workflow.md`
- Pre-requisite for: `14-invoice-pdf.md`, `16-permissions-security.md`

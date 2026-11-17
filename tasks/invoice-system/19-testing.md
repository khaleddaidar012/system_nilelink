# Task 19 — Quality Assurance, Security Testing & Test Automation Matrix

## 1. Task Name
Comprehensive Test Automation Matrix, Security Boundary Audits & E2E Validation

## 2. Goal
Provide a complete testing protocol covering unit tests for mathematical accuracy and concurrency safety, API integration tests for permission and status state machines, IDOR security vulnerability sweeps, PDF/email attachment validation, and end-to-end user journeys for both staff and customers.

---

## 3. Existing System
- [TEST_GUIDE.md](file:///d:/khaled/nile_link_website-main/TEST_GUIDE.md) & [TESTING_GUIDE.md](file:///d:/khaled/nile_link_website-main/TESTING_GUIDE.md): Repository testing guides.
- Node.js test runner / TypeScript execution via `tsx` or `node --import`.

---

## 4. Test Suite Breakdown

### 4.1 Unit Test Suite: Financial Calculations (`scratch/test-calc.ts`)
| Test Case | Inputs | Expected Output | Assertion Target |
|---|---|---|---|
| Basic Line Item Math | 2 items: (2 x 1000), (3 x 500) | Subtotal: 3500.00 | Exact match |
| Floating Point Precision | 3 items: (0.1 x 100), (0.2 x 100), (0.3 x 100) | Subtotal: 60.00 | No `60.00000000000001` drift |
| Egyptian VAT 14% | Subtotal: 1000.00, TaxRate: 14% | Tax: 140.00, Total: 1140.00 | Exact currency match |
| Discount Capping | Subtotal: 500.00, Discount: 600.00 | Discount capped to 500.00, Error logged | No negative taxable base |
| Additional Charges | Subtotal: 1000.00, Charges: 200.00, Tax: 14% | Taxable base: 1200.00, Tax: 168.00, Total: 1368.00 | Proper VAT application |
| Negative Input Rejection | Quantity: -2 or Unit Price: -50 | Invalid result, errors reported | Validation failure |

### 4.2 Unit Test Suite: Atomic Number Generation (`scratch/test-sequence.ts`)
- **Concurrency Test**: Execute 20 concurrent invocations of `generateNextInvoiceNumber()`.
  - Assert that all 20 returned strings match regex `^INV-\d{4}-\d{6}$`.
  - Assert that all 20 returned strings are strictly distinct (no duplicates).
  - Assert that the sequence numbers are strictly incrementing without holes.

---

## 5. API Integration Test Matrix

```typescript
describe("Invoice API State Machine & Security", () => {
  // Test 1: Draft Creation
  test("Staff can create draft invoice; initial status is 'draft'", async () => { ... })

  // Test 2: Draft Editability
  test("Staff can update items and pricing on draft invoice", async () => { ... })

  // Test 3: Confirmation Gate
  test("Confirming invoice freezes snapshots and locks future edits", async () => { ... })

  // Test 4: Edit Rejection on Confirmed
  test("PUT /api/admin/invoices/[id] returns 400 if status is confirmed", async () => { ... })

  // Test 5: Draft Isolation in Portal
  test("GET /api/portal/financials excludes all draft invoices", async () => { ... })

  // Test 6: Public Token Draft Isolation
  test("GET /api/invoice/[token] returns 404 if status is draft", async () => { ... })

  // Test 7: IDOR Protection
  test("Customer A cannot access Customer B invoice ID (returns 404)", async () => { ... })

  // Test 8: Non-Staff Access Rejection
  test("Customer session cannot access /api/admin/invoices (returns 403)", async () => { ... })
})
```

---

## 6. End-to-End User Verification Flows

### Flow A: The Full Lifecycle
1. Staff logs in -> visits `/admin/invoices`.
2. Clicks "+ Create Invoice" -> selects Customer Apex Trade.
3. Adds 2 line items -> observes live subtotal and VAT.
4. Clicks "Save as Draft" -> verifies invoice appears in table with amber "Draft" badge.
5. Verifies customer logs into `/portal/financials` -> **Invoice is NOT present**.
6. Staff opens Review Drawer -> inspects values -> clicks "Confirm Invoice".
7. Customer refreshes `/portal/financials` -> **Invoice is NOW visible**.
8. Staff clicks "Send Invoice" -> email dispatched with PDF attachment.
9. Customer clicks "Download PDF" -> valid A4 PDF downloads.

### Flow B: Customer Details Contextual Flow
1. Staff navigates to `/admin/customers/[id]`.
2. Selects "Invoices & Billing" tab.
3. Clicks "+ Create Invoice".
4. Verifies Customer name is locked and only this customer's shipments appear in dropdown.
5. Saves invoice -> verifies it appears immediately in the customer's billing tab.

### Flow C: Shipment Operations Flow
1. Staff navigates to `/admin/requests/[id]`.
2. Clicks "Issue Commercial Invoice".
3. Verifies shipment tracking number and customer are locked.
4. Saves draft -> verifies invoice links to shipment in both admin and portal.

---

## 7. Acceptance Criteria
- [ ] All unit tests in `scratch/test-calc.ts` pass with 100% precision.
- [ ] Concurrency test proves zero duplicate invoice numbers under rapid parallel execution.
- [ ] All 8 security integration tests pass.
- [ ] Draft isolation verified across all customer-facing endpoints.
- [ ] IDOR tests confirm complete tenant boundary isolation.

---

## 8. Dependencies
- Depends on: All previous tasks (`01` through `18`).
- Pre-requisite for: `20-final-integration.md`

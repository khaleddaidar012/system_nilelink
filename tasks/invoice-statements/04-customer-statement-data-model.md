# Task 04: Customer Statement Data Model & Ledger Contracts

## Objective
Design and specify the data contracts, ledger entry schemas, and aggregation pipelines for the Customer Statement system. Ensure the statement operates strictly as a calculated financial view over Nile Link Logistics' real source-of-truth records (Shipments, Invoices, Payments, Credits), guaranteeing zero data duplication and zero balance desynchronization.

## Existing System Analysis
1. **Existing Source-of-Truth Collections**:
   - [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Invoices for customer (`customerId`), carrying `invoiceNumber`, `totalAmount`, `paidAmount`, `remainingAmount`, `tax`, `discount`, `additionalCharges`, `issueDate`, `status`, `relatedRequestId`.
   - [`lib/models/Payment.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts): Payment receipts (`customerId`, `invoiceId`, `amount`, `paymentDate`, `referenceNumber`, `paymentMethod`, `notes`).
   - [`lib/models/CustomerRequest.ts`](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts): Shipment orders (`customerId`, `trackingNumber`, `serviceType`, `createdAt`, `status`).
2. **Current Balances**:
   - There is NO separate "customer balance table" in the database. Customer balance is currently calculated on-the-fly or per-invoice. This design must be maintained to avoid distributed state anomalies.
3. **Missing Payment Logging Endpoint**:
   - While `Payment` schema exists in [`lib/models/Payment.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts), there is no official API to register incoming customer payments that update `Invoice.paidAmount` and ledger credits.

## Requirements
1. **Define Core TypeScript Interfaces**:
   Create [`types/customer-statement.ts`](file:///d:/khaled/nile_link_website-main/types/customer-statement.ts):
   ```typescript
   export type LedgerTransactionType = "shipment_charge" | "invoice" | "payment" | "discount" | "adjustment"

   export interface ICustomerLedgerEntry {
     id: string
     date: string // ISO Date string
     type: LedgerTransactionType
     description: string
     reference: string // e.g. "INV-2026-0001", "TRK-NL-83921", "PAY-CIB-9021"
     relatedShipmentTracking?: string
     relatedInvoiceNumber?: string
     debit: number // Customer debt increases (Invoices / Charges)
     credit: number // Customer payment / credit increases (Payments / Discounts)
     balance: number // Running balance after this transaction
     currency: string
     status?: string
     notes?: string
   }

   export interface ICustomerStatementSummary {
     openingBalance: number
     totalDebit: number
     totalCredit: number
     closingBalance: number
     currency: string
     periodStart?: string
     periodEnd?: string
     totalTransactions: number
   }

   export interface ICustomerStatement {
     customer: {
       id: string
       companyName: string
       commercialRegisterNumber?: string
       taxCardNumber?: string
       contactEmail: string
       contactPhone?: string
       address?: string
     }
     period: {
       from: string
       to: string
     }
     generatedAt: string
     generatedBy: {
       id: string
       name: string
       email: string
     }
     summary: ICustomerStatementSummary
     entries: ICustomerLedgerEntry[]
   }

   export interface StatementFilterQuery {
     customerId: string
     fromDate?: string
     toDate?: string
     type?: "all" | "shipments" | "invoices" | "payments"
     currency?: string
   }
   ```
2. **Ledger Double-Entry Conventions**:
   - **Debit (مدين)**: Increases customer liability to Nile Link.
     - Confirmed / Issued Invoices (`invoice.totalAmount`).
     - Specific ad-hoc shipment surcharges or billable logistics items.
   - **Credit (دائن)**: Decreases customer liability.
     - Payments recorded (`payment.amount`).
     - Standalone discounts or credit adjustments.
   - **Running Balance (الرصيد)**:
     - `Balance = Previous Balance + Debit - Credit`.
3. **Data Integrity Guarantee**:
   - Do NOT store pre-computed statement snapshots as permanent duplicate records in MongoDB.
   - The statement is generated in real-time by querying active Invoices and Payments for the specified customer ID and date interval.
4. **Payment Registration Capability**:
   - Support recording a payment against an invoice or customer via a clean endpoint `POST /api/admin/payments` (or `/api/admin/invoices/[id]/payments`), updating the invoice's `paidAmount` and creating the corresponding `Payment` record.

## Files Likely To Change
- New interface file: [`types/customer-statement.ts`](file:///d:/khaled/nile_link_website-main/types/customer-statement.ts)
- [`lib/models/Payment.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts) (ensure customerId index is optimized: `{ customerId: 1, paymentDate: 1 }`)
- [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts) (index: `{ customerId: 1, issueDate: 1, status: 1 }`)
- New API route: [`app/api/admin/payments/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/payments/route.ts)

## Backend Changes
- Ensure index on `PaymentSchema`:
  ```typescript
  PaymentSchema.index({ customerId: 1, paymentDate: 1 })
  ```
- Ensure index on `InvoiceSchema`:
  ```typescript
  InvoiceSchema.index({ customerId: 1, issueDate: 1, status: 1 })
  ```
- Implement `POST /api/admin/payments`:
  - Validates `invoiceId`, `customerId`, `amount`, `paymentMethod`, `paymentDate`, `referenceNumber`.
  - Atomically increments `invoice.paidAmount` and updates invoice status (`partially_paid` or `paid`).
  - Creates `Payment` record.

## Frontend Changes
- Export shared types for statement rendering in React components.

## Security / Permissions
- Viewing statements requires `viewCustomerStatements` (or `super_admin`).
- Recording payments requires `canManageInvoices` or staff role.

## Edge Cases
- **Draft & Cancelled Invoices**: Draft and cancelled invoices MUST NOT appear in customer ledger balances or statements. Only confirmed, sent, partially paid, paid, and overdue invoices represent actual debt.
- **Overpayment**: If a customer pays more than an invoice total, the credit balance carries forward into the running balance as a negative net liability (credit balance).
- **Zero Transactions Period**: If no transactions exist between `fromDate` and `toDate`, the statement should display zero entries with `Closing Balance = Opening Balance`.

## Acceptance Criteria
- [ ] TypeScript contract `ICustomerStatement` and `ICustomerLedgerEntry` formally defined.
- [ ] Ledger rules for Debit, Credit, and Running Balance documented.
- [ ] Zero database duplication verified: statements are pure queries, not duplicate balance tables.
- [ ] Index optimization applied to `Payment` and `Invoice` models.
- [ ] Payment creation endpoint implemented to link payments with invoices and customer records cleanly.

## Dependencies
- **Task 01**: Analyze Current Financial & Document Architecture.
- **Task 02**: Financial Document Type Architecture & Data Separation.
- **Task 03**: Tax Invoice & Financial Permissions Architecture.

## Testing
- Unit test ledger entry mapping against sample mock invoices and payments.
- Verify running balance arithmetic: `Opening (10,000) + Invoices (5,000) - Payments (7,000) = Closing (8,000)`.

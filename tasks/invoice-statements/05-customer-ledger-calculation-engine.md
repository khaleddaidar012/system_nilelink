# Task 05: Customer Ledger Calculation Engine

## Objective
Develop a robust, high-performance financial calculation engine (`lib/engine/customer-ledger-engine.ts`) that builds the customer's chronological ledger. The engine computes:
1. **Opening Balance**: The exact accumulated net balance prior to the selected `From Date`.
2. **In-Period Ledger Entries**: Chronologically ordered debit and credit entries with running balances.
3. **Period Summary**: Total Debits, Total Credits, and Closing Balance.
4. **Multi-Faceted Filtering**: Support for date range (`From Date -> To Date`) and transaction category filtering (`All`, `Shipments`, `Invoices`, `Payments`).

## Existing System Analysis
1. [`lib/engine/invoice-calculator.ts`](file:///d:/khaled/nile_link_website-main/lib/engine/invoice-calculator.ts):
   - Currently computes individual invoice totals (subtotal, tax, discount, additional charges, totalAmount).
2. Existing Query Logic in Invoices & Payments:
   - [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Invoices contain `issueDate`, `totalAmount`, `status`, `relatedRequestId`.
   - [`lib/models/Payment.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts): Payments contain `paymentDate`, `amount`, `referenceNumber`, `invoiceId`.
   - Customer Requests in [`lib/models/CustomerRequest.ts`](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts): Provide tracking numbers and service descriptions.

## Requirements
1. **Create Engine Module**:
   Implement [`lib/engine/customer-ledger-engine.ts`](file:///d:/khaled/nile_link_website-main/lib/engine/customer-ledger-engine.ts):
   ```typescript
   export interface ComputeLedgerOptions {
     customerId: string
     fromDate?: Date | string
     toDate?: Date | string
     filterType?: "all" | "shipments" | "invoices" | "payments"
     currency?: string
   }

   export async function generateCustomerLedger(options: ComputeLedgerOptions): Promise<ICustomerStatement>
   ```

2. **Step 1: Calculate Opening Balance (Prior to `fromDate`)**:
   - If `fromDate` is specified:
     - Query all non-draft, non-cancelled invoices with `issueDate < fromDate` for this customer.
       - Sum of `totalAmount` = Historical Debits ($D_{prior}$).
     - Query all payments with `paymentDate < fromDate` for this customer.
       - Sum of `amount` = Historical Credits ($C_{prior}$).
     - $\text{Opening Balance} = D_{prior} - C_{prior}$.
   - If `fromDate` is NOT specified (all-time statement):
     - $\text{Opening Balance} = 0$.

3. **Step 2: Collect In-Period Transactions**:
   - Query invoices with `issueDate >= fromDate && issueDate <= toDate`:
     - Exclude `draft` and `cancelled`.
     - Create a Debit ledger item:
       - Date: `invoice.issueDate`
       - Description: `فاتورة مبيعات / خدمات شحن` (Sales Invoice / Freight Services)
       - Reference: `invoice.invoiceNumber`
       - Related Shipment: `invoice.shipmentSnapshot?.trackingNumber || invoice.relatedRequestId?.trackingNumber`
       - Debit: `invoice.totalAmount`
       - Credit: 0
   - Query payments with `paymentDate >= fromDate && paymentDate <= toDate`:
     - Create a Credit ledger item:
       - Date: `payment.paymentDate`
       - Description: `سداد عميل - ${payment.paymentMethod}` (Payment Received)
       - Reference: `payment.referenceNumber || payment._id`
       - Debit: 0
       - Credit: `payment.amount`

4. **Step 3: Chronological Sorting & Running Balance Calculation**:
   - Merge all in-period items into a single array.
   - Sort chronologically:
     - Ascending order: `new Date(a.date).getTime() - new Date(b.date).getTime()`.
     - In case of exact timestamp collision, Invoices precede Payments.
   - Calculate running balance:
     ```typescript
     let running = openingBalance
     for (const entry of sortedEntries) {
       running = running + entry.debit - entry.credit
       entry.balance = Math.round(running * 100) / 100
     }
     ```

5. **Step 4: Transaction Type Filtering**:
   - If `filterType === "invoices"`: Display only Invoice entries.
   - If `filterType === "payments"`: Display only Payment entries.
   - If `filterType === "shipments"`: Display entries with linked shipment tracking.
   - If `filterType === "all"`: Display all entries.
   - *Crucial Ledger Rule*: The running balance in each row must maintain total account continuity or clearly reflect filtered sub-balances. (Best practice: Calculate full account running balance, then filter visible rows, or display both running balance and line impact).

6. **Step 5: Closing Balance & Summary**:
   - $\text{Total Debit} = \sum \text{in-period Debits}$
   - $\text{Total Credit} = \sum \text{in-period Credits}$
   - $\text{Closing Balance} = \text{Opening Balance} + \text{Total Debit} - \text{Total Credit}$

## Files Likely To Change
- New calculation engine: [`lib/engine/customer-ledger-engine.ts`](file:///d:/khaled/nile_link_website-main/lib/engine/customer-ledger-engine.ts)
- Types file: [`types/customer-statement.ts`](file:///d:/khaled/nile_link_website-main/types/customer-statement.ts)

## Backend Changes
- Server-side MongoDB queries utilizing indexed fields (`issueDate`, `paymentDate`, `customerId`, `status`).
- Aggregation pipelines or Promise.all queries fetching invoices and payments concurrently.

## Frontend Changes
- `N/A` (Engine is encapsulated in backend / lib).

## Security / Permissions
- Internal engine logic; requires customer ID validation to ensure multi-tenant boundary compliance.

## Edge Cases
- **Customer with No Prior History**:
  - `Opening Balance = 0`, `Closing Balance = 0`, empty entries list.
- **Negative Balance (Customer in Credit)**:
  - When payments exceed invoices, running balance is negative. Must be formatted cleanly (e.g., `-1,500.00 EGP (Credit / رصيد دائن)`).
- **Time Zone Offsets**:
  - When filtering by `toDate` (e.g. `2026-10-31`), ensure the query spans through the end of the day `23:59:59.999Z` to avoid omitting transactions occurring on the target date.

## Acceptance Criteria
- [ ] Engine accurately calculates opening balance prior to `fromDate`.
- [ ] Chronological sorting correctly sequences items occurring on different dates.
- [ ] Running balance strictly equals `Previous + Debit - Credit`.
- [ ] Closing balance strictly equals `Opening + Total Debit - Total Credit`.
- [ ] End-of-day boundary handling implemented for `toDate`.
- [ ] Unit tests pass for varied customer transaction histories.

## Dependencies
- **Task 01**: Analyze Current Financial & Document Architecture.
- **Task 04**: Customer Statement Data Model & Ledger Contracts.

## Testing
- Write automated test script (`scripts/test-ledger-engine.ts` or scratch test):
  - Case 1: Customer with 3 invoices and 2 payments inside the period.
  - Case 2: Customer with transactions before and during the period. Check opening balance.
  - Case 3: Customer with 0 transactions.

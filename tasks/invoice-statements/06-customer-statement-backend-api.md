# Task 06: Customer Statement Backend API & Payment Endpoints

## Objective
Implement secure, performant REST API endpoints to generate customer statements dynamically on the server (`GET /api/admin/customers/[id]/statement`) and record customer payments (`POST /api/admin/payments`). Ensure strict server-side permission validation using `viewCustomerStatements` and `canManageInvoices`.

## Existing System Analysis
1. Existing Customer API:
   - [`app/api/admin/customers/[id]/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/customers/%5Bid%5D/route.ts): Fetches customer details, users, compliance stats, documents.
2. Invoices API:
   - [`app/api/admin/invoices/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/route.ts): Lists invoices with customer and date filtering.
3. Permission Guard:
   - [`lib/auth/require-permission.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts): `assertStaffPermission(request, permissionKey)`.
4. Missing Statement & Payment Routes:
   - No route currently exists under `/api/admin/customers/[id]/statement`.
   - No standalone route exists to record payments (`/api/admin/payments`).

## Requirements
1. **Customer Statement API Endpoint**:
   - Create route [`app/api/admin/customers/[id]/statement/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/customers/%5Bid%5D/statement/route.ts):
   - **Method**: `GET`
   - **Route Params**: `id` (Customer ID)
   - **Query Parameters**:
     - `fromDate` (optional string, e.g. `2026-01-01`)
     - `toDate` (optional string, e.g. `2026-10-31`)
     - `type` (optional enum: `"all"` | `"shipments"` | `"invoices"` | `"payments"`, default: `"all"`)
     - `currency` (optional string, default: `"EGP"`)
   - **Authorization**:
     - Check `assertStaffPermission(req, "viewCustomerStatements")` (Super Admin bypasses).
   - **Validation**:
     - Ensure `id` is a valid MongoDB `ObjectId`.
     - Ensure Customer exists; return 404 if not found.
     - Validate date formats; return 400 if invalid.
   - **Response Format**:
     ```json
     {
       "success": true,
       "statement": {
         "customer": { ... },
         "period": { "from": "...", "to": "..." },
         "generatedAt": "2026-10-01T12:00:00.000Z",
         "generatedBy": { "id": "...", "name": "...", "email": "..." },
         "summary": {
           "openingBalance": 15000.00,
           "totalDebit": 52000.00,
           "totalCredit": 40000.00,
           "closingBalance": 27000.00,
           "currency": "EGP",
           "totalTransactions": 8
         },
         "entries": [ ... ]
       }
     }
     ```

2. **Payment Recording API Endpoint**:
   - Create route [`app/api/admin/payments/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/payments/route.ts):
   - **Method**: `POST`
   - **Authorization**:
     - Check `session.role === "staff" || session.role === "super_admin"`.
   - **Zod Schema**:
     ```typescript
     const CreatePaymentSchema = z.object({
       customerId: z.string().min(1),
       invoiceId: z.string().min(1),
       amount: z.number().positive("Payment amount must be greater than zero"),
       currency: z.string().default("EGP"),
       paymentMethod: z.enum(["bank_transfer", "credit_card", "cash", "cheque", "other"]),
       paymentDate: z.string().optional(),
       referenceNumber: z.string().optional(),
       notes: z.string().optional(),
     })
     ```
   - **Business Logic**:
     - Fetch invoice by `invoiceId`.
     - Update invoice `paidAmount = paidAmount + amount`.
     - Pre-save hook or manual status logic triggers:
       - If `paidAmount >= totalAmount` -> `status = "paid"`.
       - If `paidAmount > 0 && paidAmount < totalAmount` -> `status = "partially_paid"`.
     - Save invoice and create `Payment` document.
     - Log action in `InvoiceActivityLog`.

## Files Likely To Change
- New route: [`app/api/admin/customers/[id]/statement/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/customers/%5Bid%5D/statement/route.ts)
- New route: [`app/api/admin/payments/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/payments/route.ts)
- Calculation engine: [`lib/engine/customer-ledger-engine.ts`](file:///d:/khaled/nile_link_website-main/lib/engine/customer-ledger-engine.ts)

## Backend Changes
- Integrate `generateCustomerLedger` within the statement route.
- Implement atomic invoice updates and payment registration.

## Frontend Changes
- `N/A` (APIs consumed by frontend in subsequent tasks).

## Security / Permissions
- Unauthenticated requests return 401.
- Staff members without `viewCustomerStatements` receive 403.
- Super admin bypass verified.
- Cross-customer leak prevention: the query strictly restricts transactions to `customerId`.

## Edge Cases
- Invalid Date Strings (e.g. `fromDate=invalid-date`): Handled gracefully with `400 Bad Request` instead of uncaught server crash.
- `fromDate` later than `toDate`: Validation catches this and returns `400 Bad Request` ("From Date cannot be later than To Date").

## Acceptance Criteria
- [ ] `GET /api/admin/customers/[id]/statement` returns complete calculated ledger with summary.
- [ ] Permission check enforces `viewCustomerStatements`.
- [ ] Query params `fromDate`, `toDate`, `type` correctly filter ledger output.
- [ ] `POST /api/admin/payments` records payments, adjusts invoice amounts, and reflects in ledger.
- [ ] API responses follow standard Nile Link JSON conventions.

## Dependencies
- **Task 03**: Tax Invoice & Financial Permissions Architecture.
- **Task 04**: Customer Statement Data Model & Ledger Contracts.
- **Task 05**: Customer Ledger Calculation Engine.

## Testing
- Execute GET request with valid customer ID and date parameters; verify response structure.
- Execute GET request with unauthorized token; verify 403.
- Execute POST `/api/admin/payments` with valid payment payload; verify invoice status updates to `partially_paid` or `paid` and payment appears in statement entries.

# Task 01: Analyze Current Financial & Document Architecture

## Objective
Perform a comprehensive audit and architectural mapping of Nile Link Logistics' existing financial, shipment, payment, PDF generation, customer account, and permission systems. This task provides the baseline technical findings needed to implement the Financial Document Type System and Customer Account Statements with zero regression risk and zero data duplication.

## Existing System Analysis
The following active files and modules in the repository have been inspected:

1. **Invoice Data Model & Lifecycle**:
   - [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Defines `IInvoice` with fields `customerId`, `invoiceNumber`, `relatedQuoteId`, `relatedRequestId`, `subtotal`, `taxRate`, `tax`, `discount`, `additionalCharges`, `totalAmount`, `paidAmount`, `remainingAmount`, `currency`, `items`, `status` (`draft`, `confirmed`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled`), `issueDate`, `dueDate`, `token`, `customerSnapshot`, `shipmentSnapshot`, `issuerSnapshot`.
   - Pre-save hook computes `remainingAmount = Math.max(0, totalAmount - paidAmount)` and updates payment status.
   - Hardcoded document assumptions exist in both the model comments and generators treating every record solely as a "Commercial Invoice".

2. **Customer Model & Profile Management**:
   - [`lib/models/Customer.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Customer.ts): Defines `ICustomer` (`companyName`, `commercialRegisterNumber`, `taxCardNumber`, `contactEmail`, `contactPhone`, `accountStatus`, `assignedStaffId`, etc.).
   - [`app/[locale]/admin/customers/[id]/page.tsx`](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx): Main customer details page featuring tabs `documents`, `invoices`, `governance`, `profile`.
   - [`components/admin/customers/CustomerInvoicesTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerInvoicesTab.tsx): Embedded invoice listing component within customer profile.

3. **Shipments & Service Requests**:
   - [`lib/models/CustomerRequest.ts`](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts): Represents customer shipment and operational requests with `trackingNumber`, `serviceType`, `services`, `status`, `timeline`, `complianceNumber` (ACID/UCR).
   - [`lib/models/RequestService.ts`](file:///d:/khaled/nile_link_website-main/lib/models/RequestService.ts): Linked multi-service items under a shipment.
   - [`lib/models/Quote.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Quote.ts): Financial quotations tied to `CustomerRequest` and `Customer`.

4. **Payments System**:
   - [`lib/models/Payment.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts): Schema defining `invoiceId`, `customerId`, `amount`, `currency`, `paymentMethod` (`bank_transfer`, `credit_card`, `cash`, `cheque`, `other`), `paymentDate`, `referenceNumber`, `notes`.
   - Payments are currently read in `/api/admin/invoices/[id]` and public `/api/invoice/[token]`, but there is no dedicated payment recording/listing endpoint for standalone customer transactions or credit ledgers.

5. **PDF Generation Infrastructure**:
   - [`lib/services/invoice-pdf-generator.ts`](file:///d:/khaled/nile_link_website-main/lib/services/invoice-pdf-generator.ts): Pure vector PDF generator built with `pdfkit` and `naqqash` (for Arabic RTL glyph shaping and bidirectional text flow).
   - Currently hardcodes title at line 78: `COMMERCIAL INVOICE`.
   - Fonts used: Amiri (`public/fonts/Amiri-Regular.ttf`, `Amiri-Bold.ttf`) and Arial fallback.

6. **Permissions & Roles Architecture**:
   - [`lib/models/User.ts`](file:///d:/khaled/nile_link_website-main/lib/models/User.ts): Defines `IStaffPermissions` with only 3 baseline keys: `canSendAlerts`, `canReviewDocuments`, `canManageCustomers`.
   - [`lib/models/RoleConfig.ts`](file:///d:/khaled/nile_link_website-main/lib/models/RoleConfig.ts): Role configuration schema mirroring `IStaffPermissions`.
   - [`lib/auth/require-permission.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts): `assertStaffPermission(request, permissionKey)` used for server-side authorization. Super_admin bypasses specific checks.
   - [`lib/auth/token-service.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/token-service.ts): Serializes `staffPermissions` inside the signed JWT session.

7. **Email System**:
   - [`lib/email/send.ts`](file:///d:/khaled/nile_link_website-main/lib/email/send.ts) and [`lib/email/types.ts`](file:///d:/khaled/nile_link_website-main/lib/email/types.ts): Existing email sending infrastructure supporting multi-provider dispatch (SMTP/Resend) with binary file attachments (`EmailAttachment[]`).
   - [`app/api/admin/invoices/[id]/send/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/send/route.ts): Working example of generating PDF in-memory and dispatching it as an email attachment.

## Requirements
1. Document current data flows across Invoices, Requests, Payments, and Customers.
2. Identify architectural gaps between current state and target requirements:
   - Need for financial document title polymorphism (`كشف حساب`, `فاتورة`, `فاتورة ضريبية`).
   - Need for fine-grained permissions (`issueTaxInvoice`, `createInvoice`, `editInvoice`, `viewCustomerStatements`, `exportCustomerStatements`, `sendFinancialDocuments`).
   - Need for dynamic ledger calculation (Debits vs Credits, Running Balance, Opening/Closing balance by date range).
   - Need for customer account statement UI and PDF generator.
3. Formulate data integrity rules guaranteeing that existing balances and invoices are never cloned or desynchronized.

## Files Likely To Change
*Note: This is an analysis task; no application code is modified in this task.*
Reference documentation files to inspect:
- [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts)
- [`lib/models/Payment.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts)
- [`lib/models/Customer.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Customer.ts)
- [`lib/models/CustomerRequest.ts`](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts)
- [`lib/models/User.ts`](file:///d:/khaled/nile_link_website-main/lib/models/User.ts)
- [`lib/auth/require-permission.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts)
- [`lib/services/invoice-pdf-generator.ts`](file:///d:/khaled/nile_link_website-main/lib/services/invoice-pdf-generator.ts)
- [`app/[locale]/admin/customers/[id]/page.tsx`](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx)
- [`app/api/admin/invoices/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/route.ts)

## Backend Changes
`N/A` (Documentation and audit phase)

## Frontend Changes
`N/A` (Documentation and audit phase)

## Security / Permissions
- Current `assertStaffPermission` only protects based on `canSendAlerts`, `canReviewDocuments`, and `canManageCustomers`.
- Financial endpoints (`/api/admin/invoices/...`) currently only verify `session.role === "staff" || session.role === "super_admin"` without checking specific financial capabilities.
- Direct API generation of Tax Invoices must be guarded by `issueTaxInvoice`.

## Edge Cases
- Historical invoices created before document polymorphism must safely default to `statement` or `invoice` without data migration failures.
- Customers with zero payments or zero invoices must calculate cleanly with zero balance.
- Multi-currency scenarios: the system currently uses `currency: "EGP"` predominantly, but supports currency strings (`USD`, `EUR`). The ledger must respect transaction currency groupings.

## Acceptance Criteria
- [ ] Complete inventory of all existing financial schemas and relationships documented.
- [ ] Identification of all hardcoded titles in PDF generator and UI tables.
- [ ] Verification of existing email dispatch capabilities with attachments.
- [ ] Mapping of permissions schema and role configuration hierarchy.
- [ ] Written confirmation of zero duplicate data strategy for statements.

## Dependencies
None (Initial baseline task).

## Testing
Verify that all existing test scripts and model imports run cleanly (`npm run build` or schema check).

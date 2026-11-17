# Task 10: Statement Export, Print, and Email Dispatch

## Objective
Implement end-to-end preview, physical printing, PDF export, and direct email dispatch workflows for Customer Account Statements. Allow authorized personnel to email a formal statement directly to the customer's contact email with the generated PDF attached, leveraging Nile Link's existing email service infrastructure ([`lib/email/send.ts`](file:///d:/khaled/nile_link_website-main/lib/email/send.ts)).

## Existing System Analysis
1. Email Dispatch System:
   - [`lib/email/send.ts`](file:///d:/khaled/nile_link_website-main/lib/email/send.ts): `sendEmail(options)` handles binary attachments via `EmailAttachment[]`.
   - [`app/api/admin/invoices/[id]/send/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/send/route.ts): Working example of attaching a generated PDF buffer to an email dispatched to a client.
   - [`lib/email/templates/invoice-email.ts`](file:///d:/khaled/nile_link_website-main/lib/email/templates/invoice-email.ts): HTML email template with Nile Link branding.
2. Send Invoice Dialog Component:
   - [`components/admin/invoices/SendInvoiceDialog.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/SendInvoiceDialog.tsx): Headless UI modal for confirming recipient email and triggering send.
3. Statement PDF Service:
   - Built in Task 08 (`lib/services/statement-pdf-generator.ts`).

## Requirements
1. **Email HTML Template**:
   Create [`lib/email/templates/statement-email.ts`](file:///d:/khaled/nile_link_website-main/lib/email/templates/statement-email.ts):
   - Executive bilingual layout (Arabic & English).
   - Nile Link Logistics logo and header.
   - Client greeting with company name.
   - Statement period summary: `From: [Date] | To: [Date]`.
   - Financial figures highlight:
     - Opening Balance.
     - Total Charges / Invoices.
     - Total Payments.
     - Net Balance Due.
   - Notice: "يرجى الاطلاع على كشف الحساب المالي المفصل المرفق بهذا البريد بصيغة PDF" (Please find your detailed account statement attached as a PDF).
   - Nile Link Finance & Accounts Department contact details.

2. **Backend Statement Send Endpoint**:
   - Create route [`app/api/admin/customers/[id]/statement/send/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/customers/%5Bid%5D/statement/send/route.ts):
   - **Method**: `POST`
   - **Route Params**: `id` (Customer ID)
   - **Payload**:
     ```typescript
     {
       fromDate?: string,
       toDate?: string,
       recipientEmail?: string,
       customMessage?: string
     }
     ```
   - **Authorization**:
     - Check `assertStaffPermission(req, "sendFinancialDocuments")` (Super admin bypasses).
   - **Execution Steps**:
     1. Retrieve customer and recipient email (defaulting to `customer.contactEmail`).
     2. Call `generateCustomerLedger({ customerId, fromDate, toDate })`.
     3. Call `generateCustomerStatementPdfBuffer(statement)`.
     4. Generate email HTML using `getStatementEmailTemplate(...)`.
     5. Call `sendEmail` with PDF buffer attachment:
        ```typescript
        attachments: [
          {
            filename: `Statement-${customer.companyName}-${fromDate || "all"}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf"
          }
        ]
        ```
     6. Return success confirmation with timestamp and recipient address.

3. **Frontend Send Dialog**:
   Create [`components/admin/customers/SendStatementDialog.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/SendStatementDialog.tsx):
   - Pre-populates customer contact email with option to add CC or edit recipient.
   - Displays period date summary and closing balance before dispatch.
   - Includes optional custom message textarea.
   - Dispatches `POST /api/admin/customers/[id]/statement/send`.
   - Displays loading state and success toast.

4. **Print Optimization**:
   - Support one-click browser print:
     - Open `/api/admin/customers/[id]/statement/pdf` in a dedicated print window or iframe with `window.print()`.
     - In `CustomerStatementTab.tsx`, include CSS `@media print` rules hiding sidebars, header ribbons, and filter toolbars so direct window printing cleanly formats the ledger table.

## Files Likely To Change
- New email template: [`lib/email/templates/statement-email.ts`](file:///d:/khaled/nile_link_website-main/lib/email/templates/statement-email.ts)
- New route: [`app/api/admin/customers/[id]/statement/send/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/customers/%5Bid%5D/statement/send/route.ts)
- New dialog component: [`components/admin/customers/SendStatementDialog.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/SendStatementDialog.tsx)
- Tab component: [`components/admin/customers/CustomerStatementTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerStatementTab.tsx)

## Backend Changes
- Server-side email generation integrating `pdfkit` buffer with `sendEmail`.
- Safe handling of email delivery errors with descriptive user messages.

## Frontend Changes
- Connect "إرسال للعميل (Email Statement)" button to `SendStatementDialog`.
- Connect "تحميل PDF" and "طباعة" buttons to `/api/admin/customers/[id]/statement/pdf`.

## Security / Permissions
- Enforce `sendFinancialDocuments` permission on `/statement/send`.
- Enforce `exportCustomerStatements` on `/statement/pdf`.
- Validate recipient email format to prevent header injection.

## Edge Cases
- **Missing Customer Email**: If customer record lacks `contactEmail`, prompt the employee to manually enter a valid recipient email in the dialog.
- **Email Server Timeout / Failure**: Handle SMTP/Resend connection errors gracefully, returning `{ error: "Email delivery failed: ..." }` without crashing the server.

## Acceptance Criteria
- [ ] Responsive email template created with Nile Link branding and statement summary.
- [ ] Backend route `/api/admin/customers/[id]/statement/send` delivers email with attached PDF.
- [ ] Send dialog pre-fills customer email and allows custom messages.
- [ ] Permission check blocks unauthorized employees from emailing financial statements.
- [ ] Print action triggers high-quality printable document.

## Dependencies
- **Task 05**: Customer Ledger Calculation Engine.
- **Task 06**: Customer Statement Backend API & Payment Endpoints.
- **Task 08**: Professional Customer Statement PDF Generator.
- **Task 09**: Customer Details Page Statement UI Integration.

## Testing
- Trigger "Email Statement" from Customer Details page; confirm email received with valid attached PDF.
- Verify PDF attachment in email can be opened and reflects the selected date filters.
- Attempt email send with account lacking `sendFinancialDocuments`; confirm 403 Forbidden.

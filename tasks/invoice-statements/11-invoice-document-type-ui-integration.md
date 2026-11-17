# Task 11: Invoice UI Integration for Document Types & Tax Invoices

## Objective
Update Nile Link Logistics' invoice management user interfaces to fully support the new Document Type system. Integrate dynamic document type selection across invoice creation, editing, previewing, and listing components, ensuring that "فاتورة ضريبية" (Tax Invoice) is selectively displayed and selectable only by employees holding the `issueTaxInvoice` permission.

## Existing System Analysis
1. [`components/admin/invoices/CreateInvoiceModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/CreateInvoiceModal.tsx):
   - Form modal for drafting invoices. Does not provide document type selection.
2. [`components/admin/invoices/EditInvoiceModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/EditInvoiceModal.tsx):
   - Form modal for editing draft invoices.
3. [`components/admin/invoices/InvoiceReviewDrawer.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/InvoiceReviewDrawer.tsx):
   - Slide-out / modal drawer displaying invoice details, print button, and download PDF button.
   - Lines 111-117 open `/api/admin/invoices/${invoice._id}/pdf` directly with no type selector.
4. [`components/admin/invoices/AdminInvoicesTable.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/AdminInvoicesTable.tsx):
   - Table listing invoices with search and status filters.

## Requirements
1. **Invoice Creation Modal (`CreateInvoiceModal.tsx`)**:
   - Add a segmented control or stylized radio group:
     - **نوع المستند المالي (Financial Document Type)**:
       1. `كشف حساب (Account Statement)` — *Default Selected*
       2. `فاتورة (Commercial Invoice)`
       3. `فاتورة ضريبية (Tax Invoice)` — *Rendered ONLY if `user.role === "super_admin" || user.staffPermissions?.issueTaxInvoice`*
   - On submission, pass `documentType: selectedType` in the POST body to `/api/admin/invoices`.

2. **Invoice Edit Modal (`EditInvoiceModal.tsx`)**:
   - Allow editing `documentType` while invoice status is `"draft"`.
   - Hide `"فاتورة ضريبية"` option if the editor lacks `issueTaxInvoice` permission.

3. **Invoice Review Drawer (`InvoiceReviewDrawer.tsx`)**:
   - Add a Document Type selector ribbon or dropdown next to the Download / Print buttons:
     - Allows viewing and exporting the document under:
       - `كشف حساب`
       - `فاتورة`
       - `فاتورة ضريبية` (permission-gated)
   - Update `handleDownloadPdf` and `handlePrint`:
     ```typescript
     const handleDownloadPdf = (docType: string) => {
       window.open(`/api/admin/invoices/${invoice._id}/pdf?type=${docType}`, "_blank")
     }
     ```
   - Provide a quick-select split button:
     - Primary button: "تحميل PDF" (uses stored or default type).
     - Dropdown menu: "تحميل كـ كشف حساب", "تحميل كـ فاتورة", "تحميل كـ فاتورة ضريبية" (if permitted).

4. **Invoices Table & Customer Invoices Tab**:
   - In [`AdminInvoicesTable.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/AdminInvoicesTable.tsx) and [`CustomerInvoicesTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerInvoicesTab.tsx):
     - Display a subtle document type tag next to the invoice number:
       - `كشف حساب` (Slate/Blue badge)
       - `فاتورة` (Indigo badge)
       - `فاتورة ضريبية` (Purple/Emerald badge)
     - Add document type filter to the search toolbar: `الكل`, `كشوف حساب`, `فواتير`, `فواتير ضريبية`.

## Files Likely To Change
- [`components/admin/invoices/CreateInvoiceModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/CreateInvoiceModal.tsx)
- [`components/admin/invoices/EditInvoiceModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/EditInvoiceModal.tsx)
- [`components/admin/invoices/InvoiceReviewDrawer.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/InvoiceReviewDrawer.tsx)
- [`components/admin/invoices/AdminInvoicesTable.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/AdminInvoicesTable.tsx)
- [`components/admin/customers/CustomerInvoicesTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerInvoicesTab.tsx)

## Backend Changes
- `N/A` (Backend APIs implemented in Tasks 02, 03, and 07).

## Frontend Changes
- Connect user session permissions from auth store or session hook (`useSession` or `/api/auth/me`).
- Condition UI elements on `issueTaxInvoice`.

## Security / Permissions
- UI-level gating: If the employee lacks `issueTaxInvoice`, the option `"فاتورة ضريبية"` is completely absent from all selectors.
- Server-side backup: Any altered client state attempting to send `tax_invoice` will be rejected by the backend API.

## Edge Cases
- **Legacy Invoices without `documentType`**: Render badge as `كشف حساب` (the default).
- **Draft Status Enforcement**: Once an invoice is confirmed (`status === "confirmed"`), the document type cannot be modified via edit modal, preserving immutable accounting history.

## Acceptance Criteria
- [ ] Create modal defaults document type to `كشف حساب`.
- [ ] Employee without `issueTaxInvoice` does NOT see `فاتورة ضريبية` option in Create, Edit, or Review Drawer.
- [ ] Employee with `issueTaxInvoice` can select `فاتورة ضريبية` and generate the tax invoice PDF.
- [ ] Review Drawer allows downloading with dynamic title without duplicating financial data.
- [ ] Admin invoices table displays document type badges and supports filtering.

## Dependencies
- **Task 02**: Financial Document Type Architecture & Data Separation.
- **Task 03**: Tax Invoice & Financial Permissions Architecture.
- **Task 07**: Dynamic Document Title & Unified PDF Engine.

## Testing
- Log in as staff without `issueTaxInvoice`: open Create Invoice modal; verify only `كشف حساب` and `فاتورة` are visible.
- Log in as super_admin: open Create Invoice modal; verify `فاتورة ضريبية` is present and functional.
- Download invoice PDF through Review Drawer with all 3 titles; inspect output headers.

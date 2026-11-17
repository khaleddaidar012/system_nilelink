# Task 02: Financial Document Type Architecture & Data Separation

## Objective
Establish a clean abstraction that decouples underlying financial transaction data from presentation document types. Enable the invoice system to generate and display documents under three distinct titles:
1. **كشف حساب** (Account Statement / Transaction Record) — *Default & Baseline Type*
2. **فاتورة** (Commercial Invoice)
3. **فاتورة ضريبية** (Official Tax Invoice)

Ensure underlying financial data (subtotals, line items, VAT, discounts) is never duplicated across documents, while supporting dynamic title switching and persistent document type selection.

## Existing System Analysis
1. [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts):
   - Currently lacks a `documentType` field. All records implicitly default to "invoice" in concept.
2. [`lib/validations/invoice-validation.ts`](file:///d:/khaled/nile_link_website-main/lib/validations/invoice-validation.ts):
   - `CreateInvoiceSchema` and `UpdateInvoiceSchema` do not accept or validate `documentType`.
3. [`lib/services/invoice-pdf-generator.ts`](file:///d:/khaled/nile_link_website-main/lib/services/invoice-pdf-generator.ts):
   - Line 78 hardcodes `doc.text("COMMERCIAL INVOICE", ...)`.
4. [`components/admin/invoices/CreateInvoiceModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/invoices/CreateInvoiceModal.tsx):
   - Modal has no document type picker. Defaults to standard invoice creation.

## Requirements
1. **Model Extension**:
   - Add `documentType` to `IInvoice` in [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts):
     ```typescript
     export type FinancialDocumentType = "statement" | "invoice" | "tax_invoice"
     ```
   - Set the default value to `"statement"` (`كشف حساب`).
   - Add index on `documentType` for rapid filtering and auditing.
2. **Title & Localization Dictionary**:
   - Create a centralized presentation helper [`lib/services/document-type-helper.ts`](file:///d:/khaled/nile_link_website-main/lib/services/document-type-helper.ts):
     - Maps `"statement"` -> `{ ar: "كشف حساب", en: "ACCOUNT STATEMENT" }`
     - Maps `"invoice"` -> `{ ar: "فاتورة", en: "COMMERCIAL INVOICE" }`
     - Maps `"tax_invoice"` -> `{ ar: "فاتورة ضريبية", en: "TAX INVOICE" }`
     - Provides metadata requirements (e.g. `tax_invoice` requires Tax Registration Number and Tax Rate).
3. **Data Independence**:
   - Changing the document type on an existing draft or selecting a different presentation title must NEVER duplicate line items, ledger balances, or customer amounts.
   - The financial calculations remain identical regardless of whether the document title is rendered as `كشف حساب`, `فاتورة`, or `فاتورة ضريبية`.
4. **Validation Schemas**:
   - Update `CreateInvoiceSchema` and `UpdateInvoiceSchema` in [`lib/validations/invoice-validation.ts`](file:///d:/khaled/nile_link_website-main/lib/validations/invoice-validation.ts) with `documentType: z.enum(["statement", "invoice", "tax_invoice"]).default("statement")`.

## Files Likely To Change
- [`lib/models/Invoice.ts`](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts)
- [`lib/validations/invoice-validation.ts`](file:///d:/khaled/nile_link_website-main/lib/validations/invoice-validation.ts)
- New helper: `lib/services/document-type-helper.ts`
- [`app/api/admin/invoices/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/route.ts)
- [`app/api/admin/invoices/[id]/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/route.ts)

## Backend Changes
- Extend `InvoiceSchema` with:
  ```typescript
  documentType: {
    type: String,
    enum: ["statement", "invoice", "tax_invoice"],
    default: "statement",
    index: true,
  }
  ```
- In `POST /api/admin/invoices`, accept `documentType` (defaulting to `"statement"`).
- In `PUT /api/admin/invoices/[id]`, permit updating `documentType` while in `"draft"` status.
- Allow on-the-fly presentation override via query parameter `?docType=...` on PDF generation and view endpoints (with permission verification for `tax_invoice`).

## Frontend Changes
- Add document type selector in invoice creation and editing forms:
  - Radio group or dropdown:
    1. `كشف حساب` (Statement - Default)
    2. `فاتورة` (Invoice)
    3. `فاتورة ضريبية` (Tax Invoice - Conditionally visible based on permission)
- Display badge indicating document type in invoice tables and review drawers.

## Security / Permissions
- Anyone with invoice creation/viewing access can issue or view `"statement"` and `"invoice"`.
- Selecting or requesting `"tax_invoice"` requires dedicated server-side permission `issueTaxInvoice` (defined and implemented in Task 03).

## Edge Cases
- **Legacy Invoices**: Existing documents in the database created before this migration will have `documentType: undefined`. Ensure schema default or fallback logic treats `undefined` as `"statement"` (or preserves backward compatibility).
- **Tax Card Missing**: If `"tax_invoice"` is chosen, validate that the customer snapshot or issuer snapshot contains valid `taxCardNumber` / `taxId`. If missing, notify staff or issue a non-blocking compliance alert.

## Acceptance Criteria
- [ ] `documentType` field added to `IInvoice` model with default `"statement"`.
- [ ] Central helper created providing Arabic and English display titles.
- [ ] Updating document type does not duplicate financial rows or mutate calculations.
- [ ] Invoices API allows setting and updating `documentType`.
- [ ] Schema backward compatibility verified: existing database records load seamlessly without schema validation errors.

## Dependencies
- **Task 01**: Analyze Current Financial & Document Architecture.

## Testing
1. Create a draft with `documentType: "statement"`. Verify default persists.
2. Update draft to `documentType: "invoice"`. Verify amounts remain identical.
3. Fetch existing invoices created before this change; ensure they return without errors with `"statement"` fallback.

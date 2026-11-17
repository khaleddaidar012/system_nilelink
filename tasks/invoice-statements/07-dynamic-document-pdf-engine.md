# Task 07: Dynamic Document Title & Unified PDF Engine

## Objective
Upgrade Nile Link Logistics' existing invoice PDF generation engine ([`lib/services/invoice-pdf-generator.ts`](file:///d:/khaled/nile_link_website-main/lib/services/invoice-pdf-generator.ts)) to dynamically render the appropriate document title based on the selected financial document type:
- **كشف حساب** (`statement`) — *Default Title*
- **فاتورة** (`invoice`)
- **فاتورة ضريبية** (`tax_invoice`)

Ensure the same PDF infrastructure is reused without duplicating template code, while strictly enforcing the `issueTaxInvoice` permission whenever a Tax Invoice PDF is requested.

## Existing System Analysis
1. [`lib/services/invoice-pdf-generator.ts`](file:///d:/khaled/nile_link_website-main/lib/services/invoice-pdf-generator.ts):
   - Generates high-resolution vector A4 PDFs using `pdfkit`.
   - Uses `naqqash` (`shapeArabicText`) to shape Arabic glyphs and reverse word order for RTL rendering.
   - Registers Amiri font (`public/fonts/Amiri-Regular.ttf`, `Amiri-Bold.ttf`) with Arial fallback.
   - **Current Limitation**: Line 78 hardcodes:
     ```typescript
     doc.font("AppFontBold").fontSize(18).fillColor("#0f172a").text("COMMERCIAL INVOICE", 320, 45, { align: "right" })
     ```
2. [`app/api/admin/invoices/[id]/pdf/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/pdf/route.ts):
   - Endpoint generating and returning the inline PDF response.
   - Does not accept query parameters for document type customization.
   - Does not check `issueTaxInvoice` permission.

## Requirements
1. **Dynamic Title Formatting**:
   - Update `generateInvoicePdfBuffer(invoice: IInvoice, overrideType?: FinancialDocumentType)`:
   - Determine active document type:
     ```typescript
     const activeType = overrideType || invoice.documentType || "statement"
     ```
   - Resolve title dynamically:
     - `"statement"`: Arabic: `كشف حساب` | English: `ACCOUNT STATEMENT`
     - `"invoice"`: Arabic: `فاتورة تجارية` | English: `COMMERCIAL INVOICE`
     - `"tax_invoice"`: Arabic: `فاتورة ضريبية` | English: `TAX INVOICE`
   - Render the title using Arabic shaping via `formatTextForPdf` so Arabic glyphs connect correctly in PDFKit.
   - In bilingual layout, show both the Arabic title and English subtitle, or adapt based on document configuration.
2. **Tax Invoice Specific Enhancements (`فاتورة ضريبية`)**:
   - If `activeType === "tax_invoice"`:
     - Prominently display Issuer Tax Registration Number: `السجل الضريبي: 123-456-789` / `Tax Registration No.`
     - Prominently display Customer Tax Card Number: `البطاقة الضريبية: ...`
     - Explicit VAT breakdown line: `ضريبة القيمة المضافة (14% VAT)`.
     - Official disclaimer in footer: `فاتورة ضريبية معتمدة صادرة طبقاً لأحكام قانون الضريبة على القيمة المضافة` (Official approved tax invoice issued in accordance with Egyptian VAT regulations).
3. **Template Reuse**:
   - Do NOT duplicate the PDF generator into three separate files.
   - Maintain the single, highly polished PDF layout in `invoice-pdf-generator.ts` with parameter-driven title and header sections.
4. **Backend Route Security Update**:
   - Update [`app/api/admin/invoices/[id]/pdf/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/pdf/route.ts):
   - Extract `const searchParams = req.nextUrl.searchParams`
   - `const requestedType = searchParams.get("type") as FinancialDocumentType | null`
   - If `requestedType === "tax_invoice"` or `(!requestedType && invoice.documentType === "tax_invoice")`:
     - Assert staff permission:
       ```typescript
       const auth = await assertStaffPermission(req, "issueTaxInvoice")
       if (!auth.authorized) return auth.response
       ```
   - Pass `requestedType || undefined` to `generateInvoicePdfBuffer`.

## Files Likely To Change
- [`lib/services/invoice-pdf-generator.ts`](file:///d:/khaled/nile_link_website-main/lib/services/invoice-pdf-generator.ts)
- [`lib/services/document-type-helper.ts`](file:///d:/khaled/nile_link_website-main/lib/services/document-type-helper.ts)
- [`app/api/admin/invoices/[id]/pdf/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/pdf/route.ts)

## Backend Changes
- Signature update:
  ```typescript
  export async function generateInvoicePdfBuffer(
    invoice: IInvoice,
    documentTypeOverride?: FinancialDocumentType
  ): Promise<Buffer>
  ```
- Permission check in PDF endpoint preventing unauthorized generation of Tax Invoices.

## Frontend Changes
- `N/A` (Frontend integration covered in Task 10 and 11).

## Security / Permissions
- Strict enforcement of `issueTaxInvoice` on the PDF route.
- If a staff member without `issueTaxInvoice` attempts to fetch `/api/admin/invoices/:id/pdf?type=tax_invoice`, the server returns 403 Forbidden.

## Edge Cases
- **Missing Arabic Fonts on Server**:
  - Generator already contains graceful font resolution (`Amiri` -> `Arial` -> `Helvetica`). Ensure shaped text does not crash if fallback Helvetica is loaded.
- **Browser Print Preview**:
  - `Content-Disposition: inline` allows direct browser preview while honoring the document title.

## Acceptance Criteria
- [ ] PDF generator dynamically renders `كشف حساب`, `فاتورة`, or `فاتورة ضريبية`.
- [ ] Arabic text renders with proper cursive connections and RTL direction.
- [ ] Single template reused without code duplication.
- [ ] Direct call to `/pdf?type=tax_invoice` without `issueTaxInvoice` is blocked with HTTP 403.
- [ ] Existing invoice downloads default to `كشف حساب` or stored document type without regressions.

## Dependencies
- **Task 02**: Financial Document Type Architecture & Data Separation.
- **Task 03**: Tax Invoice & Financial Permissions Architecture.

## Testing
- Generate PDF with `?type=statement`: verify title displays `كشف حساب`.
- Generate PDF with `?type=invoice`: verify title displays `فاتورة`.
- Generate PDF with `?type=tax_invoice` as authorized user: verify title displays `فاتورة ضريبية` and tax disclosures appear.
- Generate PDF with `?type=tax_invoice` as unauthorized user: verify HTTP 403 Forbidden response.

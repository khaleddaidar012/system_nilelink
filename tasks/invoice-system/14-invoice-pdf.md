# Task 14 — Corporate A4 PDF Invoice Generation & Printable Layout

## 1. Task Name
Professional A4 PDF Generation Engine & Corporate Printable Template

## 2. Goal
Develop an enterprise-grade, clean, corporate A4 invoice PDF rendering engine and printable document view. The PDF must feature the official Nile Link Logistics brand identity, corporate logo, structured two-column party details (Issuer / Billed To), logistics shipment parameters (tracking reference, origin, destination, ACID compliance), an itemized financial table, and bank remittance routing, rendering with pixel-perfect consistency across browser print dialogs, file downloads, and email attachments.

---

## 3. Existing System
- [public/images/logo.png](file:///d:/khaled/nile_link_website-main/public/images/logo.png): Official Nile Link brand logo asset.
- [components/portal/financials/InvoiceLivePreview.tsx](file:///d:/khaled/nile_link_website-main/components/portal/financials/InvoiceLivePreview.tsx): Existing React layout structure.
- [lib/models/SystemSetting.ts](file:///d:/khaled/nile_link_website-main/lib/models/SystemSetting.ts): Source for configurable corporate information.
- [lib/storage/r2-storage.ts](file:///d:/khaled/nile_link_website-main/lib/storage/r2-storage.ts): Storage engine supporting invoice persistence.

---

## 4. Requirements & Layout Specification

### 4.1 Visual Hierarchy & A4 Dimensions
- Standard A4 page size: `210mm x 297mm`, portrait orientation.
- Margins: Standard 15mm-20mm padding.
- Color Palette:
  - Primary Brand: Deep Navy (`#0f172a` / `#1e293b`)
  - Accent / Primary Blue: `#2563eb` (Nile Link Cyan/Blue)
  - Muted Borders & Lines: `#e2e8f0`
  - Body Text: Charcoal `#334155`
  - Headers & Highlights: Bold `#0f172a`

### 4.2 Document Structure
```
+---------------------------------------------------------------------------------+
| [ NILE LINK LOGISTICS LOGO ]                                 COMMERCIAL INVOICE |
| Nile Link Logistics S.A.E                                   Invoice #: INV-2026-000042|
| Alexandria / Cairo, Egypt                                  Issue Date: 2026-10-01   |
| Tax Card / VAT: 994-123-456                                 Due Date:   2026-10-15   |
| Contact: info@nilelink.com                                 Status:     CONFIRMED    |
+---------------------------------------------------------------------------------+
| BILLED TO (Customer)                      | SHIPMENT & COMPLIANCE               |
| Apex Global Trade Ltd                     | Shipment Ref: TRK-990123            |
| Tax Card / CR: 104921                     | Service: Sea Freight (40ft FCL)     |
| 45 Industrial Zone, 6th of October City   | Routing: Alexandria Port -> Dubai   |
| Cairo, Egypt                              | ACID Code: 2026-MTS-99214           |
| Attn: finance@apextrade.com               | Bill of Lading: MEDU-1029384        |
+---------------------------------------------------------------------------------+
| DESCRIPTION                           | QTY | UNIT PRICE (EGP) | TOTAL (EGP)    |
|---------------------------------------+-----+------------------+----------------|
| Ocean Freight 40ft High Cube Container|  2  |    15,000.00     |   30,000.00    |
| Customs Clearance & Port Inspection   |  1  |     4,500.00     |    4,500.00    |
| Terminal Handling & Demurrage Coverage|  1  |     1,200.00     |    1,200.00    |
+---------------------------------------------------------------------------------+
| PAYMENT REMITTANCE & BANK DETAILS     | Subtotal:              |   35,700.00    |
| Bank: Commercial International Bank   | Additional Charges:    |    1,200.00    |
| Beneficiary: Nile Link Logistics SAE  | Discount:              |   (  500.00)   |
| Account / IBAN: EG38001000...         | VAT (14%):             |    5,096.00    |
| SWIFT / BIC: CIBEEGCX                 |------------------------+----------------|
| Currency: EGP                         | TOTAL DUE:             |   41,496.00 EGP|
+---------------------------------------------------------------------------------+
| REMARKS & PAYMENT TERMS                                                         |
| Please quote invoice number INV-2026-000042 on bank remittance advice.         |
| Payment is due within 14 calendar days from the date of issue.                  |
| Authorized Signature & Corporate Seal: _______________________                  |
+---------------------------------------------------------------------------------+
```

---

## 5. Technical Implementation Details

### 5.1 Dual-Strategy Architecture
1. **Server-Side PDF Buffer Generator (`lib/services/invoice-pdf-generator.ts`)**:
   - Generates raw binary PDF Buffer using `pdfkit` (lightweight, zero-browser overhead, zero canvas dependencies, produces crisp text and embedded logo).
   - Used for email attachments (`lib/email/send.ts`) and direct server-streamed PDF downloads (`/api/admin/invoices/[id]/pdf` and `/api/portal/invoices/[id]/pdf`).
2. **Client-Side Print-to-PDF Stylesheet (`@media print`)**:
   - In `InvoiceLivePreview.tsx`, inject clean `@media print` rules hiding action buttons, toolbars, and navigation, forcing standard A4 pagination and color preservation (`print-color-adjust: exact`).

### 5.2 PDF Generation Service Blueprint
```typescript
import PDFDocument from "pdfkit"
import { IInvoice } from "@/lib/models/Invoice"
import path from "path"
import fs from "fs"

export async function generateInvoicePdfBuffer(invoice: IInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 })
    const buffers: Buffer[] = []

    doc.on("data", buffers.push.bind(buffers))
    doc.on("end", () => resolve(Buffer.concat(buffers)))
    doc.on("error", reject)

    // 1. Header & Brand Logo
    const logoPath = path.join(process.cwd(), "public", "images", "logo.png")
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 40, { width: 120 })
    } else {
      doc.fontSize(20).fillColor("#0f172a").text("NILE LINK LOGISTICS", 40, 40)
    }

    doc.fontSize(20).fillColor("#0f172a").text("COMMERCIAL INVOICE", 350, 40, { align: "right" })
    doc.fontSize(10).fillColor("#64748b").text(`Invoice No: ${invoice.invoiceNumber}`, 350, 65, { align: "right" })
    doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, 350, 80, { align: "right" })
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 350, 95, { align: "right" })
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 350, 110, { align: "right" })

    // 2. Issuer Info & Customer Billed To (From Frozen Snapshots)
    const customer = invoice.customerSnapshot || (invoice as any).customerId
    const issuer = invoice.issuerSnapshot || {
      legalName: "Nile Link Logistics S.A.E",
      address: "123 Maritime Blvd, Alexandria, Egypt",
      taxId: "994-123-456",
      phone: "+20 100 123 4567",
      email: "billing@nilelink.com",
    }

    doc.fontSize(10).fillColor("#0f172a").text(issuer.legalName, 40, 100)
    doc.fillColor("#64748b").text(issuer.address, 40, 115)
    doc.text(`Tax ID: ${issuer.taxId}`, 40, 130)
    doc.text(`Email: ${issuer.email}`, 40, 145)

    // Divider Line
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, 170).lineTo(555, 170).stroke()

    // Billed To Column
    doc.fontSize(11).fillColor("#0f172a").text("BILLED TO:", 40, 185)
    doc.fontSize(10).text(customer.companyName || "N/A", 40, 200)
    doc.fillColor("#64748b").text(customer.address || "Egypt", 40, 215)
    doc.text(`Tax / CR: ${customer.taxCardNumber || customer.commercialRegisterNumber || "N/A"}`, 40, 230)
    doc.text(`Email: ${customer.contactEmail || "N/A"}`, 40, 245)

    // Shipment Ref Column
    if (invoice.shipmentSnapshot) {
      doc.fontSize(11).fillColor("#0f172a").text("SHIPMENT & COMPLIANCE:", 320, 185)
      doc.fontSize(10).fillColor("#64748b").text(`Tracking Ref: ${invoice.shipmentSnapshot.trackingNumber}`, 320, 200)
      doc.text(`Service: ${invoice.shipmentSnapshot.serviceType}`, 320, 215)
      if (invoice.shipmentSnapshot.complianceNumber) {
        doc.text(`ACID / UCR: ${invoice.shipmentSnapshot.complianceNumber}`, 320, 230)
      }
    }

    // 3. Line Items Table Header
    let tableTop = 275
    doc.rect(40, tableTop, 515, 22).fill("#f8fafc")
    doc.fillColor("#0f172a").fontSize(9).text("DESCRIPTION", 50, tableTop + 6)
    doc.text("QTY", 320, tableTop + 6, { width: 50, align: "center" })
    doc.text("UNIT PRICE", 380, tableTop + 6, { width: 80, align: "right" })
    doc.text("TOTAL", 470, tableTop + 6, { width: 75, align: "right" })

    // Line items loop
    let currentY = tableTop + 25
    invoice.items.forEach((item) => {
      doc.fillColor("#334155").fontSize(9).text(item.description, 50, currentY, { width: 260 })
      doc.text(String(item.quantity), 320, currentY, { width: 50, align: "center" })
      doc.text(item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }), 380, currentY, { width: 80, align: "right" })
      doc.text(item.total.toLocaleString(undefined, { minimumFractionDigits: 2 }), 470, currentY, { width: 75, align: "right" })
      currentY += 20
    })

    // 4. Summary & Bank Details
    currentY += 15
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, currentY).lineTo(555, currentY).stroke()
    currentY += 15

    // Financial totals right aligned
    doc.fontSize(9).fillColor("#64748b").text("Subtotal:", 380, currentY, { width: 80, align: "right" })
    doc.fillColor("#0f172a").text(`${invoice.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}`, 470, currentY, { width: 75, align: "right" })
    currentY += 16

    if (invoice.additionalCharges > 0) {
      doc.fillColor("#64748b").text("Additional Surcharges:", 340, currentY, { width: 120, align: "right" })
      doc.fillColor("#0f172a").text(`${invoice.additionalCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}`, 470, currentY, { width: 75, align: "right" })
      currentY += 16
    }

    if (invoice.discount > 0) {
      doc.fillColor("#64748b").text("Discount Applied:", 380, currentY, { width: 80, align: "right" })
      doc.fillColor("#16a34a").text(`-${invoice.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}`, 470, currentY, { width: 75, align: "right" })
      currentY += 16
    }

    doc.fillColor("#64748b").text(`VAT (${invoice.taxRate || 14}%):`, 380, currentY, { width: 80, align: "right" })
    doc.fillColor("#0f172a").text(`${invoice.tax.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}`, 470, currentY, { width: 75, align: "right" })
    currentY += 20

    // Grand total
    doc.rect(340, currentY, 215, 26).fill("#0f172a")
    doc.fillColor("#ffffff").fontSize(11).text("TOTAL DUE:", 350, currentY + 7)
    doc.text(`${invoice.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}`, 450, currentY + 7, { width: 95, align: "right" })

    // Bank Routing Info (Left column)
    doc.fillColor("#0f172a").fontSize(10).text("BANK PAYMENT ROUTING", 40, currentY - 50)
    doc.fillColor("#64748b").fontSize(8.5)
    doc.text(`Bank: Commercial International Bank (CIB)`, 40, currentY - 35)
    doc.text(`Beneficiary: Nile Link Logistics S.A.E`, 40, currentY - 22)
    doc.text(`IBAN: EG3800100000000001234567890`, 40, currentY - 9)
    doc.text(`SWIFT: CIBEEGCX`, 40, currentY + 4)

    doc.end()
  })
}
```

---

## 6. Endpoints To Create
- `app/api/admin/invoices/[id]/pdf/route.ts`: Streams PDF with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="INV-XXXX.pdf"`.
- `app/api/portal/invoices/[id]/pdf/route.ts`: Secure customer download stream with customer ID ownership verification.

---

## 7. Security Considerations
- **No HTML/JS Injection**: Using `pdfkit` generates pure binary PDF vector commands rather than evaluating untrusted client HTML via a browser, eliminating SSRF and PDF JavaScript injection attack vectors.
- **Access Control**: Both endpoints verify authentication session and refuse access to drafts for customer sessions.

---

## 8. Acceptance Criteria
- [ ] PDF generator generates clean A4 PDF Buffer matching specified corporate layout.
- [ ] Official Nile Link logo is cleanly embedded in the top header.
- [ ] Customer, shipment compliance (ACID), line items, and bank details render accurately.
- [ ] Download endpoints return valid `application/pdf` streams readable in Adobe Acrobat, Apple Preview, and modern browsers.
- [ ] Client-side printing (`window.print()`) yields crisp A4 vector output without UI chrome.

---

## 9. Testing Instructions
1. Call `generateInvoicePdfBuffer(mockInvoice)` in test script.
2. Save resulting buffer to `scratch/test-invoice.pdf`.
3. Open in PDF viewer; check alignment, font rendering, margins, totals, and logo clarity.
4. Verify file size is compact (< 100 KB).

---

## 10. Dependencies
- Depends on: `02-database-models.md`, `11-draft-confirm-workflow.md`
- Pre-requisite for: `15-send-invoice.md`

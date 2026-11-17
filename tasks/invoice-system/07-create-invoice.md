# Task 07 — Create Invoice Modal & Interactive Authoring Flow

## 1. Task Name
Interactive Invoice Creation Dialog & Dynamic Line-Item Authoring

## 2. Goal
Develop a comprehensive, responsive modal dialog (`CreateInvoiceModal.tsx`) that allows Nile Link staff to author new invoices. The form features async customer search, contextual shipment binding, dynamic line-item addition/removal, real-time live calculation of subtotals and VAT using `invoice-calculator.ts`, and saving directly as an internal `draft`.

---

## 3. Existing System
- [@headlessui/react](file:///d:/khaled/nile_link_website-main/package.json): Modal dialog component system (`Dialog`, `Transition`).
- [lib/engine/invoice-calculator.ts](file:///d:/khaled/nile_link_website-main/lib/engine/invoice-calculator.ts): Reactive calculation engine (Task 05).
- [lib/services/invoice-number-service.ts](file:///d:/khaled/nile_link_website-main/lib/services/invoice-number-service.ts): Number preview service (Task 03).
- [components/admin/review/DocumentReviewModal.tsx](file:///d:/khaled/nile_link_website-main/components/admin/review/DocumentReviewModal.tsx): Reference pattern for complex admin modal interfaces.

---

## 4. Requirements & Form Architecture

### 4.1 Form Fields & Sections

```
+---------------------------------------------------------------------------------+
| CREATE NEW INVOICE                                      [ Next No: INV-2026-0042 ]|
+---------------------------------------------------------------------------------+
| 1. PARTIES & REFERENCES                                                         |
| Customer: [ Select or Search Verified Customer...           v ]                 |
| Shipment / Request (Optional): [ Select Customer Shipment... v ]                 |
| Currency: [ EGP v ]  Issue Date: [ 2026-10-01 ]  Due Date: [ 2026-10-15 ]       |
+---------------------------------------------------------------------------------+
| 2. LINE ITEMS                                                                   |
| # | Description               | Qty  | Unit Price | Total    | Action          |
| 1 | Ocean Freight 40ft HC     | 2    | 15,000.00  | 30,000.00| [Trash]         |
| 2 | Customs Clearance Nafeza  | 1    |  4,500.00  |  4,500.00| [Trash]         |
| [ + Add Line Item ]                                                             |
+---------------------------------------------------------------------------------+
| 3. CHARGES, DISCOUNTS & TAXES                                                   |
| Additional Surcharges: [ 1,200.00 ]  (e.g., Terminal Handling, Demurrage)      |
| Discount:              [   500.00 ]                                             |
| VAT Rate (%):          [    14.00 ]  --> Tax Amount: 4,928.00 EGP               |
|                                      --> GRAND TOTAL: 40,128.00 EGP             |
+---------------------------------------------------------------------------------+
| 4. NOTES & REMARKS                                                              |
| Public Client Notes:   [ Payment due within 14 days to CIB account...        ]  |
| Internal Staff Notes:  [ [!] Verified by Operations Manager Khaled           ]  |
+---------------------------------------------------------------------------------+
| [ Cancel ]                                         [ Save as Internal Draft ]   |
+---------------------------------------------------------------------------------+
```

### 4.2 Dynamic Line-Item Management
- Staff can add unlimited line items.
- Real-time updates: Changing quantity or unit price immediately updates item total, subtotal, tax amount, and grand total via `calculateInvoiceTotals()`.
- Common logistics service templates can be quick-inserted:
  - "Ocean Freight Container 20ft / 40ft"
  - "Air Cargo Transit & Handling"
  - "Customs Clearance & ACID Processing"
  - "Inland Truck Dispatch (Alexandria - Cairo)"
  - "Port Terminal Storage & Inspection Fee"

### 4.3 Async Contextual Lookups
- **Customer Lookup**: Async searchable select field querying `/api/admin/customers` by company name or CR number.
- **Shipment Lookup**: Once a customer is selected, the shipment dropdown dynamically queries `/api/admin/requests?customerId={id}` to display only shipments belonging to that customer.

---

## 5. Technical Implementation Details

### Files To Create:
- `components/admin/invoices/CreateInvoiceModal.tsx`: The primary modal component.
- `components/admin/invoices/InvoiceLineItemsEditor.tsx`: Sub-component managing line items grid, add/remove rows, and templates.
- `components/admin/invoices/InvoiceFinancialSummaryBox.tsx`: Reactive total calculations widget with live currency formatting.
- `app/api/admin/customers/search/route.ts`: Lightweight typeahead endpoint returning `{ id, companyName, commercialRegisterNumber, contactEmail }`.

### State Management:
- Form state initialized with:
  ```typescript
  const [formData, setFormData] = useState({
    customerId: initialCustomerId || "",
    relatedRequestId: initialRequestId || "",
    currency: "EGP",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    items: [{ description: "", quantity: 1, unitPrice: 0 }],
    additionalCharges: 0,
    discount: 0,
    taxRate: 14,
    notes: "",
    internalNotes: "",
  })
  ```
- Submitting the form fires `POST /api/admin/invoices` with payload validated by `CreateInvoiceSchema`.
- On success: Dispatches toast via `sonner`, refreshes parent table, and optionally opens preview drawer.

---

## 6. Security Considerations
- Frontend enforces non-negative inputs and valid dates.
- Submission disables submit button and displays loading spinner to prevent double-clicks or accidental duplicate creation requests.
- Internal notes input field visually differentiated with yellow/amber border and lock icon indicating privacy.

---

## 7. Edge Cases Handled
- **Customer Deselection**: If the staff member switches the customer after selecting a shipment, the shipment field resets automatically to avoid mismatched associations.
- **Zero Items**: The "Save as Draft" button is disabled if all line items are empty.
- **Fractional Quantities**: Supported (e.g., 2.5 CBM or 1.75 metric tons).

---

## 8. Acceptance Criteria
- [ ] Modal opens smoothly from "+ Create Invoice" button.
- [ ] Next sequential number preview displayed in modal header.
- [ ] Customers can be searched and selected asynchronously.
- [ ] Shipments filter to the selected customer's active requests.
- [ ] Adding/editing line items dynamically updates subtotal, VAT, and grand total in real-time.
- [ ] Submitting successfully creates a `draft` invoice in the database and updates UI table.

---

## 9. Testing Instructions
1. Open modal from `/admin/invoices`.
2. Add 2 items: 1x 10,000 EGP, 2x 2,500 EGP. Set discount: 1,000 EGP, additional charges: 500 EGP, tax: 14%.
3. Verify displayed total is: `(15,000 - 1,000 + 500) * 1.14 = 16,530.00 EGP`.
4. Click "Save as Internal Draft" and verify invoice record is created with `status: "draft"`.

---

## 10. Dependencies
- Depends on: `04-invoice-backend-api.md`, `05-invoice-calculations.md`, `03-invoice-numbering.md`
- Pre-requisite for: `08-edit-draft-invoice.md`, `09-customer-profile-integration.md`, `10-shipment-integration.md`

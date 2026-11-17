# Task 09 — Customer Profile Invoices Tab & Direct Creation Flow

## 1. Task Name
Customer Profile Integration: Contextual Billing Tab & Inline Invoice Generation

## 2. Goal
Integrate the Invoice Management System deeply into the staff Customer Details view at `app/[locale]/admin/customers/[id]/page.tsx`. Staff members must be able to review all past and pending invoices belonging to a specific customer, and trigger an inline "Create Invoice" workflow where the customer is automatically locked/pre-selected without navigating away from the customer's profile.

---

## 3. Existing System
- [app/[locale]/admin/customers/[id]/page.tsx](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx): Main customer workspace page. Currently has tabs: `"documents" | "profile" | "governance"`.
- [app/api/admin/customers/[id]/route.ts](file:///d:/khaled/nile_link_website-main/app/api/admin/customers/%5Bid%5D/route.ts): API returning customer details, users, compliance stats, and document items.
- [components/admin/invoices/CreateInvoiceModal.tsx](file:///d:/khaled/nile_link_website-main/tasks/invoice-system/07-create-invoice.md): Modal accepting `initialCustomerId`.

---

## 4. Requirements & UX Design

### 4.1 Customer Details Tab Structure Update
Expand `selectedTab` state in `CustomerDetailPage`:
```typescript
type CustomerTab = "documents" | "profile" | "invoices" | "governance"
```

Tab Layout Representation:
```
+---------------------------------------------------------------------------------+
| < Back to Customers   Apex Global Logistics (CR: 104921)         [ Active Badge ]|
+---------------------------------------------------------------------------------+
| [ Documents (8) ] [ Profile & Contacts ] [ Invoices & Billing (5) ] [ Governance]
+---------------------------------------------------------------------------------+
| (When Invoices tab is selected):                                                |
|                                                                                 |
| Billing Summary:                                                                |
| Total Invoiced: 250,000 EGP | Paid: 190,000 EGP | Due: 60,000 EGP  [ + Create Invoice ] |
|                                                                                 |
| Customer Invoices Table:                                                        |
| INV#          | Shipment | Issue Date | Due Date | Total Amount | Status | Actions  |
| INV-2026-0012 | TRK-9901 | 2026-09-10 | 2026-09-24 | 45,000 EGP | PAID   | [View]   |
| INV-2026-0045 | TRK-9988 | 2026-09-28 | 2026-10-12 | 15,000 EGP | DRAFT  | [Edit]   |
+---------------------------------------------------------------------------------+
```

### 4.2 Seamless Contextual Creation Workflow
1. Staff clicks **"+ Create Invoice"** from the Customer Invoices tab or page header.
2. `InvoiceFormModal` opens with:
   - `customerId` pre-selected and locked to the current customer (displayed with company name, CR, and contact email).
   - Shipment/Request dropdown pre-populated with active shipments belonging to this specific customer.
   - Financial defaults (currency `EGP`, standard VAT 14%).
3. When staff clicks "Save as Draft", the modal closes, a success toast appears, and the Customer Invoices tab immediately refreshes with the newly created invoice.

---

## 5. Technical Implementation Details

### Files To Create:
- `components/admin/customers/CustomerInvoicesTab.tsx`: Dedicated sub-component rendering the customer's financial statistics cards, invoices table, and action triggers.

### Files To Modify:
- `app/[locale]/admin/customers/[id]/page.tsx`:
  - Add `"invoices"` to tab union and navigation pill list.
  - Mount `<CustomerInvoicesTab customerId={customer.id} customerName={customer.companyName} />` when active.
  - Provide top-level quick-action "+ Create Invoice" button in the customer banner.
- `app/api/admin/customers/[id]/route.ts`:
  - Enhance invoice summary in response or support fetching dedicated invoices via `/api/admin/invoices?customerId={id}`.
- `messages/en.json` & `messages/ar.json`:
  - Add translations for customer invoices tab (`"admin.customers.tabs.invoices": "Invoices & Billing" / "الفواتير والماليات"`).

---

## 6. Security Considerations
- The customer ID is passed directly to the creation modal from verified page params.
- Server validates that the `customerId` exists in `Customer` collection before generating invoice record.
- Non-staff users cannot access `/admin/customers/[id]` (protected by `requireAuth`).

---

## 7. Edge Cases Handled
- **Customer With Zero Shipments**: Staff can still generate direct non-shipment invoices (e.g. consulting, special customs brokerage retainer, storage demurrage).
- **Unverified Customer Account**: If customer status is `unverified` or `under_review`, display an informational warning badge inside the modal, but allow staff to prepare draft billing in anticipation of approval.

---

## 8. Acceptance Criteria
- [ ] Customer details page includes a dedicated "Invoices & Billing" tab.
- [ ] Tab displays customer-specific financial summary cards and invoice history table.
- [ ] "+ Create Invoice" button opens modal with current customer automatically selected and locked.
- [ ] Shipment selector in modal shows only shipments belonging to this customer.
- [ ] Newly created invoices appear immediately in the tab without needing a full page reload.

---

## 9. Testing Instructions
1. Navigate to `/admin/customers/[id]` for a verified customer.
2. Select the "Invoices & Billing" tab.
3. Click "+ Create Invoice".
4. Confirm that the customer's name is locked in the form and the shipment dropdown contains only their shipments.
5. Add items and save draft. Verify new draft appears in the customer's invoice list.

---

## 10. Dependencies
- Depends on: `04-invoice-backend-api.md`, `06-admin-invoice-list.md`, `07-create-invoice.md`
- Pre-requisite for: `10-shipment-integration.md`, `11-draft-confirm-workflow.md`

# Task 06 — Admin Invoice Management Dashboard View

## 1. Task Name
Admin Invoices Master Dashboard View (`/admin/invoices`)

## 2. Goal
Build the central invoice management page inside the staff/admin dashboard at `app/[locale]/admin/invoices/page.tsx`. Provide employees with real-time KPI overview cards, interactive search and multi-criteria filtering, a high-density tabular invoices list, and quick action triggers (Create, View, Edit, Confirm, Send, Download PDF).

---

## 3. Existing System
- [components/admin/AdminSidebar.tsx](file:///d:/khaled/nile_link_website-main/components/admin/AdminSidebar.tsx): Currently holds `/admin/coming-soon/financials`. We will activate `/admin/invoices` in `coreNavItems`.
- [components/admin/AdminHeader.tsx](file:///d:/khaled/nile_link_website-main/components/admin/AdminHeader.tsx): Standardized dashboard header component.
- [components/ui/Button.tsx](file:///d:/khaled/nile_link_website-main/components/ui/Button.tsx): Reusable button primitives.
- [app/[locale]/admin/customers/page.tsx](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/page.tsx): Architectural layout reference for staff admin tables.

---

## 4. Requirements & UX Design

### 4.1 Page Layout Structure
```
+---------------------------------------------------------------------------------+
| AdminHeader: "Invoices & Billing" | [ + Create Invoice ]                        |
+---------------------------------------------------------------------------------+
| KPI Cards:                                                                      |
| [ Total Revenue ]  [ Collected Cash ]  [ Outstanding Due ]  [ Pending Drafts ]  |
+---------------------------------------------------------------------------------+
| Filters & Search Toolbar:                                                       |
| [ Search input: INV#, Company... ] [ Status: All/Draft/Confirmed... ] [ Dates ]|
+---------------------------------------------------------------------------------+
| Data Table:                                                                     |
| INV# | Customer | Shipment Ref | Issue Date | Due Date | Total | Status | Actions|
| INV-2026-0001 | Apex Trade | TRK-9921 | Jan 15 | Feb 15 | 45,000 EGP | DRAFT |...|
+---------------------------------------------------------------------------------+
| Pagination: Showing 1-20 of 142 Invoices                  < Prev [ 1 2 3 ] Next >|
+---------------------------------------------------------------------------------+
```

### 4.2 Top Summary KPI Cards
1. **Total Invoiced**: Aggregate gross value of all active commercial invoices (excluding cancelled).
2. **Collected Payments**: Sum of all `paidAmount` received across invoices.
3. **Outstanding Balance**: Net uncollected `remainingAmount` awaiting payment.
4. **Drafts Under Review**: Count of invoices currently in `draft` status, alerting staff to pending billing actions with an attention-grabbing badge.

### 4.3 Table Column Data Mapping
- **Invoice #**: e.g., `INV-2026-000042` with copy-to-clipboard button.
- **Customer**: Customer company name + secondary subtitle with commercial register number.
- **Shipment / Ref**: Tracking number link (e.g., `TRK-88123`) or "Direct Billing" if not shipment-bound.
- **Issue & Due Date**: Formatted date display with overdue visual highlighting when due date is past.
- **Financial Amount**: Total amount formatted with currency (`45,000.00 EGP`).
- **Status Badge**:
  - `draft`: Amber warning badge (`Draft — Internal Only`)
  - `confirmed`: Blue badge (`Confirmed — Ready to Send`)
  - `sent`: Purple badge (`Sent to Client`)
  - `partially_paid`: Indigo badge (`Partially Paid`)
  - `paid`: Emerald badge (`Paid in Full`)
  - `overdue`: Rose badge (`Overdue`)
  - `cancelled`: Slate gray badge (`Cancelled`)
- **Created By**: Name of staff author.
- **Actions Menu**:
  - View Details (drawer/modal)
  - Edit Draft (enabled only if `draft`)
  - Confirm Invoice (prominent action if `draft`)
  - Send to Customer (enabled if `confirmed` or `sent`)
  - Download PDF
  - Print

---

## 5. Technical Implementation Details

### Files To Create:
- `app/[locale]/admin/invoices/page.tsx`: Page wrapper and state controller.
- `components/admin/invoices/AdminInvoicesTable.tsx`: Tabular view with sortable headers.
- `components/admin/invoices/AdminInvoicesToolbar.tsx`: Search, status filter tabs, date filters.
- `components/admin/invoices/AdminInvoiceKpis.tsx`: Financial summary card grid.
- `components/admin/invoices/AdminInvoiceStatusBadge.tsx`: Staff badge component.

### Files To Modify:
- `components/admin/AdminSidebar.tsx`: Move financials out of `upcomingLogisticsModules` into `coreNavItems`:
  ```typescript
  {
    href: "/admin/invoices",
    label: isAr ? "إدارة الفواتير والماليات" : "Invoices & Billing",
    icon: Receipt,
  }
  ```
- `messages/en.json` & `messages/ar.json`: Add invoice management keys under `"admin.invoices"`.

---

## 6. Security Considerations
- View strictly gated by `requireAuth` checking `role === "staff" || role === "super_admin"`.
- Token URLs should only be shown or generated for authorized internal staff.
- Ensure all customer search queries are sanitized to prevent regex injection attacks in MongoDB.

---

## 7. Edge Cases Handled
- **Zero Invoices State**: Clean empty-state graphic with direct CTA "+ Create Your First Invoice".
- **Very Long Customer Names**: Truncated with tooltip to preserve table geometry.
- **Multi-currency**: If invoices exist in both EGP and USD, KPI cards group totals by primary operating currency (EGP) with foreign currency note.

---

## 8. Acceptance Criteria
- [ ] `/admin/invoices` accessible by staff, redirects unauthenticated/customer users.
- [ ] Admin sidebar contains active link to `/admin/invoices` with `Receipt` icon.
- [ ] KPI cards display total revenue, collected payments, outstanding balance, and draft counts.
- [ ] Table lists invoices with accurate pagination and sorting.
- [ ] Action buttons dynamically adapt based on status (e.g. "Edit" disabled for confirmed invoices).

---

## 9. Testing Instructions
1. Log in as a staff user and navigate to `/admin/invoices`.
2. Filter by status `draft` and verify only draft invoices appear.
3. Test search by typing partial invoice number and customer name.
4. Verify clicking pagination advances pages and updates browser URL query parameters.

---

## 10. Dependencies
- Depends on: `04-invoice-backend-api.md`, `05-invoice-calculations.md`
- Pre-requisite for: `07-create-invoice.md`, `08-edit-draft-invoice.md`, `11-draft-confirm-workflow.md`

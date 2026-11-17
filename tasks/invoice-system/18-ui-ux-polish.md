# Task 18 — UI/UX Polish, Localization & Responsive Perfection

## 1. Task Name
Enterprise UI/UX Polish, Bilingual i18n & Mobile Responsive Design

## 2. Goal
Elevate the Invoice Management System to enterprise standards across Arabic (RTL) and English (LTR) locales, optimize mobile responsiveness across phones, tablets, and wide screens, implement subtle micro-interactions with Framer Motion and Lucide icons, provide accessible status badges, and deliver seamless feedback via Sonner toasts.

---

## 3. Existing System
- [messages/en.json](file:///d:/khaled/nile_link_website-main/messages/en.json) & [messages/ar.json](file:///d:/khaled/nile_link_website-main/messages/ar.json): Core localization files using `next-intl`.
- [components/ui/Button.tsx](file:///d:/khaled/nile_link_website-main/components/ui/Button.tsx): Base button component.
- [app/globals.css](file:///d:/khaled/nile_link_website-main/app/globals.css): Tailwind CSS v4 setup with custom tokens.
- [package.json](file:///d:/khaled/nile_link_website-main/package.json): Includes `sonner`, `lucide-react`, `framer-motion`.

---

## 4. Requirements & Visual Standards

### 4.1 Bilingual Localization (`messages/en.json` & `messages/ar.json`)
Add a dedicated `"invoices"` namespace to both language files:
```json
{
  "admin": {
    "invoices": {
      "title": "Invoices & Billing",
      "subtitle": "Manage commercial freight invoices, review drafts, and track customer payments.",
      "createButton": "Create Invoice",
      "editInvoice": "Edit Draft Invoice",
      "reviewInvoice": "Review & Confirm",
      "confirmButton": "Confirm Invoice",
      "sendButton": "Send to Customer",
      "downloadPdf": "Download PDF",
      "print": "Print Invoice",
      "copyLink": "Copy Public Link",
      "status": {
        "draft": "Draft (Internal)",
        "confirmed": "Confirmed",
        "sent": "Sent",
        "partially_paid": "Partially Paid",
        "paid": "Paid in Full",
        "overdue": "Overdue",
        "cancelled": "Cancelled"
      },
      "kpi": {
        "totalInvoiced": "Total Invoiced",
        "paidAmount": "Collected Payments",
        "remainingAmount": "Outstanding Due",
        "pendingDrafts": "Drafts Requiring Review"
      },
      "table": {
        "invoiceNumber": "Invoice #",
        "customer": "Customer",
        "shipment": "Shipment Ref",
        "issueDate": "Issue Date",
        "dueDate": "Due Date",
        "total": "Total Amount",
        "status": "Status",
        "actions": "Actions"
      },
      "form": {
        "selectCustomer": "Select Customer",
        "selectShipment": "Select Linked Shipment (Optional)",
        "currency": "Currency",
        "lineItems": "Line Items",
        "description": "Description",
        "quantity": "Quantity",
        "unitPrice": "Unit Price",
        "total": "Total",
        "addItem": "Add Line Item",
        "subtotal": "Subtotal",
        "taxRate": "VAT Rate (%)",
        "additionalCharges": "Additional Surcharges",
        "discount": "Discount",
        "grandTotal": "Grand Total",
        "notes": "Public Client Notes",
        "internalNotes": "Internal Staff Notes (Private)"
      }
    }
  }
}
```

### 4.2 RTL Layout Adaptations
- For Arabic (`locale === "ar"`):
  - Form labels align to the right (`text-right rtl:text-right`).
  - Line-item trash and delete icons position on the left.
  - Directional icons (`ChevronLeft` / `ChevronRight`, `ArrowRight` / `ArrowLeft`) mirror appropriately.
  - Numbers, currencies, and tracking codes preserve LTR display (`dir="ltr"`) for proper readability.

### 4.3 Mobile & Tablet Responsiveness
- **Desktop (>= 1024px)**: Full tabular layout with side-by-side KPI cards and slide-over drawers.
- **Mobile (< 768px)**:
  - Table collapses into elegant mobile card views showing Invoice #, Customer, Amount, Status Badge, and an expandable Actions bottom sheet.
  - Line-item editor stacks Description, Quantity, and Unit Price vertically with full-width tap targets.

### 4.4 Micro-Interactions & Feedback
- Action buttons display loading spinners (`Loader2 className="animate-spin"`) while async mutations occur.
- Success and error alerts utilize `sonner`:
  - `toast.success(t("admin.invoices.toast.confirmed"))`
  - `toast.error(t("admin.invoices.toast.error"))`
- Skeleton placeholder loaders for tables while fetching.

---

## 5. Technical Implementation Details

### Files To Modify:
- `messages/en.json`: Add comprehensive English strings.
- `messages/ar.json`: Add comprehensive Arabic strings.
- `components/admin/invoices/AdminInvoicesTable.tsx`: Implement mobile card view fallback.
- `components/portal/financials/InvoiceLivePreview.tsx`: Add RTL support and print CSS rules.

---

## 6. Acceptance Criteria
- [ ] English and Arabic translations render accurately with zero raw text leaks.
- [ ] RTL layout functions cleanly in Arabic with right-aligned text and mirrored icons.
- [ ] Financial forms and modals respond smoothly on mobile viewports (< 480px).
- [ ] Status badges feature clear, accessible contrast in both light and dark themes.
- [ ] Toast notifications confirm every key user action (create, edit, confirm, send).

---

## 7. Testing Instructions
1. Switch language toggle to Arabic (`/ar/admin/invoices`).
2. Verify entire interface aligns right, numbers remain LTR, and labels display in Arabic.
3. Resize browser window to mobile width (375px); verify table transitions to card layout.
4. Test keyboard navigation: press Escape to close modals.

---

## 8. Dependencies
- Depends on: `06-admin-invoice-list.md`, `07-create-invoice.md`, `11-draft-confirm-workflow.md`, `12-customer-portal-invoices.md`
- Pre-requisite for: `19-testing.md`

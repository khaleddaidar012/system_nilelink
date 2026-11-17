# Task 13 — Invoice Lifecycle Notifications & Staff Review Alerts

## 1. Task Name
Multi-Audience Invoice Notifications & Review Alert Dispatcher

## 2. Goal
Integrate invoice lifecycle events into Nile Link's existing notification engine (`lib/models/Notification.ts`). Dispatch real-time in-app alerts to company staff when draft invoices require review, and alert customer account holders when new commercial invoices are confirmed and ready for payment.

---

## 3. Existing System
- [lib/models/Notification.ts](file:///d:/khaled/nile_link_website-main/lib/models/Notification.ts): Core notification model with `targetAudience: "customer" | "staff" | "all_staff" | "super_admin"`, `channel`, `severity`, `actionUrl`.
- [app/[locale]/admin/notifications/page.tsx](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/notifications/page.tsx): Staff notification center.
- [app/api/admin/notifications/route.ts](file:///d:/khaled/nile_link_website-main/app/api/admin/notifications/route.ts): Notification listing API.

---

## 4. Requirements & Event Triggers

### 4.1 Event Catalog
| Event Key | Trigger Point | Audience | Severity | In-App Message | Action URL |
|---|---|---|---|---|---|
| `invoice_draft_created` | Staff creates new draft invoice | `staff` / `all_staff` | `normal` | *"New Draft Invoice {invNumber} created for {customerName} is awaiting review."* | `/admin/invoices` |
| `invoice_confirmed` | Staff / Manager confirms draft | `customer` | `normal` | *"Commercial Invoice {invNumber} for {amount} {currency} is now available in your portal."* | `/portal/financials` |
| `invoice_sent` | Staff emails invoice to customer | `customer` | `normal` | *"Invoice {invNumber} has been dispatched to your email."* | `/portal/financials` |
| `invoice_overdue` | Due date elapsed with balance | `customer` & `staff` | `urgent` | *"Payment for Invoice {invNumber} is now overdue. Please review outstanding balance."* | `/portal/financials` |
| `invoice_payment_recorded`| Payment logged | `customer` & `staff` | `normal` | *"Payment of {amount} {currency} recorded for Invoice {invNumber}."* | `/portal/financials` |

---

## 5. Technical Implementation Details

### 5.1 Schema Expansion: `lib/models/Notification.ts`
1. Add `relatedInvoiceId` field:
   ```typescript
   relatedInvoiceId: {
     type: Schema.Types.ObjectId,
     ref: "Invoice",
     default: null,
     index: true,
   }
   ```
2. Add new values to `NotificationType`:
   ```typescript
   export type NotificationType =
     | "document_uploaded"
     | "document_approved"
     | "document_rejected"
     | "document_expiring_10d"
     | "document_expiring_7d"
     | "document_expiring_3d"
     | "document_expiring_1d"
     | "document_expired"
     | "manual_staff_warning"
     | "account_status_change"
     | "request_update"
     | "invoice_draft_created"
     | "invoice_confirmed"
     | "invoice_sent"
     | "invoice_overdue"
     | "invoice_payment_recorded"
   ```

### 5.2 Helper Dispatcher: `lib/services/invoice-notification-service.ts`
```typescript
import { Notification } from "@/lib/models"
import { IInvoice } from "@/lib/models/Invoice"

export async function notifyInvoiceCreated(invoice: IInvoice, customerName: string, creatorName: string) {
  await Notification.create({
    targetAudience: "staff",
    title: "New Draft Invoice Awaiting Review",
    message: `Draft invoice ${invoice.invoiceNumber} for ${customerName} was created by ${creatorName} and requires confirmation.`,
    channel: "in_app",
    type: "invoice_draft_created",
    severity: "normal",
    relatedInvoiceId: invoice._id,
    actionUrl: `/admin/invoices`,
  })
}

export async function notifyInvoiceConfirmed(invoice: IInvoice, customerName: string) {
  await Notification.create({
    targetAudience: "customer",
    recipientCustomerId: invoice.customerId,
    title: "New Commercial Invoice Available",
    message: `Invoice ${invoice.invoiceNumber} for ${invoice.totalAmount.toLocaleString()} ${invoice.currency} has been approved and issued to your account.`,
    channel: "in_app",
    type: "invoice_confirmed",
    severity: "normal",
    relatedInvoiceId: invoice._id,
    actionUrl: `/portal/financials`,
  })
}
```

### 5.3 Notification Mapping Updates:
In `app/api/admin/notifications/route.ts`:
```typescript
if (n.relatedInvoiceId) {
  actionUrl = `/admin/invoices`
}
```

---

## 6. Files To Create
- `lib/services/invoice-notification-service.ts`

## 7. Files To Modify
- `lib/models/Notification.ts`
- `app/api/admin/notifications/route.ts`

---

## 8. Security Considerations
- Customer notifications must be strictly scoped to `recipientCustomerId` matching the invoice owner.
- Customer users cannot see notifications where `targetAudience === "staff"`.

---

## 9. Acceptance Criteria
- [ ] Creating a draft invoice dispatches an in-app notification to the staff notification center.
- [ ] Confirming an invoice dispatches a notification targeted to the specific customer company.
- [ ] Notifications link to `/admin/invoices` (for staff) and `/portal/financials` (for customers).
- [ ] Unread badge count increments dynamically in the respective portals.

---

## 10. Testing Instructions
1. As staff, create a draft invoice.
2. Check staff notifications at `/admin/notifications`: verify review alert appears.
3. Confirm the invoice.
4. Log into the customer portal for the associated client: verify new invoice alert appears in customer notification list.

---

## 11. Dependencies
- Depends on: `02-database-models.md`, `04-invoice-backend-api.md`, `11-draft-confirm-workflow.md`
- Pre-requisite for: `15-send-invoice.md`

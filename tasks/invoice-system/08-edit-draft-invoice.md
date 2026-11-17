# Task 08 — Edit Draft Invoice & Pre-Confirmation Revision Flow

## 1. Task Name
Draft Invoice Editing, Revision History & Safe Deletion Flow

## 2. Goal
Enable staff and managers to safely inspect, adjust, and revise unconfirmed draft invoices before they are finalized. Guarantee that once an invoice transitions beyond the draft status (i.e. to `confirmed`, `sent`, or `paid`), it is permanently locked against silent in-place edits to preserve accounting integrity.

---

## 3. Existing System
- [components/admin/invoices/CreateInvoiceModal.tsx](file:///d:/khaled/nile_link_website-main/tasks/invoice-system/07-create-invoice.md): Form modal created in Task 07.
- [app/api/admin/invoices/[id]/route.ts](file:///d:/khaled/nile_link_website-main/tasks/invoice-system/04-invoice-backend-api.md): Core backend PUT and DELETE endpoints created in Task 04.
- [lib/models/InvoiceActivityLog.ts](file:///d:/khaled/nile_link_website-main/lib/models/InvoiceActivityLog.ts): Activity logger.

---

## 4. Requirements & Business Rules

### 4.1 Strict Edit Immutability Barrier
- **Allowed States**: Invoices with `status === "draft"` can be freely modified (items, quantities, rates, dates, notes).
- **Forbidden States**: Invoices with status `confirmed`, `sent`, `partially_paid`, `paid`, `overdue`, or `cancelled` CANNOT be edited.
- Attempting to edit a locked invoice in the UI displays a clear visual warning banner:
  > *"This invoice has already been confirmed and locked for accounting compliance. To make financial adjustments, issue a corrective debit/credit invoice or cancel this invoice with manager approval."*

### 4.2 Revision Tracking
- Every modification to a draft invoice records an entry in `InvoiceActivityLog`:
  ```typescript
  {
    action: "edit",
    actorId: session.userId,
    actorName: `${session.firstName} ${session.lastName}`,
    actorRole: session.role,
    previousState: { totalAmount: 40000, itemsCount: 2 },
    newState: { totalAmount: 45000, itemsCount: 3 },
    notes: "Added terminal handling surcharge upon receiving shipping line manifest."
  }
  ```

### 4.3 Safe Draft Deletion
- Unconfirmed draft invoices may be deleted if created by mistake.
- Requires explicit secondary confirmation dialog: *"Are you sure you want to delete Draft INV-2026-000042? This action cannot be undone."*
- Non-draft invoices have the delete button disabled or hidden.

---

## 5. Technical Implementation Details

### Files To Create:
- `components/admin/invoices/EditInvoiceModal.tsx`: Prefilled modal reusing `InvoiceLineItemsEditor` and `InvoiceFinancialSummaryBox`.
- `components/admin/invoices/DeleteInvoiceDialog.tsx`: Confirmation alert dialog for draft disposal.

### Unified Modal Alternative:
To keep code DRY, `CreateInvoiceModal.tsx` can be structured as `InvoiceFormModal.tsx` accepting props:
```typescript
interface InvoiceFormModalProps {
  isOpen: boolean
  onClose: () => void
  mode: "create" | "edit"
  initialInvoiceId?: string
  initialCustomerId?: string
  initialRequestId?: string
  onSuccess: (invoice: any) => void
}
```

### Data Fetching & Hydration Flow:
1. When `mode === "edit"`, fetch `GET /api/admin/invoices/[id]`.
2. Verify `data.invoice.status === "draft"`. If not, alert and abort.
3. Populate form fields: `customerId`, `relatedRequestId`, `currency`, `issueDate`, `dueDate`, `taxRate`, `discount`, `additionalCharges`, `notes`, `internalNotes`, `items`.
4. User modifies line items or notes.
5. On save: Submit `PUT /api/admin/invoices/[id]`.
6. Server re-verifies `draft` status, recalculates financial metrics, updates document, and creates `InvoiceActivityLog`.

---

## 6. Security Considerations
- **Server-Side Enforcement**: Even if a rogue user modifies client-side JavaScript to enable the "Save" button on a confirmed invoice, `PUT /api/admin/invoices/[id]` strictly verifies `invoice.status === "draft"` before executing any update.
- **CSRF & Token Validation**: Secured by Jose JWT session cookies.

---

## 7. Edge Cases Handled
- **Concurrent Confirmation by Manager**: Staff A is editing a draft while Manager B confirms the invoice simultaneously.
  - When Staff A clicks Save, the server detects `status !== "draft"` and rejects with HTTP 409 Conflict: *"Invoice was confirmed by another user and can no longer be edited."*
- **Item Removal to Zero**: Prevent saving if staff deletes all line items during edit.

---

## 8. Acceptance Criteria
- [ ] Clicking "Edit" on a draft opens the modal with all values pre-populated.
- [ ] Recalculates totals live as existing line items are modified.
- [ ] Saving updates the draft in the database and records an audit log.
- [ ] Attempting to edit a confirmed invoice is prohibited in both UI and API.
- [ ] Draft deletion requires confirmation and removes the document cleanly.

---

## 9. Testing Instructions
1. Create a draft invoice.
2. Click "Edit Draft". Change unit price of item 1 from 1,000 to 2,000 EGP.
3. Save changes. Verify database reflects updated subtotal and grand total.
4. Check `InvoiceActivityLog` to ensure the edit event was saved with the actor's name.
5. Manually set invoice status to `confirmed` in DB and attempt `PUT` request via cURL; verify 400 rejection.

---

## 10. Dependencies
- Depends on: `04-invoice-backend-api.md`, `05-invoice-calculations.md`, `07-create-invoice.md`
- Pre-requisite for: `11-draft-confirm-workflow.md`

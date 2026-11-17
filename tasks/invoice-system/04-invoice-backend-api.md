# Task 04 — Core Invoice Backend APIs & Route Handlers

## 1. Task Name
Admin Invoice REST API Endpoints & Request Validation

## 2. Goal
Implement the central administrative REST API endpoints for listing, creating, retrieving, updating, and deleting invoices under `/api/admin/invoices`, protected by session authentication and staff role authorization, backed by strict server-side schema validation.

---

## 3. Existing System
- [lib/auth/token-service.ts](file:///d:/khaled/nile_link_website-main/lib/auth/token-service.ts): Session extraction (`getSessionFromRequest`).
- [lib/auth/require-permission.ts](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts): Staff permission guard (`assertStaffPermission`).
- [lib/models/Invoice.ts](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Data model.
- [lib/models/Customer.ts](file:///d:/khaled/nile_link_website-main/lib/models/Customer.ts): Customer model.
- [lib/models/CustomerRequest.ts](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts): Shipment model.
- [lib/models/InvoiceActivityLog.ts](file:///d:/khaled/nile_link_website-main/lib/models/InvoiceActivityLog.ts): Activity logging.

---

## 4. Requirements & API Specifications

### 4.1 `GET /api/admin/invoices`
- **Purpose**: Paginated retrieval of invoices with comprehensive filtering.
- **Query Parameters**:
  - `page`: number (default: 1)
  - `limit`: number (default: 20, max: 100)
  - `search`: string (matches invoiceNumber or customer companyName case-insensitively)
  - `status`: string (`all` or specific status: `draft`, `confirmed`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled`)
  - `customerId`: string (optional ObjectId filter)
  - `requestId`: string (optional ObjectId filter)
  - `startDate`: ISO date string (issueDate >= startDate)
  - `endDate`: ISO date string (issueDate <= endDate)
- **Response**:
  ```json
  {
    "success": true,
    "invoices": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 142,
      "totalPages": 8
    },
    "metrics": {
      "totalDraftCount": 5,
      "totalConfirmedCount": 12,
      "totalPaidAmount": 1540000,
      "totalRemainingAmount": 420000
    }
  }
  ```

### 4.2 `POST /api/admin/invoices`
- **Purpose**: Create a new invoice in `draft` status.
- **Security**: Staff session required.
- **Payload**:
  ```typescript
  interface CreateInvoicePayload {
    customerId: string
    relatedRequestId?: string
    relatedQuoteId?: string
    currency: "EGP" | "USD" | "EUR"
    issueDate: string
    dueDate: string
    taxRate?: number
    discount?: number
    additionalCharges?: number
    notes?: string
    internalNotes?: string
    items: Array<{
      description: string
      quantity: number
      unitPrice: number
    }>
  }
  ```
- **Validation Rules**:
  - `customerId` must exist in `Customer` collection.
  - `items` array must contain at least 1 item with `quantity > 0` and `unitPrice >= 0`.
  - `dueDate` must be greater than or equal to `issueDate`.
  - Subtotal, tax, and totals are computed strictly server-side by `calculateInvoiceTotals()`.
  - `invoiceNumber` is generated server-side using `generateNextInvoiceNumber()`.
  - Status is ALWAYS initialized to `"draft"`.
  - Activity log entry `create` is recorded.

### 4.3 `GET /api/admin/invoices/[id]`
- **Purpose**: Fetch detailed invoice record.
- **Population**:
  - `customerId`: `companyName commercialRegisterNumber taxCardNumber contactEmail contactPhone address city country`
  - `relatedRequestId`: `trackingNumber serviceType services complianceType complianceNumber status`
  - `createdBy`, `confirmedBy`, `sentBy`: `firstName lastName email role`
- **Activity Log**: Appends recent 20 `InvoiceActivityLog` entries.
- **Payment History**: Appends associated `Payment` records.

### 4.4 `PUT /api/admin/invoices/[id]`
- **Purpose**: Update an existing draft invoice.
- **Safety Gate**:
  - **CRITICAL**: If `invoice.status !== "draft"`, return HTTP 400: `"Confirmed or sent invoices cannot be modified. Only draft invoices can be edited."`
- **Validation**: Re-calculates all financial totals server-side.
- **Audit**: Records `edit` action in `InvoiceActivityLog` comparing previous vs new state.

### 4.5 `DELETE /api/admin/invoices/[id]`
- **Purpose**: Delete an unconfirmed draft invoice.
- **Safety Gate**:
  - If `invoice.status !== "draft"`, return HTTP 403: `"Cannot delete confirmed, sent, or paid invoices. Invoices that have entered the commercial lifecycle must be cancelled instead."`
- **Audit**: If draft is deleted, logs deletion event before removing document.

---

## 5. Technical Implementation Structure

### Files To Create:
- `app/api/admin/invoices/route.ts`: Contains `GET` (list) and `POST` (create draft).
- `app/api/admin/invoices/[id]/route.ts`: Contains `GET` (details), `PUT` (update draft), `DELETE` (delete draft).
- `lib/validations/invoice-validation.ts`: Zod validation schemas for invoice creation and updates.

### Zod Schema Definition (`lib/validations/invoice-validation.ts`):
```typescript
import { z } from "zod"

export const InvoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unitPrice: z.number().nonnegative("Unit price cannot be negative"),
})

export const CreateInvoiceSchema = z.object({
  customerId: z.string().min(24, "Valid Customer ID required"),
  relatedRequestId: z.string().optional().nullable(),
  relatedQuoteId: z.string().optional().nullable(),
  currency: z.enum(["EGP", "USD", "EUR"]).default("EGP"),
  issueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  taxRate: z.number().min(0).max(100).default(14),
  discount: z.number().min(0).default(0),
  additionalCharges: z.number().min(0).default(0),
  notes: z.string().max(2000).optional().default(""),
  internalNotes: z.string().max(2000).optional().default(""),
  items: z.array(InvoiceItemSchema).min(1, "At least one item is required"),
})

export const UpdateInvoiceSchema = CreateInvoiceSchema.partial()
```

---

## 6. Security & Authorization Checks
- Every route calls `assertStaffPermission(req)` or `requireAuth(req, ["staff", "super_admin"])`.
- Reject any request from customer roles with `403 Forbidden`.
- Strip `internalNotes` from any non-staff response or audit view.
- Strictly validate MongoDB ObjectIds with `mongoose.Types.ObjectId.isValid(id)`.

---

## 7. Edge Cases Handled
1. **Invalid Customer ID**: If customer does not exist, return 400 with descriptive error message.
2. **Editing Confirmed Invoices**: Block with 400 and explicit message explaining that amendments must follow the void/cancel procedure.
3. **Attempted Deletion of Confirmed Invoice**: Block with 403; suggest cancellation instead.
4. **Dates Discrepancy**: Reject payloads where `dueDate < issueDate`.

---

## 8. Acceptance Criteria
- [ ] `GET /api/admin/invoices` returns paginated list with search, status, and customer filters.
- [ ] `POST /api/admin/invoices` saves draft invoice with atomic invoice number and server-calculated totals.
- [ ] `PUT /api/admin/invoices/[id]` strictly prohibits updates if status is not `draft`.
- [ ] `DELETE /api/admin/invoices/[id]` strictly prohibits deletion of non-draft invoices.
- [ ] `InvoiceActivityLog` records every creation, modification, and deletion attempt.

---

## 9. Testing Instructions
1. Test `POST /api/admin/invoices` with invalid item quantities and verify 400 response from Zod.
2. Test `POST /api/admin/invoices` with valid payload; verify DB record created with `status: "draft"`.
3. Manually update DB status to `confirmed`, then attempt `PUT` and `DELETE`; verify requests are blocked with HTTP 400/403.

---

## 10. Dependencies
- Depends on: `02-database-models.md`, `03-invoice-numbering.md`, `05-invoice-calculations.md`
- Pre-requisite for: `06-admin-invoice-list.md`, `07-create-invoice.md`, `08-edit-draft-invoice.md`

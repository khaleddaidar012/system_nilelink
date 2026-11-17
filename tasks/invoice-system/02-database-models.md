# Task 02 — Database Models & Schema Design

## 1. Task Name
Database Schema Expansion, Immutable Snapshots & Audit Collection

## 2. Goal
Update the existing `Invoice` model to support the complete commercial lifecycle (including the `confirmed` status, item breakdown, and immutable snapshots), create the atomic `InvoiceSequence` counter collection for concurrency-safe numbering, and create the `InvoiceActivityLog` model for complete audit traceability.

---

## 3. Existing System
- [lib/models/Invoice.ts](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Current basic schema. Missing `confirmed` status, snapshots, internal notes, audit fields, and creator references.
- [lib/models/DocumentActivityLog.ts](file:///d:/khaled/nile_link_website-main/lib/models/DocumentActivityLog.ts): Standard model pattern for activity auditing.
- [lib/models/Customer.ts](file:///d:/khaled/nile_link_website-main/lib/models/Customer.ts): Data source for customer snapshots.
- [lib/models/CustomerRequest.ts](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts): Data source for shipment snapshots.
- [lib/models/index.ts](file:///d:/khaled/nile_link_website-main/lib/models/index.ts): Central model exports.

---

## 4. Requirements

1. **Status Enum Update**: Extend `InvoiceStatus` to:
   ```typescript
   export type InvoiceStatus =
     | "draft"
     | "confirmed"
     | "sent"
     | "partially_paid"
     | "paid"
     | "overdue"
     | "cancelled"
   ```
2. **Immutable Snapshot Objects**:
   - `customerSnapshot`: Preserves client legal name, address, tax card number, CR number, phone, and email at confirmation time.
   - `shipmentSnapshot`: Preserves tracking number, service type, origin, destination, compliance type (ACID/UCR), and compliance number.
   - `issuerSnapshot`: Preserves Nile Link corporate identity (legal company name, VAT ID, registered office address, contact information, bank/IBAN payment routing).
3. **Audit & Personnel Tracking**:
   - `createdBy`: ObjectId ref User
   - `updatedBy`: ObjectId ref User
   - `confirmedBy`: ObjectId ref User
   - `confirmedAt`: Date
   - `sentBy`: ObjectId ref User
   - `sentAt`: Date
   - `recipientEmail`: String (actual email address invoice was delivered to)
4. **Internal Staff Notes**:
   - `internalNotes`: Notes viewable ONLY by staff and admins, stripped completely from customer-facing APIs and customer PDF renders.
   - `notes`: Public client-facing notes (e.g. payment terms, delivery instructions).
5. **Additional Charges & Tax Details**:
   - `additionalCharges`: Number (e.g. port demurrage, customs terminal fees, handling fees).
   - `taxRate`: Number (percentage, e.g., 14.0 for Egyptian VAT).
6. **Atomic Sequence Counter**:
   - Create `InvoiceSequence` schema with `_id: string` (e.g. `"INV-2026"`) and `seq: number`.
7. **Invoice Activity Log**:
   - Create `InvoiceActivityLog` schema to record actions: `created`, `edited`, `reviewed`, `confirmed`, `sent`, `payment_recorded`, `cancelled`.

---

## 5. Technical Implementation Details

### 5.1 Updated `Invoice.ts` Schema Definition
```typescript
export interface ICustomerSnapshot {
  companyName: string
  commercialRegisterNumber: string
  taxCardNumber: string
  address: string
  city: string
  country: string
  contactPhone: string
  contactEmail: string
}

export interface IShipmentSnapshot {
  requestId: string
  trackingNumber: string
  serviceType: string
  origin?: string
  destination?: string
  complianceType?: "ACID" | "UCR" | null
  complianceNumber?: string
}

export interface IIssuerSnapshot {
  legalName: string
  address: string
  taxId: string
  phone: string
  email: string
  bankName?: string
  bankAccountName?: string
  bankIban?: string
  bankSwift?: string
}

export interface IInvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface IInvoice extends MongooseDoc {
  customerId: mongoose.Types.ObjectId
  invoiceNumber: string
  relatedQuoteId?: mongoose.Types.ObjectId
  relatedRequestId?: mongoose.Types.ObjectId
  
  // Financials
  subtotal: number
  taxRate: number // e.g. 14 for 14%
  tax: number
  discount: number
  additionalCharges: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  currency: string // "EGP" | "USD" | "EUR"
  
  items: IInvoiceItem[]
  
  status: InvoiceStatus
  issueDate: Date
  dueDate: Date
  
  notes?: string
  internalNotes?: string
  token: string
  pdfUrl?: string
  
  // Snapshots (populated upon confirmation)
  customerSnapshot?: ICustomerSnapshot
  shipmentSnapshot?: IShipmentSnapshot
  issuerSnapshot?: IIssuerSnapshot
  
  // Tracking
  createdBy: mongoose.Types.ObjectId
  updatedBy?: mongoose.Types.ObjectId
  confirmedBy?: mongoose.Types.ObjectId
  confirmedAt?: Date
  sentBy?: mongoose.Types.ObjectId
  sentAt?: Date
  recipientEmail?: string
  
  createdAt: Date
  updatedAt: Date
}
```

### 5.2 `InvoiceSequence.ts` Schema
```typescript
import mongoose, { Schema, Document, Model } from "mongoose"

export interface IInvoiceSequence extends Document {
  _id: string // Format: "INV_YYYY" e.g. "INV_2026"
  seq: number
  updatedAt: Date
}

const InvoiceSequenceSchema = new Schema<IInvoiceSequence>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const InvoiceSequence: Model<IInvoiceSequence> =
  mongoose.models.InvoiceSequence ||
  mongoose.model<IInvoiceSequence>("InvoiceSequence", InvoiceSequenceSchema)
export default InvoiceSequence
```

### 5.3 `InvoiceActivityLog.ts` Schema
```typescript
import mongoose, { Schema, Document, Model } from "mongoose"

export type InvoiceAction =
  | "create"
  | "edit"
  | "confirm"
  | "send"
  | "payment_recorded"
  | "status_change"
  | "cancel"

export interface IInvoiceActivityLog extends Document {
  invoiceId: mongoose.Types.ObjectId
  customerId: mongoose.Types.ObjectId
  actorId?: mongoose.Types.ObjectId
  actorName: string
  actorRole: string
  action: InvoiceAction
  previousState?: Record<string, any>
  newState?: Record<string, any>
  notes?: string
  ipAddress?: string
  createdAt: Date
}

const InvoiceActivityLogSchema = new Schema<IInvoiceActivityLog>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: {
      type: String,
      enum: ["create", "edit", "confirm", "send", "payment_recorded", "status_change", "cancel"],
      required: true,
      index: true,
    },
    previousState: { type: Schema.Types.Mixed, default: null },
    newState: { type: Schema.Types.Mixed, default: null },
    notes: { type: String, default: "" },
    ipAddress: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

InvoiceActivityLogSchema.index({ invoiceId: 1, createdAt: -1 })
```

---

## 6. Files To Create
- `lib/models/InvoiceSequence.ts`
- `lib/models/InvoiceActivityLog.ts`

## 7. Files To Modify
- `lib/models/Invoice.ts`
- `lib/models/index.ts`

---

## 8. Database Indexes
- `Invoice`:
  - `{ invoiceNumber: 1 }` (unique, existing)
  - `{ customerId: 1, status: 1 }` (compound, existing)
  - `{ relatedRequestId: 1 }` (index for shipment lookups)
  - `{ status: 1, issueDate: -1 }` (for admin filtering)
  - `{ token: 1 }` (unique, existing)
- `InvoiceActivityLog`:
  - `{ invoiceId: 1, createdAt: -1 }`
  - `{ customerId: 1, createdAt: -1 }`

---

## 9. Security & Validation Rules
- `internalNotes` must be marked with `{ select: false }` or explicitly filtered out whenever query responses are prepared for non-staff callers.
- In Mongoose pre-save hook: ensure `status === "confirmed"` is rejected if `items` array is empty or `totalAmount <= 0`.

---

## 10. Acceptance Criteria
- [ ] `InvoiceStatus` enum includes `"confirmed"` alongside `"draft"`, `"sent"`, `"paid"`, `"partially_paid"`, `"overdue"`, `"cancelled"`.
- [ ] Snapshot sub-schemas (`customerSnapshot`, `shipmentSnapshot`, `issuerSnapshot`) defined.
- [ ] Tracking fields (`createdBy`, `confirmedBy`, `confirmedAt`, `sentBy`, `sentAt`, `recipientEmail`) added.
- [ ] `InvoiceSequence` model created with atomic counter compatibility.
- [ ] `InvoiceActivityLog` model created and exported in `lib/models/index.ts`.
- [ ] Pre-save hook properly calculates remaining balance without overwriting manual confirmed states.

---

## 11. Testing Instructions
1. Run a test script in `scratch/test-models.ts` connecting to MongoDB.
2. Create an invoice with status `draft`.
3. Update status to `confirmed` with dummy snapshot objects.
4. Verify all indexes build cleanly in MongoDB without schema collision.

---

## 12. Dependencies
- Depends on: `01-current-system-analysis.md`
- Pre-requisite for: `03-invoice-numbering.md`, `04-invoice-backend-api.md`, `05-invoice-calculations.md`

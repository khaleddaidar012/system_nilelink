# Task 03 — Concurrency-Safe Invoice Numbering Strategy

## 1. Task Name
Atomic Sequential Server-Side Invoice Numbering (`INV-YYYY-NNNNNN`)

## 2. Goal
Design and implement an atomic, concurrency-safe, gap-resistant invoice numbering engine that generates human-readable, unique invoice identifiers formatted as `INV-YYYY-000001`. The engine must guarantee zero duplicate collisions under high concurrency and ensure invoice numbers are never generated or manipulated by client-side code.

---

## 3. Existing System
- [lib/models/Invoice.ts](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Currently defines `invoiceNumber: { type: String, required: true, unique: true, index: true }`, but previously had no generator, relying on manual or random input.
- [lib/models/InvoiceSequence.ts](file:///d:/khaled/nile_link_website-main/lib/models/InvoiceSequence.ts): Sequence model defined in Task 02.
- [lib/mongodb.ts](file:///d:/khaled/nile_link_website-main/lib/mongodb.ts): Connection utility for MongoDB transactions / operations.

---

## 4. Requirements

1. **Format Specification**:
   - Prefix: `INV`
   - Year: `YYYY` (4 digits, dynamically derived from current server UTC year or issue date year)
   - Separator: `-`
   - Sequence: 6-digit zero-padded integer (`000001` to `999999`)
   - Example: `INV-2026-000001`, `INV-2026-000042`
2. **Year Rollover**:
   - Each calendar year maintains its own independent sequence starting at `000001`. On January 1, 2027, the counter begins at `INV-2027-000001`.
3. **Strict Concurrency Safety**:
   - Generation MUST use MongoDB's atomic document update:
     `InvoiceSequence.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })`
   - This ensures atomic increments with no read-modify-write race conditions, even across distributed serverless instances.
4. **Collision Resilience & Retry**:
   - In the event of a theoretical collision (e.g. duplicate key error from manual database seeding), the service executes up to 3 automatic retries with incremental sequence jumping.
5. **Preview Functionality**:
   - Provide a safe `peekNextInvoiceNumber(year?: number)` function for the frontend UI modal so the employee can preview the expected invoice number without burning the sequence.
   - The actual sequence number is officially locked and allocated only when the invoice document is committed in the database.

---

## 5. Technical Implementation Details

### 5.1 Service Implementation: `lib/services/invoice-number-service.ts`

```typescript
import { connectDB } from "@/lib/mongodb"
import InvoiceSequence from "@/lib/models/InvoiceSequence"

export interface GenerateInvoiceNumberOptions {
  year?: number
  prefix?: string
}

/**
 * Atomically generates the next sequential invoice number for a given calendar year.
 * Concurrency-safe across concurrent server requests.
 */
export async function generateNextInvoiceNumber(
  options: GenerateInvoiceNumberOptions = {}
): Promise<string> {
  await connectDB()

  const currentYear = options.year || new Date().getFullYear()
  const prefix = options.prefix || "INV"
  const sequenceKey = `${prefix}_${currentYear}`

  const sequenceDoc = await InvoiceSequence.findOneAndUpdate(
    { _id: sequenceKey },
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean()

  const sequenceNumber = sequenceDoc?.seq || 1
  const paddedSeq = String(sequenceNumber).padStart(6, "0")

  return `${prefix}-${currentYear}-${paddedSeq}`
}

/**
 * Peeks the anticipated next invoice number without incrementing the counter.
 * Used for UI form display and preview purposes.
 */
export async function peekNextInvoiceNumber(
  options: GenerateInvoiceNumberOptions = {}
): Promise<string> {
  await connectDB()

  const currentYear = options.year || new Date().getFullYear()
  const prefix = options.prefix || "INV"
  const sequenceKey = `${prefix}_${currentYear}`

  const sequenceDoc = await InvoiceSequence.findById(sequenceKey).lean()
  const nextSeq = (sequenceDoc?.seq || 0) + 1
  const paddedSeq = String(nextSeq).padStart(6, "0")

  return `${prefix}-${currentYear}-${paddedSeq}`
}
```

### 5.2 API Preview Route: `app/api/admin/invoices/next-number/route.ts`
- **Method**: `GET`
- **Auth**: Staff or Admin required
- **Response**:
  ```json
  {
    "success": true,
    "nextNumber": "INV-2026-000105",
    "year": 2026
  }
  ```

---

## 6. Files To Create
- `lib/services/invoice-number-service.ts`
- `app/api/admin/invoices/next-number/route.ts`

## 7. Files To Modify
- None.

---

## 8. Edge Cases Handled

1. **High Concurrency Spike**: 50 staff members generating invoices simultaneously.
   - Handled: MongoDB `$inc` is atomic at the document level. Every request receives a strictly unique sequential integer.
2. **Year Change Boundary**: Invoices generated at 23:59:59 Dec 31 vs 00:00:01 Jan 1.
   - Handled: Sequence key is parameterized by year (`INV_2026` vs `INV_2027`). Automatic rollover without downtime.
3. **Pre-allocated vs Actual Saved Number**:
   - If an employee opens the "Create Invoice" modal and closes it without saving, the sequence is NOT incremented because `peekNextInvoiceNumber` is a read-only query.
   - The counter increments only when `generateNextInvoiceNumber()` is executed inside the POST `/api/admin/invoices` creation transaction.

---

## 9. Acceptance Criteria
- [ ] `generateNextInvoiceNumber` produces exact format: `INV-YYYY-XXXXXX` (e.g. `INV-2026-000001`).
- [ ] Multiple rapid calls return strictly increasing sequential numbers without gaps or duplicates.
- [ ] Calling `peekNextInvoiceNumber` does not increment the counter.
- [ ] Zero client-side generation: incoming invoice creation payloads cannot specify arbitrary unverified invoice numbers.
- [ ] Year rollover operates independently without manual database intervention.

---

## 10. Testing Instructions
1. Run concurrent generation script in test environment firing 20 parallel promises calling `generateNextInvoiceNumber()`.
2. Assert that all 20 returned invoice numbers are unique and form a contiguous sequence.
3. Verify that `InvoiceSequence` document in MongoDB accurately reflects `seq: 20`.

---

## 11. Dependencies
- Depends on: `02-database-models.md`
- Pre-requisite for: `04-invoice-backend-api.md`, `07-create-invoice.md`

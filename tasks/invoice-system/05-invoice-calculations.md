# Task 05 — Safe Financial Calculation Engine & Precision Rounding

## 1. Task Name
Deterministic Invoice Calculation Engine & Floating-Point Precision Guard

## 2. Goal
Build a centralized, deterministic financial calculation engine in `lib/engine/invoice-calculator.ts` that safely calculates line item totals, subtotal, tax amount, discounts, additional charges, total amount, and remaining balances. Prevent JavaScript floating-point errors (e.g., `0.1 + 0.2 !== 0.3`), and ensure identical calculations on both the server API and reactive frontend client components.

---

## 3. Existing System
- [lib/engine/account-health-engine.ts](file:///d:/khaled/nile_link_website-main/lib/engine/account-health-engine.ts): Existing engine pattern in the codebase.
- [lib/models/Invoice.ts](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Stores financial amounts.
- Current codebase relies on ad-hoc addition in UI components without consistent decimal rounding rules.

---

## 4. Requirements & Mathematical Formulas

### 4.1 Precision Standard
All currency figures must be computed with 2-decimal precision (e.g. `1250.50 EGP`).
Calculations must employ fixed-point scaling (or integer rounding) to eradicate IEEE 754 floating-point inaccuracies:
```typescript
function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}
```

### 4.2 Financial Formulas
1. **Line Item Total**:
   $$\text{itemTotal} = \text{roundToTwo}(\text{quantity} \times \text{unitPrice})$$
2. **Subtotal**:
   $$\text{subtotal} = \text{roundToTwo}\left(\sum_{i=1}^{n} \text{itemTotal}_i\right)$$
3. **Discount Deduction**:
   $$\text{cappedDiscount} = \text{roundToTwo}(\min(\max(\text{discount}, 0), \text{subtotal}))$$
4. **Additional Charges**:
   $$\text{charges} = \text{roundToTwo}(\max(\text{additionalCharges}, 0))$$
5. **Tax Calculation (Egyptian VAT Standard)**:
   VAT applies to services rendered net of allowable discounts plus direct service surcharges:
   $$\text{taxableBase} = \text{roundToTwo}(\text{subtotal} - \text{cappedDiscount} + \text{charges})$$
   $$\text{taxAmount} = \text{roundToTwo}\left(\text{taxableBase} \times \frac{\text{taxRate}}{100}\right)$$
6. **Total Invoice Amount**:
   $$\text{totalAmount} = \text{roundToTwo}(\text{taxableBase} + \text{taxAmount})$$
7. **Remaining Balance**:
   $$\text{remainingAmount} = \text{roundToTwo}(\max(\text{totalAmount} - \text{paidAmount}, 0))$$

---

## 5. Technical Implementation: `lib/engine/invoice-calculator.ts`

```typescript
export interface RawInvoiceItemInput {
  description: string
  quantity: number | string
  unitPrice: number | string
}

export interface CalculatedInvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InvoiceCalculationInput {
  items: RawInvoiceItemInput[]
  taxRate?: number | string
  discount?: number | string
  additionalCharges?: number | string
  paidAmount?: number | string
}

export interface InvoiceCalculationResult {
  items: CalculatedInvoiceItem[]
  subtotal: number
  taxRate: number
  tax: number
  discount: number
  additionalCharges: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  isValid: boolean
  errors: string[]
}

/**
 * Rounds a number to exactly two decimal places safely.
 */
export function roundCurrency(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Centrally computes all invoice financial metrics.
 * Safe for execution in both Node.js server environments and browser clients.
 */
export function calculateInvoiceTotals(input: InvoiceCalculationInput): InvoiceCalculationResult {
  const errors: string[] = []
  const taxRate = Math.max(0, Number(input.taxRate ?? 14))
  const rawDiscount = Math.max(0, Number(input.discount ?? 0))
  const additionalCharges = roundCurrency(Math.max(0, Number(input.additionalCharges ?? 0)))
  const paidAmount = roundCurrency(Math.max(0, Number(input.paidAmount ?? 0)))

  // 1. Calculate each line item
  const calculatedItems: CalculatedInvoiceItem[] = []
  let subtotal = 0

  if (!input.items || input.items.length === 0) {
    errors.push("Invoice must contain at least one line item.")
  }

  for (let i = 0; i < (input.items || []).length; i++) {
    const raw = input.items[i]
    const qty = Number(raw.quantity)
    const price = Number(raw.unitPrice)

    if (isNaN(qty) || qty <= 0) {
      errors.push(`Item ${i + 1}: Quantity must be greater than 0.`)
    }
    if (isNaN(price) || price < 0) {
      errors.push(`Item ${i + 1}: Unit price cannot be negative.`)
    }

    const itemTotal = roundCurrency(Math.max(0, qty) * Math.max(0, price))
    subtotal = roundCurrency(subtotal + itemTotal)

    calculatedItems.push({
      description: (raw.description || "").trim(),
      quantity: qty,
      unitPrice: price,
      total: itemTotal,
    })
  }

  // 2. Validate and cap discount
  let discount = roundCurrency(rawDiscount)
  if (discount > subtotal) {
    errors.push("Discount amount cannot exceed the subtotal.")
    discount = subtotal
  }

  // 3. Taxable Base & Tax Calculation
  const taxableBase = roundCurrency(subtotal - discount + additionalCharges)
  const tax = roundCurrency((taxableBase * taxRate) / 100)

  // 4. Final Totals
  const totalAmount = roundCurrency(taxableBase + tax)
  const remainingAmount = roundCurrency(Math.max(0, totalAmount - paidAmount))

  return {
    items: calculatedItems,
    subtotal,
    taxRate,
    tax,
    discount,
    additionalCharges,
    totalAmount,
    paidAmount,
    remainingAmount,
    isValid: errors.length === 0,
    errors,
  }
}
```

---

## 6. Files To Create
- `lib/engine/invoice-calculator.ts`

## 7. Files To Modify
- None.

---

## 8. Security Considerations
- **Total Tampering Prevention**: The frontend displays totals generated by this engine, but the backend API completely recalculates all figures from the raw `items`, `taxRate`, `discount`, and `additionalCharges`. Client-supplied totals in request bodies are ignored.
- **Negative Value Injection**: Quantities, unit prices, and surcharges cannot be negative. Prevents fraud scenarios where negative additional charges could artificially reduce taxable totals.

---

## 9. Acceptance Criteria
- [ ] Precision function `roundCurrency` handles standard float edge cases (`0.1 + 0.2 = 0.3`).
- [ ] `calculateInvoiceTotals` correctly computes line item totals, subtotal, tax at 14%, discounts, and net total.
- [ ] Discounts exceeding subtotal are rejected or capped with error reported.
- [ ] Resulting data structure is 100% compatible with Mongoose `Invoice` schema.

---

## 10. Testing Instructions
1. Create a unit test checking:
   - 3 items: (1.5 qty * 100.33), (2.0 qty * 50.25), (10 qty * 0.10).
   - VAT rate: 14%.
   - Discount: 50.
   - Additional charges: 120.
2. Verify exact match against manual accounting calculation down to the exact piastre/cent.

---

## 11. Dependencies
- Pre-requisite for: `04-invoice-backend-api.md`, `07-create-invoice.md`, `08-edit-draft-invoice.md`

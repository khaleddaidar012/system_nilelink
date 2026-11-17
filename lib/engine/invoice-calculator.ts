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
 * Rounds a number to exactly two decimal places safely to prevent floating point inaccuracies.
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
      quantity: isNaN(qty) ? 0 : qty,
      unitPrice: isNaN(price) ? 0 : price,
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
  const taxableBase = roundCurrency(Math.max(0, subtotal - discount + additionalCharges))
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

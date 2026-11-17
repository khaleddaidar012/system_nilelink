export type LedgerTransactionType =
  | "shipment_charge"
  | "invoice"
  | "payment"
  | "discount"
  | "adjustment"

export interface ICustomerLedgerEntry {
  id: string
  date: string // ISO string (e.g. "2026-10-01")
  type: LedgerTransactionType
  description: string
  reference: string // e.g. "INV-2026-0001", "TRK-NL-83921", "PAY-CIB-9021"
  relatedShipmentTracking?: string
  relatedInvoiceNumber?: string
  debit: number // Customer debt increases (Invoices / Surcharges)
  credit: number // Customer payments / credits increase (Payments / Discounts)
  balance: number // Running balance after this transaction
  currency: string
  status?: string
  notes?: string
}

export interface ICustomerStatementSummary {
  openingBalance: number
  totalDebit: number
  totalCredit: number
  closingBalance: number
  currency: string
  periodStart?: string
  periodEnd?: string
  totalTransactions: number
}

export interface ICustomerStatement {
  customer: {
    id: string
    companyName: string
    commercialRegisterNumber?: string
    taxCardNumber?: string
    contactEmail: string
    contactPhone?: string
    address?: string
    city?: string
    country?: string
  }
  period: {
    from?: string
    to?: string
  }
  generatedAt: string
  generatedBy: {
    id: string
    name: string
    email: string
  }
  summary: ICustomerStatementSummary
  entries: ICustomerLedgerEntry[]
}

export interface StatementFilterQuery {
  customerId: string
  fromDate?: string
  toDate?: string
  type?: "all" | "shipments" | "invoices" | "payments"
  currency?: string
}

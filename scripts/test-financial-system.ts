import assert from "node:assert"
import { getDocumentTypeMeta, DOCUMENT_TYPE_REGISTRY } from "../lib/services/document-type-helper"
import { CreateInvoiceSchema } from "../lib/validations/invoice-validation"
import { computeLedgerFromRecords } from "../lib/engine/customer-ledger-engine"
import { generateCustomerStatementPdfBuffer } from "../lib/services/statement-pdf-generator"
import { generateInvoicePdfBuffer } from "../lib/services/invoice-pdf-generator"

console.log("======================================================")
console.log("🧪 RUNNING SUITE: Financial Documents & Statement System")
console.log("======================================================\n")

// TEST 1: Document Type Registry & Helper
console.log("TEST 1: Document Type Helper & Metadata")
const statementMeta = getDocumentTypeMeta("statement")
assert.strictEqual(statementMeta.titleAr, "كشف حساب")
assert.strictEqual(statementMeta.titleEn, "ACCOUNT STATEMENT")
assert.strictEqual(statementMeta.requiresTaxAuth, false)

const invoiceMeta = getDocumentTypeMeta("invoice")
assert.strictEqual(invoiceMeta.titleAr, "فاتورة")
assert.strictEqual(invoiceMeta.titleEn, "COMMERCIAL INVOICE")
assert.strictEqual(invoiceMeta.requiresTaxAuth, false)

const taxInvoiceMeta = getDocumentTypeMeta("tax_invoice")
assert.strictEqual(taxInvoiceMeta.titleAr, "فاتورة ضريبية")
assert.strictEqual(taxInvoiceMeta.titleEn, "TAX INVOICE")
assert.strictEqual(taxInvoiceMeta.requiresTaxAuth, true)

// Fallback test
const defaultMeta = getDocumentTypeMeta(undefined as any)
assert.strictEqual(defaultMeta.type, "statement")
console.log("  ✅ Test 1 Passed: Document Type Registry validated.\n")

// TEST 2: Zod Schema Validation
console.log("TEST 2: Zod Schema Validation for Document Types")
const validBase = {
  customerMode: "registered",
  customerId: "60d5ecb8b5c9c614b0b11111",
  currency: "EGP",
  issueDate: "2026-10-01",
  dueDate: "2026-10-15",
  items: [{ description: "Sea Freight Services", quantity: 1, unitPrice: 5000 }],
}

const resStatement = CreateInvoiceSchema.safeParse({ ...validBase, documentType: "statement" })
assert.strictEqual(resStatement.success, true)

const resInvoice = CreateInvoiceSchema.safeParse({ ...validBase, documentType: "invoice" })
assert.strictEqual(resInvoice.success, true)

const resTaxInvoice = CreateInvoiceSchema.safeParse({ ...validBase, documentType: "tax_invoice" })
assert.strictEqual(resTaxInvoice.success, true)

const resInvalid = CreateInvoiceSchema.safeParse({ ...validBase, documentType: "proforma_invalid" })
assert.strictEqual(resInvalid.success, false)
console.log("  ✅ Test 2 Passed: Zod schemas enforce valid document types.\n")

// TEST 3: Customer Ledger Engine Math
console.log("TEST 3: Customer Ledger Math & Invariants")
const mockCustomer = {
  _id: "cust-1",
  companyName: "Al-Ahram Trading",
  contactEmail: "accounting@alahram.eg",
  contactPhone: "+201000000000",
  address: "Nasr City, Cairo, Egypt",
}

// Transaction history:
// 2026-01-10: Prior Invoice: 10,000 (Debit)
// 2026-01-20: Prior Payment: 4,000 (Credit) -> Prior net = 6,000 opening balance
// In-period (2026-02-01 to 2026-02-28):
// 2026-02-05: In-period Invoice: 15,000 (Debit) -> Balance: 6,000 + 15,000 = 21,000
// 2026-02-15: In-period Payment: 11,000 (Credit) -> Balance: 21,000 - 11,000 = 10,000
// 2026-02-20: In-period Invoice: 5,000 (Debit) -> Balance: 10,000 + 5,000 = 15,000
// Expected Closing Balance: 15,000
const mockInvoices = [
  {
    _id: "inv-1",
    invoiceNumber: "INV-2026-0001",
    documentType: "invoice",
    issueDate: new Date("2026-01-10T10:00:00Z"),
    totalAmount: 10000,
    paidAmount: 4000,
    status: "partially_paid",
    currency: "EGP",
    items: [{ description: "Ocean Freight", quantity: 1, unitPrice: 10000 }],
  },
  {
    _id: "inv-2",
    invoiceNumber: "INV-2026-0002",
    documentType: "tax_invoice",
    issueDate: new Date("2026-02-05T10:00:00Z"),
    totalAmount: 15000,
    paidAmount: 11000,
    status: "partially_paid",
    currency: "EGP",
    items: [{ description: "Air Freight Cairo-Dubai", quantity: 1, unitPrice: 15000 }],
  },
  {
    _id: "inv-3",
    invoiceNumber: "INV-2026-0003",
    documentType: "statement",
    issueDate: new Date("2026-02-20T10:00:00Z"),
    totalAmount: 5000,
    paidAmount: 0,
    status: "confirmed",
    currency: "EGP",
    items: [{ description: "Customs Clearance Port Said", quantity: 1, unitPrice: 5000 }],
  },
]

const mockPayments = [
  {
    _id: "pay-1",
    paymentNumber: "PAY-2026-0001",
    paymentDate: new Date("2026-01-20T12:00:00Z"),
    amount: 4000,
    method: "bank_transfer",
    referenceNumber: "CIB-9921",
    currency: "EGP",
    status: "confirmed",
  },
  {
    _id: "pay-2",
    paymentNumber: "PAY-2026-0002",
    paymentDate: new Date("2026-02-15T14:00:00Z"),
    amount: 11000,
    method: "bank_transfer",
    referenceNumber: "NBE-4412",
    currency: "EGP",
    status: "confirmed",
  },
]

const ledgerResult = computeLedgerFromRecords({
  customer: mockCustomer,
  invoices: mockInvoices,
  payments: mockPayments,
  fromDate: "2026-02-01",
  toDate: "2026-02-28",
  filterType: "all",
})

console.log("  Opening Balance:", ledgerResult.summary.openingBalance)
console.log("  Total Debits:", ledgerResult.summary.totalDebit)
console.log("  Total Credits:", ledgerResult.summary.totalCredit)
console.log("  Closing Balance:", ledgerResult.summary.closingBalance)
console.log("  Entries Count:", ledgerResult.entries.length)

assert.strictEqual(ledgerResult.summary.openingBalance, 6000, "Opening balance must be 10,000 - 4,000 = 6,000")
assert.strictEqual(ledgerResult.summary.totalDebit, 20000, "In-period debits must be 15,000 + 5,000 = 20,000")
assert.strictEqual(ledgerResult.summary.totalCredit, 11000, "In-period credits must be 11,000")
assert.strictEqual(ledgerResult.summary.closingBalance, 15000, "Closing balance must be 6,000 + 20,000 - 11,000 = 15,000")
assert.strictEqual(ledgerResult.entries.length, 3, "There should be 3 in-period entries")

// Check running balances
assert.strictEqual(ledgerResult.entries[0].balance, 21000)
assert.strictEqual(ledgerResult.entries[1].balance, 10000)
assert.strictEqual(ledgerResult.entries[2].balance, 15000)
console.log("  ✅ Test 3 Passed: Ledger math and running balance invariants strictly verified.\n")

// TEST 4: Multi-Page Statement PDF Generation
console.log("TEST 4: Statement PDF Generator (Arabic RTL & naqqash)")
async function testPdfs() {
  const statementPdfBuffer = await generateCustomerStatementPdfBuffer(ledgerResult)
  assert.ok(Buffer.isBuffer(statementPdfBuffer), "Statement PDF must return a Buffer")
  assert.ok(statementPdfBuffer.length > 500, `Buffer size (${statementPdfBuffer.length}) must be valid PDF`)
  assert.strictEqual(statementPdfBuffer.subarray(0, 4).toString(), "%PDF", "Must start with %PDF magic bytes")
  console.log(`  ✅ Statement PDF generated successfully (${statementPdfBuffer.length} bytes)\n`)

  // TEST 5: Invoice PDF with Dynamic Document Titles
  console.log("TEST 5: Dynamic Invoice PDF with Document Titles")
  const mockSingleInvoice = {
    _id: "inv-demo",
    invoiceNumber: "NL-2026-0100",
    documentType: "tax_invoice",
    status: "confirmed",
    currency: "EGP",
    issueDate: new Date("2026-02-01"),
    dueDate: new Date("2026-02-15"),
    subtotal: 10000,
    taxRate: 14,
    taxAmount: 1400,
    discount: 0,
    additionalCharges: 0,
    totalAmount: 11400,
    paidAmount: 0,
    remainingAmount: 11400,
    items: [
      { description: "خدمات تخليص جمركي وشحن حاويات", quantity: 1, unitPrice: 10000, total: 10000 },
    ],
    customerSnapshot: {
      companyName: "شركة النيل الدولية للاستيراد والتصدير",
      contactEmail: "nile@import.eg",
      contactPhone: "+201200000000",
      commercialRegisterNumber: "CR-199482",
      taxId: "TAX-883-291",
      address: "ميناء الإسكندرية، مصر",
    },
  }

  // Generate as statement
  const pdfStatement = await generateInvoicePdfBuffer(mockSingleInvoice as any, "statement")
  assert.strictEqual(pdfStatement.subarray(0, 4).toString(), "%PDF")

  // Generate as invoice
  const pdfInvoice = await generateInvoicePdfBuffer(mockSingleInvoice as any, "invoice")
  assert.strictEqual(pdfInvoice.subarray(0, 4).toString(), "%PDF")

  // Generate as tax invoice
  const pdfTax = await generateInvoicePdfBuffer(mockSingleInvoice as any, "tax_invoice")
  assert.strictEqual(pdfTax.subarray(0, 4).toString(), "%PDF")

  console.log(`  ✅ All 3 Invoice document types rendered valid PDFs (Sizes: ${pdfStatement.length}, ${pdfInvoice.length}, ${pdfTax.length} bytes)\n`)

  // TEST 6: InvoiceActivityLog Schema with null customerId (External Client)
  console.log("TEST 6: InvoiceActivityLog Schema validation for External Clients")
  const { InvoiceActivityLog } = await import("../lib/models/InvoiceActivityLog")
  const mongoose = (await import("mongoose")).default
  const mockLog = new InvoiceActivityLog({
    invoiceId: new mongoose.Types.ObjectId(),
    customerId: null,
    actorName: "Test Staff",
    actorRole: "staff",
    action: "create",
    notes: "Draft invoice created for external client",
  })
  const validationError = mockLog.validateSync()
  assert.strictEqual(validationError, undefined, "External client activity log must validate with customerId: null")
  console.log("  ✅ InvoiceActivityLog successfully validated for External Client (customerId: null)\n")

  console.log("======================================================")
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY (100% Validated)")
  console.log("======================================================")
}

testPdfs().catch((err) => {
  console.error("❌ Test Failed:", err)
  process.exit(1)
})

import { generateInvoicePdfBuffer } from "../../../lib/services/invoice-pdf-generator"
import { generateCustomerStatementPdfBuffer } from "../../../lib/services/statement-pdf-generator"
import type { IInvoice } from "../../../lib/models/Invoice"
import { loadPdfAssetsFromBinding } from "../../../lib/services/pdf-assets"
import type { PdfAssetBinding } from "../../../lib/services/pdf-assets"

const customer = { id: "fixture", companyName: "شركة اختبار النقل", contactEmail: "fixture@example.test", address: "دمياط، مصر", commercialRegisterNumber: "TEST-1" }
const worker = {
  async fetch(request: Request, env: { ASSETS: PdfAssetBinding }) {
    try {
      const statement = new URL(request.url).pathname === "/statement"
      const assets = await loadPdfAssetsFromBinding(env.ASSETS)
      const bytes = statement
        ? await generateCustomerStatementPdfBuffer({ customer, generatedAt: "2026-10-18T12:00:00Z", generatedBy: { id: "fixture", name: "Fixture", email: "fixture@example.test" }, period: {}, summary: { openingBalance: 0, totalDebit: 100, totalCredit: 20, closingBalance: 80, currency: "EGP", totalTransactions: 2 }, entries: [{ id: "fixture", date: "2026-10-18T12:00:00Z", type: "invoice", description: "خدمات شحن تجريبية", reference: "FIXTURE-1", debit: 100, credit: 0, balance: 100, currency: "EGP" }, { id: "payment", date: "2026-10-18T13:00:00Z", type: "payment", description: "دفعة تجريبية", reference: "PAY-FIXTURE-1", debit: 0, credit: 20, balance: 80, currency: "EGP" }] }, assets)
        : await generateInvoicePdfBuffer({ invoiceNumber: "FIXTURE-1", issueDate: "2026-10-18T12:00:00Z", dueDate: "2026-11-18T12:00:00Z", status: "confirmed", documentType: "invoice", customerSnapshot: customer, items: [{ description: "خدمات شحن تجريبية", quantity: 1, unitPrice: 100, total: 100 }], groups: [{stage:"shipping",total:"100.00",items:[{description:"خدمات شحن تجريبية / Freight",amount:"100.00",tiers:[{label:"الشريحة الأولى / First unit",quantity:"1",unitPrice:"10",currency:"EGP",subtotal:"10.00"},{label:"الشرائح التالية / Next units",quantity:"3",unitPrice:"30",currency:"EGP",subtotal:"90.00"}]}]}], subtotal: 100, taxRate: 0, tax: 0, totalAmount: 100, paidAmount: 20, remainingAmount: 80, discount: 0, additionalCharges: 0, currency: "EGP" } as unknown as IInvoice, undefined, assets)
      return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf" } })
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "PDF failed" }, { status: 500 }) }
  },
}

export default worker

import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test("Task 40: Collapsible invoice items, optional tiered quantity, and 1-page A4 professional print with EN digits", () => {
  const ws = readFileSync(resolve(process.cwd(), "components/admin/shipments/ShipmentInvoiceWorkspace.tsx"), "utf8")
  assert.ok(ws.includes("expandedCostId"), "ShipmentInvoiceEditor must support collapsible cost items")
  assert.ok(ws.includes("handleOutsideClick"), "Cost items must auto-collapse on click outside")
  assert.ok(ws.includes("ProfessionalOnePageInvoice"), "CustomerInvoicePreview must use ProfessionalOnePageInvoice")

  const tiered = readFileSync(resolve(process.cwd(), "components/admin/shipments/TieredPricingEditor.tsx"), "utf8")
  assert.ok(tiered.includes("useQuantity"), "TieredPricingEditor must support optional quantity toggle")

  const onePage = readFileSync(resolve(process.cwd(), "components/shared/ProfessionalOnePageInvoice.tsx"), "utf8")
  assert.ok(onePage.includes("@page { size: A4 portrait"), "Invoice print template must enforce A4 one-page layout")
  assert.ok(onePage.includes("toEnglishDigits"), "Invoice template must force English digits")
  assert.ok(onePage.includes("رقم 46"), "Invoice template must show Form 46 field")
  assert.ok(onePage.includes("عدد الحاويات × الحجم"), "Invoice template must show container count x size")

  const customerPreview = readFileSync(resolve(process.cwd(), "components/portal/financials/InvoiceLivePreview.tsx"), "utf8")
  assert.ok(customerPreview.includes("ProfessionalOnePageInvoice"), "Customer InvoiceLivePreview must use ProfessionalOnePageInvoice")
})

test("Task 41: Customer Dealing Statement available from customer detail page with documents, status, validity & branding", () => {
  const detailPage = readFileSync(resolve(process.cwd(), "app/[locale]/admin/customers/[id]/page.tsx"), "utf8")
  assert.ok(detailPage.includes("CustomerDealingStatementModal"), "Customer detail page must render CustomerDealingStatementModal")
  assert.ok(detailPage.includes("بيان تعامل للعميل"), "Customer detail page must include Dealing Statement trigger button")

  const modal = readFileSync(resolve(process.cwd(), "components/admin/customers/CustomerDealingStatementModal.tsx"), "utf8")
  assert.ok(modal.includes("بيان تعامل عميل"), "Dealing statement must display official title")
  assert.ok(modal.includes("صلاحية المستند"), "Dealing statement must show document validity")
  assert.ok(modal.includes("موعد الانتهاء"), "Dealing statement must show expiry date")
  assert.ok(modal.includes("nilelinklogistics.com"), "Dealing statement must include official NileLink contact info")
})

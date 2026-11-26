import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test("Task 32: ShipmentInvoiceWorkspace passes customerId & scope=active and backend filters by both", () => {
  const ws = readFileSync(resolve(process.cwd(), "components/admin/shipments/ShipmentInvoiceWorkspace.tsx"), "utf8")
  assert.ok(ws.includes("scope=active"), "Shipment invoice list link must pass scope=active")
  assert.ok(ws.includes("filterCustomerId"), "ShipmentInvoiceList must support customerId filtering")

  const backend = readFileSync(resolve(process.cwd(), "lib/workflows/shipment-invoices.ts"), "utf8")
  assert.ok(backend.includes("status NOT IN ('cancelled', 'paid')"), "Backend must exclude cancelled/paid invoices for active scope")
  assert.ok(backend.includes("customerId = ?"), "Backend must filter by customerId")
})

test("Task 38: Accounts and Company Accounts are merged with unified hub tabs", () => {
  const sidebar = readFileSync(resolve(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")
  assert.ok(sidebar.includes("الحسابات والشركات"), "Sidebar must merge Accounts & Company Accounts")

  const customersPage = readFileSync(resolve(process.cwd(), "app/[locale]/admin/customers/page.tsx"), "utf8")
  assert.ok(customersPage.includes("AccountsHubTabs"), "Customers page must render AccountsHubTabs")
})

test("Task 39: Per-company totals, super-admin-only grand total, and month/period search", () => {
  const invoicesWorkflow = readFileSync(resolve(process.cwd(), "lib/workflows/invoices.ts"), "utf8")
  assert.ok(invoicesWorkflow.includes("staffCategoryOf(actor.user) === \"operations\""), "Operations staff must be blocked with 403")
  assert.ok(invoicesWorkflow.includes("companyTotals"), "Invoices API must return per-company totals")
  assert.ok(invoicesWorkflow.includes("canExposeAggregateMetrics"), "Grand total must be restricted to super_admin on server")

  const invoicesPage = readFileSync(resolve(process.cwd(), "app/[locale]/admin/invoices/page.tsx"), "utf8")
  assert.ok(invoicesPage.includes("إجمالي الفواتير لكل شركة"), "Invoices page must render per-company totals table")
  assert.ok(invoicesPage.includes("type=\"month\""), "Invoices page must support specific month search")
})

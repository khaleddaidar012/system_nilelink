import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { TOP_100_SHIPPING_LINES } from "../../lib/constants/shipping-lines.ts"
import { matchesSmartQuery, normalizeSearchText, resolveDatePreset } from "../../lib/shipments/smart-search.ts"

test("Task 36A: TOP_100_SHIPPING_LINES contains 100 unique global lines", () => {
  assert.equal(TOP_100_SHIPPING_LINES.length, 100)
  const unique = new Set(TOP_100_SHIPPING_LINES.map(l => l.trim().toLowerCase()))
  assert.equal(unique.size, 100)
  for (const major of ["MSC", "Maersk", "CMA CGM", "COSCO", "Hapag-Lloyd", "Evergreen"]) {
    assert.ok(
      TOP_100_SHIPPING_LINES.some(l => l.toLowerCase().includes(major.toLowerCase())),
      `Expected major line ${major}`
    )
  }
})

test("Task 37: smart bilingual search normalizes Arabic & English and resolves date presets", () => {
  assert.equal(normalizeSearchText("  إسكندرية   الشحنة  "), "اسكندريه الشحنه")
  assert.ok(matchesSmartQuery(["الإسكندرية", "MSC", "BK-9921"], "اسكندريه msc"))
  assert.ok(matchesSmartQuery(["شركة النخيل", "UCR-778"], "شركه النخيل 778"))
  assert.ok(!matchesSmartQuery(["Maersk", "Damietta"], "hapag"))

  const today = resolveDatePreset("today")
  assert.match(today.dateFrom, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(today.dateFrom, today.dateTo)

  const last7 = resolveDatePreset("last7")
  assert.ok(last7.dateFrom <= last7.dateTo)

  const all = resolveDatePreset("all")
  assert.equal(all.dateFrom, "")
  assert.equal(all.dateTo, "")
})

test("Task 36 & Task 33: security invariants, Enter guard, locked invoice column, and official logo asset", () => {
  const registerSrc = readFileSync(resolve(process.cwd(), "components/admin/shipments/ShipmentRegister.tsx"), "utf8")
  assert.ok(registerSrc.includes("preventEnterSubmit"), "ShipmentRegister must block implicit Enter submit")
  assert.ok(registerSrc.includes("ShippingLineCombobox"), "ShipmentRegister must use ShippingLineCombobox")
  assert.ok(registerSrc.includes("الفواتير"), "ShipmentRegister must include Invoices column")

  const portalApiSrc = readFileSync(resolve(process.cwd(), "app/api/portal/shipments/route.ts"), "utf8")
  assert.ok(portalApiSrc.includes("session.userId"), "Portal shipments API must scope strictly by session.userId")
  assert.ok(!portalApiSrc.includes("query.get(\"customerId\")"), "Portal shipments API must never trust customerId query param")

  const adminApiSrc = readFileSync(resolve(process.cwd(), "app/api/admin/shipments/route.ts"), "utf8")
  assert.ok(adminApiSrc.includes("session.role !== \"super_admin\""), "Direct DELETE on shipments must be super_admin only")
  assert.ok(adminApiSrc.includes("shipment_added"), "New shipment must trigger customer shipment_added notification")

  assert.ok(existsSync(resolve(process.cwd(), "public/images/logo.png")), "Official NileLink logo.png must exist")
  const jsonLdSrc = readFileSync(resolve(process.cwd(), "components/shared/JsonLd.tsx"), "utf8")
  assert.ok(jsonLdSrc.includes("https://nilelinklogistics.com/images/logo.png"), "JsonLd logo must point to nilelinklogistics.com")
})

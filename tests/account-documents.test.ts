import { test } from "node:test"
import assert from "node:assert/strict"
import { usableAccountDocument } from "../lib/account-documents"

test("only valid verified account documents can be reused", () => {
  assert.equal(usableAccountDocument({ status: "approved", entityType: "Customer" }), true)
  assert.equal(usableAccountDocument({ status: "expiring_soon", expiryDate: new Date(Date.now() + 86400000) }), true)
  for (const status of ["pending_review", "rejected", "expired"]) assert.equal(usableAccountDocument({ status }), false)
  assert.equal(usableAccountDocument({ status: "approved", entityType: "CustomerRequest" }), false)
  assert.equal(usableAccountDocument({ status: "approved", isArchived: true }), false)
  assert.equal(usableAccountDocument({ status: "approved", expiryDate: "2000-01-01" }), false)
  assert.equal(usableAccountDocument({ status: "approved", expiryDate: "invalid" }), false)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { Miniflare } from "miniflare"
import { NextRequest } from "next/server"
import { readD1MigrationStatements } from "../../scripts/d1/migrations.mjs"
import { GET, POST } from "../../app/api/admin/shipments/route.ts"
import { createAccessToken, ACCESS_COOKIE_NAME } from "../../lib/auth/token-service.ts"
import { shipmentFields } from "../../lib/shipments/fields.ts"
import { readFile } from "node:fs/promises"
import { readPortCatalogue, formatPort, formatCountry, locationCountry, locationMode } from "../../lib/shipments/port-catalogue.ts"

test("authorized users can save, find and revise shipments without overwriting a concurrent edit", async () => {
  process.env.DATABASE_PROVIDER = "d1"
  process.env.D1_MIGRATION_PREVIEW = "true"
  process.env.JWT_SECRET = "local-shipment-test-secret-only"
  const simulator = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("fixture") } }',
    compatibilityDate: "2025-04-01",
    d1Databases: { DB: "shipment-test" },
    d1Persist: false,
  })
  try {
    const db = await simulator.getD1Database("DB")
    globalThis[Symbol.for("__cloudflare-context__")] = { env: { DB: db }, cf: {}, ctx: {} }
    await db.batch((await readD1MigrationStatements()).map(sql => db.prepare(sql)))
    const staff = { _id: "employee", email: "employee@example.test", role: "staff", status: "active", staffPermissions: { canViewShipmentData: true } }
    await db.prepare("INSERT INTO users(id, data) VALUES(?, ?)").bind(staff._id, JSON.stringify(staff)).run()
    const token = await createAccessToken({ userId: staff._id, email: staff.email, role: staff.role })
    const origin = "http://localhost"
    const request = (query = "", body) => new NextRequest(origin + "/api/admin/shipments" + query, {
      headers: { cookie: `${ACCESS_COOKIE_NAME}=${token}`, origin, "content-type": "application/json" },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    })
    const id = crypto.randomUUID()
    const shipment = {
      ...Object.fromEntries(shipmentFields.map(field => [field.key, ""])),
      shipment_date: "2026-11-02", booking: "BOOK-001", number_46: "0046",
      container_count: 2, hs_code: "08/04/10", item_name: "تمور", shipping_line: "Sample Line", shipper: "ELmaleK",
    }
    assert.equal((await POST(request("", { id, shipment }))).status, 201)
    assert.equal((await POST(request("", { id, shipment }))).status, 201)
    const response = await GET(request("?month=2026-11&q=book"))
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.total, 1)
    assert.equal(result.containers, 2)
    assert.equal(result.records[0].number_46, "0046")
    assert.deepEqual(result.records[0].containers, [])
    assert.equal((await (await GET(request("?month=2026-10"))).json()).total, 0)
    const containers = [
      { number: "TCLU1234567", driver_number: "01000123456", truck_number: "1234" },
      { number: "MSCU7654321", driver_number: "01000654321", truck_number: "5678" },
    ]
    const updated = { ...shipment, ucr: "000123", container_count: 4, containers }
    assert.equal((await POST(request("", { id, revision: 1, shipment: updated }))).status, 200)
    for (const q of ["000123", "mscu7654321", "01000654321", "5678"]) {
      const found = await (await GET(request("?q=" + q))).json()
      assert.equal(found.containers, 2)
      assert.deepEqual(found.records[0].containers, containers)
    }
    const suggestions = await (await GET(request("?options=1"))).json()
    assert.deepEqual(suggestions.options.shipping_line, ["Sample Line"])
    assert.ok(suggestions.options.shipper.includes("MAF GATEWAY"))
    assert.ok(!suggestions.options.shipper.some(name => name.toLowerCase() === "elmalek"))
    assert.equal((await POST(request("", { id, revision: 2, shipment: { ...updated, containers: [containers[0], containers[0]] } }))).status, 400)
    assert.equal((await POST(request("", { id, revision: 1, shipment }))).status, 409)
    const index=readPortCatalogue(JSON.parse(await readFile(new URL('../../public/data/unlocode-2025-1/index.json',import.meta.url),'utf8')))
    const countries=await Promise.all(['EG','MA','CH'].map(async code=>JSON.parse(await readFile(new URL('../../public/data/unlocode-2025-1/countries/'+code+'.json',import.meta.url),'utf8'))))
    const catalogue=readPortCatalogue({...index,ports:countries.flatMap(data=>data.ports)})
    const geographyId=crypto.randomUUID(), geography={...shipment,booking:'BOOK-GEOGRAPHY',port_of_loading:formatPort(catalogue.ports.find(port=>port.code==='EGDAM')),port_of_discharge:formatPort(catalogue.ports.find(port=>port.code==='MACAS'))}
    assert.equal((await POST(request('',{id:geographyId,shipment:geography}))).status,201)
    const saved=(await (await GET(request('?q=BOOK-GEOGRAPHY'))).json()).records[0]
    assert.equal(saved.port_of_loading,geography.port_of_loading);assert.equal(saved.port_of_discharge,geography.port_of_discharge)
    assert.equal(locationCountry(saved.port_of_loading,catalogue),'EG');assert.equal(locationCountry(saved.port_of_discharge,catalogue),'MA')
    const countryOnly={...geography,port_of_loading:formatPort(catalogue.ports.find(port=>port.code==='EGCAI'),'air'),port_of_discharge:formatCountry(catalogue.countries.find(country=>country.code==='CH'),'road')}
    assert.equal((await POST(request('',{id:geographyId,revision:1,shipment:countryOnly}))).status,200)
    const reloaded=(await (await GET(request('?q=BOOK-GEOGRAPHY'))).json()).records[0]
    assert.equal(locationCountry(reloaded.port_of_discharge,catalogue),'CH');assert.equal(locationMode(reloaded.port_of_loading,catalogue),'air');assert.equal(locationMode(reloaded.port_of_discharge,catalogue),'road')
    staff.staffPermissions.canViewShipmentData = false
    await db.prepare("UPDATE users SET data=? WHERE id=?").bind(JSON.stringify(staff), staff._id).run()
    assert.equal((await GET(request())).status, 403)
    assert.equal((await POST(request("", { id, shipment }))).status, 403)
  } finally {
    await simulator.dispose()
  }
})

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { getAccountsAccess, getShipmentAccess } from "@/lib/auth/shipment-access-server"
import { getD1, requireD1Success } from "@/lib/db/d1"
import { shipmentFields, shipmentSuggestionFields, type ShipmentRecord } from "@/lib/shipments/fields"

const text = z.string().trim().max(200)
const shipmentSchema = z.object({
  shipment_date: z.iso.date(),
  booking: text.min(1),
  number_46: text,
  ucr: text.optional(),
  shipping_line: text,
  container_count: z.number().int().min(1).max(10000),
  container_size: text,
  export_invoice: text,
  broker: text,
  shipper: text,
  port_of_loading: text,
  port_of_discharge: text,
  item_name: text,
  hs_code: text,
  containers: z.array(z.object({
    number: text.min(1),
    driver_number: text,
    truck_number: text,
  })).max(100).refine(rows =>
    new Set(rows.map(row => row.number.toUpperCase())).size === rows.length,
    "Container numbers must be unique within a shipment"
  ).optional(),
})
const saveSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive().optional(),
  shipment: shipmentSchema,
})
const columns = shipmentFields.map(field => field.key)
const selectedColumns = ["id", "revision", ...columns, "containers_json"].join(", ")
type ShipmentRow = Omit<ShipmentRecord, "containers"> & { containers_json: string }
const pageSize = 25
const initialShippers = [
  "MAF GATEWAY", "AL TAHAN", "Nakhil El Ouadi", "EGYPTIAN TURKISH",
  "ORGANIC FOODS", "NILOS FRESH", "SALFO EGYPT",
]

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (request.nextUrl.searchParams.get("forAccounting") === "1") {
    if (!session || !(await getAccountsAccess(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const id = request.nextUrl.searchParams.get("id")
    if (id && !z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid shipment ID" }, { status: 400 })
    const search = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 200)
    const customerId = request.nextUrl.searchParams.get("customerId")
    const requestId = request.nextUrl.searchParams.get("requestId")
    if ([customerId, requestId].some(value => value && !/^[a-f\d]{24}$/i.test(value))) return NextResponse.json({ error: "Invalid customer or request ID" }, { status: 400 })
    const db = await getD1()
    const rows = await db.prepare(`SELECT s.id,s.booking,s.shipper,i.customerId,r.id AS requestId,r.trackingNumber AS requestNumber,
        json_extract(c.data,'$.customerCode') AS customerCode,c.companyName AS customerName
      FROM shipment_records s
      LEFT JOIN invoices i ON json_extract(i.data,'$.shipmentRecordId')=s.id
      LEFT JOIN customers c ON c.id=i.customerId
      LEFT JOIN customer_requests r ON r.id=i.relatedRequestId AND r.customerId=i.customerId
      WHERE (? IS NULL OR s.id=?) AND (? IS NULL OR i.customerId IS NULL OR i.customerId=?)
        AND (? IS NULL OR i.relatedRequestId IS NULL OR i.relatedRequestId=?)
        AND (?='' OR instr(lower(s.booking || ' ' || s.shipper || ' ' || coalesce(r.trackingNumber,'') || ' ' || coalesce(json_extract(r.data,'$.previousTrackingNumbers'),'') || ' ' || coalesce(json_extract(r.data,'$.legacyTrackingNumber'),'') || ' ' || coalesce(json_extract(c.data,'$.legacyCustomerCode'),'') || ' ' || coalesce(json_extract(c.data,'$.customerCode'),'') || ' ' || coalesce(c.companyName,'')),lower(?))>0)
      ORDER BY s.shipment_date DESC,s.id DESC LIMIT 25`).bind(id,id,customerId,customerId,requestId,requestId,search,search).all()
    return NextResponse.json({ records: requireD1Success(rows).results }, { headers: { "Cache-Control": "private, no-store" } })
  }
  if (!session || !(await getShipmentAccess(session.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const query = request.nextUrl.searchParams
  const db = await getD1()
  if (query.get("options") === "1") {
    const results = await db.batch<{ value: string }>(shipmentSuggestionFields.map(column =>
      column === "shipper" ? db.prepare(
        `SELECT min(value) AS value FROM (
          SELECT trim(companyName) AS value FROM customers
          UNION ALL SELECT shipper FROM shipment_records
          UNION ALL SELECT column1 FROM (VALUES ${initialShippers.map(() => "(?)").join(", ")})
        ) WHERE value <> '' AND lower(value) <> 'elmalek'
        GROUP BY lower(value) ORDER BY value COLLATE NOCASE`
      ).bind(...initialShippers) : db.prepare(`SELECT min(${column}) AS value FROM shipment_records
        WHERE ${column} <> '' GROUP BY lower(${column})
        ORDER BY count(*) DESC, value COLLATE NOCASE LIMIT 200`)
    ))
    const options = Object.fromEntries(shipmentSuggestionFields.map((field, index) => [
      field, requireD1Success(results[index]).results.map(row => row.value),
    ]))
    return NextResponse.json({ options }, { headers: { "Cache-Control": "private, no-store" } })
  }
  const search = (query.get("q") ?? "").trim().slice(0, 200)
  const month = query.get("month") ?? ""
  const page = Number(query.get("page") ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 })
  }

  const filters: string[] = []
  const values: string[] = []
  const selectedId = query.get("id")
  if (selectedId) {
    if (!z.uuid().safeParse(selectedId).success) return NextResponse.json({ error: "Invalid shipment ID" }, { status: 400 })
    filters.push("id = ?")
    values.push(selectedId)
  }
  if (month) {
    filters.push("shipment_date >= ? AND shipment_date < ?")
    values.push(month + "-01", month + "-32")
  }
  if (search) {
    const searchable = columns.filter(column => column !== "container_count")
    filters.push("(" + searchable.map(column => `instr(lower(${column}), lower(?)) > 0`).join(" OR ") +
      " OR EXISTS (SELECT 1 FROM json_each(containers_json) WHERE instr(lower(value ->> '$.number'), lower(?)) > 0 OR instr(lower(value ->> '$.driver_number'), lower(?)) > 0 OR instr(lower(value ->> '$.truck_number'), lower(?)) > 0))")
    values.push(...searchable.map(() => search), search, search, search)
  }
  const where = filters.length ? " WHERE " + filters.join(" AND ") : ""
  const [pageResult, totalsResult] = await db.batch([
    db.prepare(`SELECT ${selectedColumns} FROM shipment_records${where}
      ORDER BY shipment_date DESC, id DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT count(*) AS total, coalesce(sum(container_count), 0) AS containers
      FROM shipment_records${where}`).bind(...values),
  ])

  return NextResponse.json({
    records: (requireD1Success(pageResult).results as unknown as ShipmentRow[]).map(({ containers_json, ...row }) => ({
      ...row,
      containers: JSON.parse(containers_json),
    })),
    ...requireD1Success(totalsResult).results[0],
    pageSize,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const session = await getSessionFromRequest(request)
  if (!session || !(await getShipmentAccess(session.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shipment data" }, { status: 400 })
  }

  const { id, revision, shipment } = parsed.data
  const details = shipment.containers
  const normalized = {
    ...shipment,
    container_count: details?.length || shipment.container_count,
  }
  const values = columns.map(column => normalized[column] ?? "")
  const db = await getD1()
  if (revision !== undefined) {
    const result = requireD1Success(await db.prepare(
      `UPDATE shipment_records SET ${columns.filter(column => column !== "ucr").map(column => `${column} = ?`).join(", ")},
       ucr = coalesce(?, ucr), containers_json = coalesce(?, containers_json),
       updated_by = ?, revision = revision + 1 WHERE id = ? AND revision = ?
       AND (? IS NOT NULL OR json_array_length(containers_json) = 0 OR container_count = ?)`
    ).bind(...columns.filter(column => column !== "ucr").map(column => normalized[column] ?? ""),
      shipment.ucr ?? null, details ? JSON.stringify(details) : null, session.userId, id, revision,
      details ? 1 : null, normalized.container_count).run())
    if (!result.meta.changes) {
      return NextResponse.json({ error: "Shipment has changed" }, { status: 409 })
    }
    return NextResponse.json({ id, revision: revision + 1 })
  }

  const inserted = requireD1Success(await db.prepare(
    `INSERT INTO shipment_records (id, ${columns.join(", ")}, updated_by, containers_json)
     VALUES (${Array(columns.length + 3).fill("?").join(", ")})
     ON CONFLICT(id) DO NOTHING`
  ).bind(id, ...values, session.userId, JSON.stringify(details ?? [])).run())
  if (!inserted.meta.changes) {
    const previous = await db.prepare(
      `SELECT ${selectedColumns}, updated_by FROM shipment_records WHERE id = ?`
    ).bind(id).first<ShipmentRow & { updated_by: string }>()
    if (!previous || previous.updated_by !== session.userId ||
        previous.revision !== 1 || columns.some(column => previous[column] !== (normalized[column] ?? "")) ||
        previous.containers_json !== JSON.stringify(details ?? [])) {
      return NextResponse.json({ error: "Shipment has changed" }, { status: 409 })
    }
  }
  return NextResponse.json({ id, revision: 1 }, { status: 201 })
}

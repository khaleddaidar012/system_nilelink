import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { getD1, requireD1Success } from "@/lib/db/d1"
import { matchesSmartQuery } from "@/lib/shipments/smart-search"

type RawShipment = {
  id: string
  shipment_date: string
  booking: string
  number_46: string
  ucr: string
  shipping_line: string
  container_count: number
  container_size: string
  shipper: string
  port_of_loading: string
  port_of_discharge: string
  item_name: string
  containers_json: string
  published_invoice_id: string | null
  published_invoice_number: string | null
  published_invoice_token: string | null
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = await getD1()
  // Strict server-side tenant isolation: resolve customer ONLY from authenticated session.userId
  const customerRow = await db
    .prepare(`SELECT id, companyName FROM customers WHERE userId = ? LIMIT 1`)
    .bind(session.userId)
    .first<{ id: string; companyName: string }>()

  if (!customerRow) {
    return NextResponse.json({
      shipments: [],
      total: 0,
      containers: 0,
      page: 1,
      pageSize: 20,
    })
  }

  const query = request.nextUrl.searchParams
  const q = (query.get("q") || "").trim().slice(0, 200)
  const month = (query.get("month") || "").trim()
  const dateFrom = (query.get("dateFrom") || "").trim()
  const dateTo = (query.get("dateTo") || "").trim()
  const page = Number(query.get("page") || 1)
  const pageSize = 20

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000 ||
    (month && !monthPattern.test(month)) ||
    (dateFrom && !isoDatePattern.test(dateFrom)) ||
    (dateTo && !isoDatePattern.test(dateTo)) ||
    (dateFrom && dateTo && dateFrom > dateTo)
  ) {
    return NextResponse.json({ error: "Invalid filter parameters" }, { status: 400 })
  }

  const filters: string[] = [
    `(LOWER(TRIM(s.shipper)) = LOWER(TRIM(?)) OR EXISTS (
        SELECT 1 FROM invoices inv
        WHERE json_extract(inv.data, '$.shipmentRecordId') = s.id
          AND inv.customerId = ?
          AND inv.status != 'cancelled'
          AND json_extract(inv.data, '$.archivedAt') IS NULL
      ))`,
  ]
  const values: string[] = [customerRow.companyName || "", customerRow.id]

  if (month) {
    filters.push("s.shipment_date >= ? AND s.shipment_date <= ?")
    values.push(`${month}-01`, `${month}-31`)
  }
  if (dateFrom) {
    filters.push("s.shipment_date >= ?")
    values.push(dateFrom)
  }
  if (dateTo) {
    filters.push("s.shipment_date <= ?")
    values.push(dateTo)
  }

  const rows = requireD1Success(
    await db
      .prepare(
        `SELECT s.id, s.shipment_date, s.booking, s.number_46, s.ucr, s.shipping_line,
                s.container_count, s.container_size, s.shipper, s.port_of_loading,
                s.port_of_discharge, s.item_name, s.containers_json,
                (SELECT inv.id FROM invoices inv
                 WHERE json_extract(inv.data, '$.shipmentRecordId') = s.id
                   AND inv.customerId = ?
                   AND inv.status NOT IN ('draft', 'cancelled')
                   AND json_extract(inv.data, '$.archivedAt') IS NULL
                 ORDER BY inv.createdAt DESC LIMIT 1) AS published_invoice_id,
                (SELECT inv.invoiceNumber FROM invoices inv
                 WHERE json_extract(inv.data, '$.shipmentRecordId') = s.id
                   AND inv.customerId = ?
                   AND inv.status NOT IN ('draft', 'cancelled')
                   AND json_extract(inv.data, '$.archivedAt') IS NULL
                 ORDER BY inv.createdAt DESC LIMIT 1) AS published_invoice_number,
                (SELECT inv.token FROM invoices inv
                 WHERE json_extract(inv.data, '$.shipmentRecordId') = s.id
                   AND inv.customerId = ?
                   AND inv.status NOT IN ('draft', 'cancelled')
                   AND json_extract(inv.data, '$.archivedAt') IS NULL
                 ORDER BY inv.createdAt DESC LIMIT 1) AS published_invoice_token
         FROM shipment_records s
         WHERE ${filters.join(" AND ")}
         ORDER BY s.shipment_date DESC, s.id DESC
         LIMIT 500`
      )
      .bind(customerRow.id, customerRow.id, customerRow.id, ...values)
      .all()
  ).results as unknown as RawShipment[]

  // Customer-safe projection + smart bilingual filtering (never leaks broker, export_invoice, costs, margins, or draft invoices)
  const mapped = rows
    .map(row => {
      let containerNumbers: string[] = []
      try {
        const parsed = JSON.parse(row.containers_json || "[]") as { number?: string }[]
        containerNumbers = parsed.map(c => c.number || "").filter(Boolean)
      } catch {
        containerNumbers = []
      }
      return {
        id: row.id,
        shipmentDate: row.shipment_date,
        booking: row.booking,
        number46: row.number_46,
        ucr: row.ucr,
        shippingLine: row.shipping_line,
        containerCount: row.container_count,
        containerSize: row.container_size,
        portOfLoading: row.port_of_loading,
        portOfDischarge: row.port_of_discharge,
        itemName: row.item_name,
        containerNumbers,
        publishedInvoice: row.published_invoice_id
          ? {
              id: row.published_invoice_id,
              invoiceNumber: row.published_invoice_number || "",
              token: row.published_invoice_token || "",
            }
          : null,
      }
    })
    .filter(item =>
      matchesSmartQuery(
        [
          item.booking,
          item.number46,
          item.ucr,
          item.shippingLine,
          item.portOfLoading,
          item.portOfDischarge,
          item.itemName,
          ...item.containerNumbers,
        ],
        q
      )
    )

  const total = mapped.length
  const containers = mapped.reduce((sum, item) => sum + (Number(item.containerCount) || 0), 0)
  const start = (page - 1) * pageSize
  const paged = mapped.slice(start, start + pageSize)

  return NextResponse.json(
    {
      shipments: paged,
      total,
      containers,
      page,
      pageSize,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

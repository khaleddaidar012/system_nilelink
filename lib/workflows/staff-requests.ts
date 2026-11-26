import { randomUUID } from "node:crypto"
import { getD1, requireD1Success } from "@/lib/db/d1"

type D1Database = Awaited<ReturnType<typeof getD1>>

export type StaffRequestType = "to_accounts" | "delete_shipment"
export type StaffRequestStatus = "pending_admin" | "approved" | "rejected"

export interface ShipmentStaffRequestRow {
  id: string
  shipment_id: string
  request_type: StaffRequestType
  status: StaffRequestStatus
  requested_by: string
  requested_by_name: string
  source_dept: string
  target_dept: string
  note: string
  decided_by: string | null
  decided_by_name: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
  // Optional snapshot fields kept even if shipment is deleted
  shipment_booking: string
  shipment_shipper: string
  shipment_date: string
}

let tableEnsured = false

export async function ensureStaffRequestsTable(db: D1Database): Promise<void> {
  if (tableEnsured) return
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS shipment_staff_requests (
      id TEXT PRIMARY KEY NOT NULL,
      shipment_id TEXT NOT NULL,
      request_type TEXT NOT NULL CHECK (request_type IN ('to_accounts', 'delete_shipment')),
      status TEXT NOT NULL CHECK (status IN ('pending_admin', 'approved', 'rejected')),
      requested_by TEXT NOT NULL,
      requested_by_name TEXT NOT NULL,
      source_dept TEXT NOT NULL,
      target_dept TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      decided_by TEXT,
      decided_by_name TEXT,
      decision_note TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      shipment_booking TEXT NOT NULL DEFAULT '',
      shipment_shipper TEXT NOT NULL DEFAULT '',
      shipment_date TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ssr_shipment ON shipment_staff_requests(shipment_id, request_type, status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ssr_status ON shipment_staff_requests(status, created_at DESC)`),
  ])
  tableEnsured = true
}

export async function insertNotificationRow(
  db: D1Database,
  payload: {
    title: string
    message: string
    type: string
    targetAudience: "super_admin" | "all_staff" | "staff" | "customer"
    recipientUserId?: string
    recipientCustomerId?: string
    requiredPermission?: string
    relatedRequestId?: string
    actionUrl?: string
    severity?: "normal" | "warning" | "critical"
  }
) {
  const id = randomUUID().replace(/-/g, "").slice(0, 24)
  const timestamp = new Date().toISOString()
  const doc = {
    _id: id,
    ...payload,
    severity: payload.severity || "normal",
    isRead: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  requireD1Success(
    await db
      .prepare(`INSERT INTO notifications (id, data, revision) VALUES (?, ?, 0)`)
      .bind(id, JSON.stringify(doc))
      .run()
  )
  return id
}

export async function hasApprovedTransferToAccounts(db: D1Database, shipmentId: string): Promise<boolean> {
  await ensureStaffRequestsTable(db)
  const row = await db
    .prepare(
      `SELECT id FROM shipment_staff_requests WHERE shipment_id = ? AND request_type = 'to_accounts' AND status = 'approved' LIMIT 1`
    )
    .bind(shipmentId)
    .first<{ id: string }>()
  return Boolean(row)
}

export async function getShipmentStatusSummaryMap(
  db: D1Database,
  shipmentIds: string[]
): Promise<
  Record<
    string,
    {
      transferState: StaffRequestStatus | null
      deleteState: StaffRequestStatus | null
      invoiceId: string | null
      invoiceStatus: string | null
      invoiceApprovalPending: boolean
    }
  >
> {
  const out: Record<
    string,
    {
      transferState: StaffRequestStatus | null
      deleteState: StaffRequestStatus | null
      invoiceId: string | null
      invoiceStatus: string | null
      invoiceApprovalPending: boolean
    }
  > = {}
  if (!shipmentIds.length) return out
  await ensureStaffRequestsTable(db)

  for (const id of shipmentIds) {
    out[id] = {
      transferState: null,
      deleteState: null,
      invoiceId: null,
      invoiceStatus: null,
      invoiceApprovalPending: false,
    }
  }

  const placeholders = shipmentIds.map(() => "?").join(", ")
  const [reqRows, invRows] = await db.batch([
    db
      .prepare(
        `SELECT shipment_id, request_type, status FROM shipment_staff_requests
         WHERE shipment_id IN (${placeholders})
         ORDER BY created_at DESC`
      )
      .bind(...shipmentIds),
    db
      .prepare(
        `SELECT id, status, json_extract(data, '$.shipmentRecordId') AS shipmentId,
                json_extract(data, '$.shipmentAccounting.approvalRequest') AS approvalReq
         FROM invoices
         WHERE json_extract(data, '$.shipmentRecordId') IN (${placeholders})
           AND status != 'cancelled'
           AND json_extract(data, '$.archivedAt') IS NULL
         ORDER BY createdAt DESC`
      )
      .bind(...shipmentIds),
  ])

  for (const row of requireD1Success(reqRows).results as unknown as {
    shipment_id: string
    request_type: StaffRequestType
    status: StaffRequestStatus
  }[]) {
    const entry = out[row.shipment_id]
    if (!entry) continue
    if (row.request_type === "to_accounts" && entry.transferState === null) {
      entry.transferState = row.status
    }
    if (row.request_type === "delete_shipment" && entry.deleteState === null) {
      entry.deleteState = row.status
    }
  }

  for (const row of requireD1Success(invRows).results as unknown as {
    id: string
    status: string
    shipmentId: string
    approvalReq: string | null
  }[]) {
    const entry = out[row.shipmentId]
    if (!entry || entry.invoiceId) continue
    entry.invoiceId = row.id
    entry.invoiceStatus = row.status
    entry.invoiceApprovalPending = Boolean(row.approvalReq) && row.status === "draft"
  }

  return out
}

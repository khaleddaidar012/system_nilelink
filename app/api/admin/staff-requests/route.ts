import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { getD1, requireD1Success } from "@/lib/db/d1"
import { canAccessAccounts } from "@/lib/auth/accounts-access"
import { staffCategoryOf, userCanMarkReadyForAccounts } from "@/lib/auth/staff-categories"
import { getShipmentAccess } from "@/lib/auth/shipment-access-server"
import {
  ensureStaffRequestsTable,
  insertNotificationRow,
  type ShipmentStaffRequestRow,
  type StaffRequestStatus,
} from "@/lib/workflows/staff-requests"

const createSchema = z.object({
  action: z.literal("create"),
  shipmentId: z.uuid(),
  requestType: z.enum(["to_accounts", "delete_shipment"]),
  note: z.string().trim().max(500).optional(),
})

const decideSchema = z.object({
  action: z.literal("decide"),
  id: z.string().min(1).max(100),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
})

async function loadActor(userId: string) {
  const db = await getD1()
  const row = await db.prepare(`SELECT id, data FROM users WHERE id = ?`).bind(userId).first<{ id: string; data: string }>()
  if (!row) return null
  const user = JSON.parse(row.data)
  if (!["staff", "super_admin"].includes(user.role) || user.status !== "active") return null
  return { db, user }
}

function actorName(user: { firstName?: string; lastName?: string; username?: string; email?: string }) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || user.email || "Staff"
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await loadActor(session.userId)
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user } = ctx
  await ensureStaffRequestsTable(db)

  const isAdmin = user.role === "super_admin"
  const isAccounts = !isAdmin && (staffCategoryOf(user) === "accounts" || canAccessAccounts(user))
  const url = request.nextUrl
  const typeFilter = url.searchParams.get("type") || "all"
  const statusFilter = url.searchParams.get("status") || "all"

  const scopeSql = isAdmin
    ? "1 = 1"
    : isAccounts
      ? "request_type = 'to_accounts' AND status = 'approved'"
      : "requested_by = ?"
  const scopeBinds = isAdmin || isAccounts ? [] : [user._id || session.userId]

  const staffReqRows = requireD1Success(
    await db
      .prepare(
        `SELECT r.*, s.booking AS live_booking, s.shipper AS live_shipper, s.shipment_date AS live_date,
                s.shipping_line AS live_shipping_line, s.ucr AS live_ucr
         FROM shipment_staff_requests r
         LEFT JOIN shipment_records s ON s.id = r.shipment_id
         WHERE ${scopeSql}
         ORDER BY r.created_at DESC
         LIMIT 200`
      )
      .bind(...scopeBinds)
      .all()
  ).results as unknown as (ShipmentStaffRequestRow & {
    live_booking?: string | null
    live_shipper?: string | null
    live_date?: string | null
    live_shipping_line?: string | null
    live_ucr?: string | null
  })[]

  // Also include invoice-to-customer transfer requests (approvalRequest on draft invoices) for Admin & Accounts
  let customerTransferItems: Array<{
    id: string
    shipmentId: string
    invoiceId: string
    requestType: "to_customer"
    status: StaffRequestStatus
    requestedBy: string
    requestedByName: string
    sourceDept: string
    targetDept: string
    note: string
    createdAt: string
    shipmentBooking: string
    shipmentShipper: string
    shipmentDate: string
    invoiceNumber: string
    decidedByName?: string | null
    decisionNote?: string | null
  }> = []

  if (isAdmin || isAccounts) {
    const invRows = requireD1Success(
      await db
        .prepare(
          `SELECT id, status, data FROM invoices
           WHERE json_extract(data, '$.shipmentAccounting.approvalRequest') IS NOT NULL
             AND status = 'draft'
             AND json_extract(data, '$.archivedAt') IS NULL
           ORDER BY json_extract(data, '$.shipmentAccounting.approvalRequest.requestedAt') DESC
           LIMIT 100`
        )
        .all()
    ).results as unknown as { id: string; status: string; data: string }[]

    customerTransferItems = invRows.map(row => {
      const data = JSON.parse(row.data)
      const req = data.shipmentAccounting?.approvalRequest || {}
      return {
        id: `inv:${row.id}`,
        shipmentId: data.shipmentRecordId || "",
        invoiceId: row.id,
        requestType: "to_customer" as const,
        status: "pending_admin" as const,
        requestedBy: req.by || req.requestedBy || "",
        requestedByName: req.byName || req.requestedByName || "Accounts",
        sourceDept: "accounts",
        targetDept: "customer",
        note: req.note || "",
        createdAt: req.at || req.requestedAt || data.updatedAt || data.createdAt || "",
        shipmentBooking: data.shipmentSnapshot?.trackingNumber || data.invoiceNumber || "",
        shipmentShipper: data.customerSnapshot?.companyName || "",
        shipmentDate: String(data.issueDate || "").slice(0, 10),
        invoiceNumber: data.invoiceNumber || "",
      }
    })
  }

  const normalizedShipmentRequests = staffReqRows.map(r => ({
    id: r.id,
    shipmentId: r.shipment_id,
    invoiceId: null as string | null,
    requestType: r.request_type,
    status: r.status,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    sourceDept: r.source_dept,
    targetDept: r.target_dept,
    note: r.note || "",
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedByName: r.decided_by_name,
    decisionNote: r.decision_note,
    shipmentBooking: r.live_booking || r.shipment_booking || "",
    shipmentShipper: r.live_shipper || r.shipment_shipper || "",
    shipmentDate: r.live_date || r.shipment_date || "",
    shippingLine: r.live_shipping_line || "",
    ucr: r.live_ucr || "",
    shipmentExists: Boolean(r.live_booking),
  }))

  const allItems = [...normalizedShipmentRequests, ...customerTransferItems].sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  )

  const counts = {
    all: allItems.length,
    pending_admin: allItems.filter(i => i.status === "pending_admin").length,
    approved: allItems.filter(i => i.status === "approved").length,
    rejected: allItems.filter(i => i.status === "rejected").length,
    to_accounts: allItems.filter(i => i.requestType === "to_accounts").length,
    to_customer: allItems.filter(i => i.requestType === "to_customer").length,
    delete_shipment: allItems.filter(i => i.requestType === "delete_shipment").length,
  }

  const filtered = allItems.filter(item => {
    if (typeFilter !== "all" && item.requestType !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    return true
  })

  return NextResponse.json(
    {
      viewer: {
        isAdmin,
        isAccounts,
        canDecide: isAdmin,
        canCreateInvoice: isAdmin || canAccessAccounts(user),
      },
      counts,
      items: filtered,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 })
  }
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await loadActor(session.userId)
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user } = ctx
  await ensureStaffRequestsTable(db)

  const rawBody = await request.json().catch(() => null)
  const isAdmin = user.role === "super_admin"
  const name = actorName(user)
  const userId = user._id || session.userId

  if (rawBody?.action === "create") {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) return NextResponse.json({ error: "Invalid staff request" }, { status: 400 })
    const { shipmentId, requestType, note = "" } = parsed.data

    const hasShipmentPerm = await getShipmentAccess(session.userId)
    if (!isAdmin && !hasShipmentPerm && !userCanMarkReadyForAccounts(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const shipment = await db
      .prepare(`SELECT id, booking, shipper, shipment_date FROM shipment_records WHERE id = ?`)
      .bind(shipmentId)
      .first<{ id: string; booking: string; shipper: string; shipment_date: string }>()
    if (!shipment) return NextResponse.json({ error: "Shipment not found" }, { status: 404 })

    const existing = await db
      .prepare(
        `SELECT id, status FROM shipment_staff_requests
         WHERE shipment_id = ? AND request_type = ? AND status IN ('pending_admin', 'approved')
         LIMIT 1`
      )
      .bind(shipmentId, requestType)
      .first<{ id: string; status: string }>()
    if (existing) {
      return NextResponse.json({
        success: true,
        changed: false,
        id: existing.id,
        status: existing.status,
      })
    }

    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const sourceDept = isAdmin ? "admin" : staffCategoryOf(user) || "operations"
    const targetDept = requestType === "to_accounts" ? "accounts" : "admin"

    requireD1Success(
      await db
        .prepare(
          `INSERT INTO shipment_staff_requests
           (id, shipment_id, request_type, status, requested_by, requested_by_name, source_dept, target_dept, note, created_at, shipment_booking, shipment_shipper, shipment_date)
           VALUES (?, ?, ?, 'pending_admin', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          shipmentId,
          requestType,
          userId,
          name,
          sourceDept,
          targetDept,
          note,
          createdAt,
          shipment.booking,
          shipment.shipper,
          shipment.shipment_date
        )
        .run()
    )

    const notifTitle =
      requestType === "to_accounts"
        ? "طلب تحويل شحنة إلى الحسابات / Transfer to Accounts requested"
        : "طلب حذف شحنة من التشغيل / Shipment deletion requested"
    const notifMessage = `${shipment.booking}${shipment.shipper ? ` — ${shipment.shipper}` : ""} (${name})${note ? ` — ${note}` : ""}`

    await insertNotificationRow(db, {
      targetAudience: "super_admin",
      type: requestType === "to_accounts" ? "staff_request_transfer_accounts" : "staff_request_delete_shipment",
      severity: requestType === "delete_shipment" ? "warning" : "normal",
      title: notifTitle,
      message: notifMessage,
      actionUrl: "/admin/accounts-ready",
    })

    return NextResponse.json({ success: true, changed: true, id, status: "pending_admin" }, { status: 201 })
  }

  if (rawBody?.action === "decide") {
    if (!isAdmin) return NextResponse.json({ error: "Only an administrator may approve or reject staff requests" }, { status: 403 })
    const parsed = decideSchema.safeParse(rawBody)
    if (!parsed.success) return NextResponse.json({ error: "Invalid decision payload" }, { status: 400 })
    const { id, decision, note = "" } = parsed.data

    const row = await db
      .prepare(`SELECT * FROM shipment_staff_requests WHERE id = ?`)
      .bind(id)
      .first<ShipmentStaffRequestRow>()
    if (!row) return NextResponse.json({ error: "Staff request not found" }, { status: 404 })
    if (row.status !== "pending_admin") {
      return NextResponse.json({ error: "This request has already been decided" }, { status: 409 })
    }

    const decidedAt = new Date().toISOString()
    const nextStatus: StaffRequestStatus = decision === "approve" ? "approved" : "rejected"

    if (row.request_type === "delete_shipment" && decision === "approve") {
      // Safety: do not delete a shipment that already has a published invoice
      const publishedInv = await db
        .prepare(
          `SELECT id FROM invoices
           WHERE json_extract(data, '$.shipmentRecordId') = ?
             AND status NOT IN ('draft', 'cancelled')
             AND json_extract(data, '$.archivedAt') IS NULL
           LIMIT 1`
        )
        .bind(row.shipment_id)
        .first<{ id: string }>()
      if (publishedInv) {
        return NextResponse.json(
          { error: "Cannot delete a shipment that has a published invoice" },
          { status: 409 }
        )
      }
      requireD1Success(await db.prepare(`DELETE FROM shipment_records WHERE id = ?`).bind(row.shipment_id).run())
    }

    requireD1Success(
      await db
        .prepare(
          `UPDATE shipment_staff_requests
           SET status = ?, decided_by = ?, decided_by_name = ?, decision_note = ?, decided_at = ?
           WHERE id = ? AND status = 'pending_admin'`
        )
        .bind(nextStatus, userId, name, note || null, decidedAt, id)
        .run()
    )

    const refLabel = `${row.shipment_booking || row.shipment_id}${row.shipment_shipper ? ` — ${row.shipment_shipper}` : ""}`
    if (row.request_type === "to_accounts") {
      if (decision === "approve") {
        await insertNotificationRow(db, {
          targetAudience: "all_staff",
          requiredPermission: "accounts",
          type: "staff_request_transfer_accounts_approved",
          title: "طلب تحويل جديد للحسابات / New approved transfer for Accounts",
          message: `${refLabel} — ${name}`,
          actionUrl: "/admin/accounts-ready",
        })
        await insertNotificationRow(db, {
          targetAudience: "staff",
          recipientUserId: row.requested_by,
          type: "staff_request_transfer_accounts_approved",
          title: "تمت الموافقة على تحويل الشحنة للحسابات / Transfer to Accounts approved",
          message: `${refLabel} — ${name}`,
          actionUrl: "/admin/coming-soon/shipments",
        })
      } else {
        await insertNotificationRow(db, {
          targetAudience: "staff",
          recipientUserId: row.requested_by,
          type: "staff_request_transfer_accounts_rejected",
          title: "تم رفض طلب تحويل الشحنة للحسابات / Transfer to Accounts declined",
          message: `${refLabel}${note ? ` — ${note}` : ""}`,
          actionUrl: "/admin/accounts-ready",
        })
      }
    } else {
      await insertNotificationRow(db, {
        targetAudience: "staff",
        recipientUserId: row.requested_by,
        type: "staff_request_delete_shipment_decided",
        severity: decision === "approve" ? "normal" : "warning",
        title:
          decision === "approve"
            ? "تمت الموافقة على حذف الشحنة / Shipment deletion approved"
            : "تم رفض طلب حذف الشحنة / Shipment deletion declined",
        message: `${refLabel}${note ? ` — ${note}` : ""}`,
        actionUrl: "/admin/accounts-ready",
      })
    }

    return NextResponse.json({ success: true, status: nextStatus })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

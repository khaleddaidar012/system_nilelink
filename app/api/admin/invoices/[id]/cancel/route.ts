import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice, InvoiceActivityLog } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-cancel", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = body.reason || "Cancelled by Nile Link staff"

    await connectDB()

    const invoice = await Invoice.findById(id)
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    if (invoice.status === "cancelled") {
      return NextResponse.json({ error: "Invoice is already cancelled" }, { status: 400 })
    }

    const previousStatus = invoice.status
    invoice.status = "cancelled"
    await invoice.save()

    await InvoiceActivityLog.create({
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`,
      actorRole: session.role,
      action: "cancel",
      notes: reason,
      previousState: { status: previousStatus },
      newState: { status: "cancelled" },
    })

    return NextResponse.json({
      success: true,
      invoice,
    })
  } catch (error: any) {
    console.error("Cancel invoice error:", error)
    return NextResponse.json({ error: error.message || "Failed to cancel invoice" }, { status: 500 })
  }
}

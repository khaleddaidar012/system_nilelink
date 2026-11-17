import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice, InvoiceActivityLog, Payment } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { assertStaffPermission } from "@/lib/auth/require-permission"
import { UpdateInvoiceSchema } from "@/lib/validations/invoice-validation"
import { calculateInvoiceTotals } from "@/lib/engine/invoice-calculator"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-detail", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const invoice = await Invoice.findById(id)
      .populate("customerId")
      .populate("relatedRequestId")
      .populate("createdBy", "firstName lastName email")
      .populate("confirmedBy", "firstName lastName email")
      .populate("sentBy", "firstName lastName email")
      .lean()

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Fetch associated payments and recent audit activity logs
    const [payments, activityLogs] = await Promise.all([
      Payment.find({ invoiceId: id }).sort({ paymentDate: -1 }).lean(),
      InvoiceActivityLog.find({ invoiceId: id }).sort({ createdAt: -1 }).limit(30).lean(),
    ])

    return NextResponse.json({
      success: true,
      invoice,
      payments,
      activityLogs,
    })
  } catch (error: any) {
    console.error("Admin fetch invoice details error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch invoice" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-update", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const invoice = await Invoice.findById(id)
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // STRICT SAFETY GATE: Confirmed invoices cannot be edited
    if (invoice.status !== "draft") {
      return NextResponse.json(
        { error: `Invoice is in '${invoice.status}' status and cannot be edited. Only draft invoices can be modified.` },
        { status: 400 }
      )
    }

    const body = await req.json()
    const validation = UpdateInvoiceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      )
    }

    const data = validation.data

    const editAuth = await assertStaffPermission(req, "editInvoice")
    if (!editAuth.authorized) return editAuth.response

    if (data.documentType === "tax_invoice") {
      const taxAuth = await assertStaffPermission(req, "issueTaxInvoice")
      if (!taxAuth.authorized) return taxAuth.response
    }

    const previousTotal = invoice.totalAmount

    // If items or financial rates are updated, recalculate
    if (data.items || data.taxRate !== undefined || data.discount !== undefined || data.additionalCharges !== undefined) {
      const calcResult = calculateInvoiceTotals({
        items: data.items || invoice.items,
        taxRate: data.taxRate !== undefined ? data.taxRate : invoice.taxRate,
        discount: data.discount !== undefined ? data.discount : invoice.discount,
        additionalCharges: data.additionalCharges !== undefined ? data.additionalCharges : invoice.additionalCharges,
      })

      if (!calcResult.isValid) {
        return NextResponse.json({ error: "Calculation errors", details: calcResult.errors }, { status: 400 })
      }

      invoice.items = calcResult.items
      invoice.subtotal = calcResult.subtotal
      invoice.taxRate = calcResult.taxRate
      invoice.tax = calcResult.tax
      invoice.discount = calcResult.discount
      invoice.additionalCharges = calcResult.additionalCharges
      invoice.totalAmount = calcResult.totalAmount
      invoice.remainingAmount = calcResult.totalAmount
      invoice.markModified("items")
    }

    if (data.documentType) invoice.documentType = data.documentType
    if (data.currency) invoice.currency = data.currency
    if (data.issueDate) invoice.issueDate = new Date(data.issueDate)
    if (data.dueDate) invoice.dueDate = new Date(data.dueDate)
    if (data.notes !== undefined) invoice.notes = data.notes
    if (data.internalNotes !== undefined) invoice.internalNotes = data.internalNotes
    if (data.relatedRequestId !== undefined) invoice.relatedRequestId = data.relatedRequestId as any
    invoice.updatedBy = session.userId as any

    await invoice.save()

    // Record activity log
    await InvoiceActivityLog.create({
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`,
      actorRole: session.role,
      action: "edit",
      notes: "Draft invoice details updated.",
      previousState: { totalAmount: previousTotal },
      newState: { totalAmount: invoice.totalAmount },
    })

    return NextResponse.json({
      success: true,
      invoice,
    })
  } catch (error: any) {
    console.error("Admin update invoice error:", error)
    return NextResponse.json({ error: error.message || "Failed to update invoice" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-archive", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const invoice = await Invoice.findById(id)
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // STRICT GATE: Only drafts can be deleted
    if (invoice.status !== "draft") {
      return NextResponse.json(
        { error: "Cannot delete confirmed, sent, or paid invoices. Only draft invoices can be deleted." },
        { status: 403 }
      )
    }

    await InvoiceActivityLog.create({
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`,
      actorRole: session.role,
      action: "delete",
      notes: `Draft invoice ${invoice.invoiceNumber} deleted.`,
    })

    await Invoice.findByIdAndDelete(id)

    return NextResponse.json({
      success: true,
      message: `Draft invoice ${invoice.invoiceNumber} successfully deleted.`,
    })
  } catch (error: any) {
    console.error("Admin delete invoice error:", error)
    return NextResponse.json({ error: error.message || "Failed to delete invoice" }, { status: 500 })
  }
}

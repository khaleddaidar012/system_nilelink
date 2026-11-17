import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { connectDB } from "@/lib/mongodb"
import { Payment, Invoice, Customer, InvoiceActivityLog } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

const RecordPaymentSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  invoiceId: z.string().min(1, "Invoice ID is required"),
  amount: z.number().positive("Payment amount must be greater than zero"),
  currency: z.string().default("EGP"),
  paymentMethod: z.enum(["bank_transfer", "credit_card", "cash", "cheque", "other"]).default("bank_transfer"),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
})

export async function POST(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "payment-record", request: req })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const parsed = RecordPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { customerId, invoiceId, amount, currency, paymentMethod, paymentDate, referenceNumber, notes } = parsed.data

    if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(invoiceId)) {
      return NextResponse.json({ error: "Invalid Customer or Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const [customer, invoice] = await Promise.all([
      Customer.findById(customerId),
      Invoice.findById(invoiceId),
    ])

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    if (invoice.status === "draft") {
      return NextResponse.json(
        { error: "Cannot record payments against draft invoices. Please confirm the invoice first." },
        { status: 400 }
      )
    }

    if (invoice.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot record payments against cancelled invoices." },
        { status: 400 }
      )
    }

    // 1. Create Payment record
    const payment = await Payment.create({
      customerId: customer._id,
      invoiceId: invoice._id,
      amount,
      currency,
      paymentMethod,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNumber: referenceNumber || undefined,
      notes: notes || "",
    })

    // 2. Update Invoice paidAmount and status
    const previousPaid = invoice.paidAmount || 0
    invoice.paidAmount = previousPaid + amount
    invoice.remainingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount)

    if (invoice.remainingAmount <= 0) {
      invoice.status = "paid"
    } else if (invoice.paidAmount > 0) {
      invoice.status = "partially_paid"
    }

    await invoice.save()

    // 3. Log Activity
    await InvoiceActivityLog.create({
      invoiceId: invoice._id,
      customerId: customer._id,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`.trim(),
      actorRole: session.role,
      action: "payment_recorded",
      notes: `Payment of ${amount} ${currency} recorded via ${paymentMethod} (Ref: ${referenceNumber || "N/A"}).`,
      newState: {
        paidAmount: invoice.paidAmount,
        remainingAmount: invoice.remainingAmount,
        status: invoice.status,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Payment successfully recorded",
      payment,
      invoice: {
        id: invoice._id,
        paidAmount: invoice.paidAmount,
        remainingAmount: invoice.remainingAmount,
        status: invoice.status,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error("Record payment error:", error)
    return NextResponse.json({ error: error.message || "Failed to record payment" }, { status: 500 })
  }
}

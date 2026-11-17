import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice, Payment } from "@/lib/models"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
  const { token } = await params;
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "public-invoice", request: req, id: token })
    await connectDB()

    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const invoice = await Invoice.findOne({
      token,
      status: { $ne: "draft" },
    })
      .populate("customerId", "companyName email phone address")
      .select("-internalNotes")
      .lean()

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Fetch payment history for this invoice
    const payments = await Payment.find({ invoiceId: invoice._id })
      .sort({ paymentDate: -1 })
      .lean()

    return NextResponse.json({ success: true, invoice, payments })
  } catch (error) {
    console.error("Fetch public invoice error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

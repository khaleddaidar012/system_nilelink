import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export async function GET(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "portal-financials", request: req })
    const session = await getSessionFromRequest(req)
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDB()

    let customerId = session.customerId
    if (!customerId) {
      const { User, Customer } = await import("@/lib/models")
      const user = await User.findById(session.userId).lean() as any
      customerId = user?.customerId
      if (!customerId && user?.email) {
        const customer = await Customer.findOne({ contactEmail: user.email }).lean() as any
        customerId = customer?._id
      }
    }

    if (!customerId) {
      return NextResponse.json({
        success: true,
        invoices: [],
        metrics: { totalInvoicesValue: 0, totalPaid: 0, totalRemaining: 0 }
      })
    }

    // Fetch only non-draft invoices sorted by creation date descending
    const invoices = await Invoice.find({
      customerId,
      status: { $ne: "draft" },
    })
      .select("-internalNotes")
      .sort({ createdAt: -1 })
      .lean()
      
    // Calculate metrics
    const metrics = invoices.reduce(
      (acc, inv) => {
        if (inv.status !== "cancelled" && inv.status !== "draft") {
          acc.totalInvoicesValue += inv.totalAmount || 0
          acc.totalPaid += inv.paidAmount || 0
          acc.totalRemaining += inv.remainingAmount || 0
        }
        return acc
      },
      { totalInvoicesValue: 0, totalPaid: 0, totalRemaining: 0 }
    )

    return NextResponse.json({ success: true, invoices, metrics })
  } catch (error) {
    console.error("Fetch financials error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

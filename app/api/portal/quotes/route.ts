import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Quote } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "quotes-list", request: req })
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
      return NextResponse.json({ success: true, quotes: [] })
    }

    const { QuoteItem } = await import("@/lib/models")
    const rawQuotes = await Quote.find({ customerId })
      .populate("requestId", "trackingNumber subject operationType origin destination status")
      .sort({ createdAt: -1 })
      .lean()

    const quotes = await Promise.all(
      rawQuotes.map(async (q: any) => {
        const items = await QuoteItem.find({ quoteId: q._id }).lean()
        return {
          ...q,
          requestNumber: q.requestId?.trackingNumber || q.requestNumber || "-",
          items,
        }
      })
    )

    return NextResponse.json({ success: true, quotes })
  } catch (error) {
    console.error("Fetch quotes error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

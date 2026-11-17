import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { CustomerRequest } from "@/lib/models"
import { connectDB } from "@/lib/mongodb"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import mongoose from "mongoose"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolvedParams = await params
    const id = resolvedParams.id
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Request ID" }, { status: 400 })
    }

    const { RequestService, Quote, QuoteItem } = await import("@/lib/models")
    void RequestService // ensure model is registered

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "admin-request-get", request: req, id: id })
    }

    await connectDB()

    const request = await CustomerRequest
      .findById(id)
      .populate("customerId", "companyName contactEmail contactPhone")
      .populate("services")
      .populate("requestedBy", "name email")
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    const quote = await Quote.findOne({ requestId: id }).sort({ createdAt: -1 })
    let quoteItems: any[] = []
    if (quote) {
      quoteItems = await QuoteItem.find({ quoteId: quote._id }).lean()
    }

    return NextResponse.json({ request, quote, quoteItems })
  } catch (error: any) {
    console.error("Fetch Request Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch request", details: error.message },
      { status: 500 }
    )
  }
}

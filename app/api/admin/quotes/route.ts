import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Quote, QuoteItem, CustomerRequest, Notification } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "admin-quotes-list", request: req })
    }

    await connectDB()

    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get("requestId")

    if (requestId) {
      const quote = await Quote.findOne({ requestId }).sort({ createdAt: -1 })
      if (!quote) {
        return NextResponse.json({ success: true, quote: null, items: [] })
      }
      const items = await QuoteItem.find({ quoteId: quote._id }).lean()
      return NextResponse.json({ success: true, quote, items })
    }

    // List all quotes with customer and request information
    const quotes = await Quote.find()
      .sort({ createdAt: -1 })
      .populate("customerId", "companyName contactEmail contactPhone")
      .populate("requestId", "trackingNumber subject operationType origin destination")
      .lean()

    return NextResponse.json({ success: true, quotes })
  } catch (error: any) {
    console.error("Fetch Quotes error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "admin-quote-save", request: req })
    }

    await connectDB()

    const body = await req.json()
    const { requestId, customerId, validUntil, items, notes, currency, quoteId } = body

    if (!requestId || !customerId || !items || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Calculate total
    let totalAmount = 0
    for (const item of items) {
      totalAmount += (Number(item.finalPrice) || 0)
    }

    // Check if updating an existing quote
    let targetQuote = null
    if (quoteId) {
      targetQuote = await Quote.findById(quoteId)
    }
    if (!targetQuote && requestId) {
      targetQuote = await Quote.findOne({ requestId }).sort({ createdAt: -1 })
    }

    let quote
    let isUpdate = false

    if (targetQuote) {
      isUpdate = true
      targetQuote.totalAmount = totalAmount
      targetQuote.currency = currency || targetQuote.currency || "EGP"
      if (validUntil) targetQuote.validUntil = new Date(validUntil)
      targetQuote.notes = notes !== undefined ? notes : targetQuote.notes
      targetQuote.status = "sent"
      await targetQuote.save()
      quote = targetQuote

      // Delete old items and recreate
      await QuoteItem.deleteMany({ quoteId: targetQuote._id })
    } else {
      // Generate unique quote number
      const year = new Date().getFullYear()
      const randomSeq = Math.floor(1000 + Math.random() * 9000)
      const quoteNumber = `NL-QT-${year}-${randomSeq}`

      quote = await Quote.create({
        requestId,
        customerId,
        quoteNumber,
        status: "sent",
        totalAmount,
        currency: currency || "EGP",
        validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes,
        createdBy: session.userId,
      })
    }

    // Create Quote Items
    for (const item of items) {
      await QuoteItem.create({
        quoteId: quote._id,
        requestServiceId: item.requestServiceId || undefined,
        serviceKey: item.serviceKey,
        basePrice: Number(item.basePrice) || 0,
        additionalCharges: Number(item.additionalCharges) || 0,
        discount: Number(item.discount) || 0,
        finalPrice: Number(item.finalPrice) || 0,
        currency: currency || "EGP",
        breakdown: item.breakdown || [],
        note: item.note || "",
        auditTrail: [
          {
            updatedBy: session.userId as any,
            previousPrice: 0,
            newPrice: Number(item.finalPrice) || 0,
            reason: isUpdate ? "Quote Updated" : "Initial Quote Generation",
            date: new Date(),
          },
        ],
      })
    }

    // Update CustomerRequest status & timeline
    const request = await CustomerRequest.findById(requestId)
    if (request) {
      request.status = "quote_provided"
      request.timeline.push({
        status: "quote_provided",
        title: isUpdate ? "Quote Updated" : "Quote Provided",
        comment: `Quote ${quote.quoteNumber} (${totalAmount} ${currency || "EGP"}) has been ${isUpdate ? "updated and sent" : "sent"} to customer for review.`,
        updatedBy: session.userId as any,
        createdAt: new Date(),
      })
      await request.save()
    }

    // Send Notification to Customer
    await Notification.create({
      recipientCustomerId: customerId,
      targetAudience: "customer",
      title: isUpdate ? `Quote Updated: ${quote.quoteNumber}` : `New Quote Available: ${quote.quoteNumber}`,
      message: `A quote of ${totalAmount} ${currency || "EGP"} has been ${isUpdate ? "updated" : "provided"} for your request.`,
      channel: "in_app",
      type: "request_update",
      severity: "normal",
      relatedRequestId: requestId,
    })

    return NextResponse.json({ success: true, quote }, { status: isUpdate ? 200 : 201 })
  } catch (error: any) {
    console.error("Quote generation/update error:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error?.message || String(error),
      stack: error?.stack 
    }, { status: 500 })
  }
}

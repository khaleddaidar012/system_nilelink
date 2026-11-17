import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { CustomerRequest, Notification, Quote, QuoteItem } from "@/lib/models"
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

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "admin-request-quotes", request: req, id: id })
    }

    await connectDB()

    const quote = await Quote.findOne({ requestId: id }).sort({ createdAt: -1 })
    if (!quote) {
      return NextResponse.json({ success: true, quote: null, items: [] })
    }

    const items = await QuoteItem.find({ quoteId: quote._id }).lean()
    return NextResponse.json({ success: true, quote, items })
  } catch (error: any) {
    console.error("GET Quote Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
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

    const body = await req.json()
    const { departureDate, arrivalDate, transitTime, price, currency, notes } = body

    if (!departureDate || !arrivalDate || !price) {
      return NextResponse.json({ error: "Departure Date, Arrival Date, and Price are required" }, { status: 400 })
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "admin-request-schedule", request: req, input: body, id: id })
    }

    await connectDB()

    const request = await CustomerRequest.findById(id)
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    // Update details.quote
    const quote = {
      departureDate,
      arrivalDate,
      transitTime,
      price,
      currency: currency || "EGP",
      notes: notes || "",
      issuedAt: new Date(),
      issuedBy: session.userId
    }

    request.details = {
      ...request.details,
      quote
    }
    
    // Change status to quote_provided
    request.status = "quote_provided"

    // Append to timeline
    request.timeline.push({
      status: "quote_provided",
      title: "Schedule & Quote Provided",
      comment: `A schedule has been provided. Departure: ${departureDate}, Arrival: ${arrivalDate}. Price: ${price} ${currency || "EGP"}. ${notes || ""}`,
      updatedBy: session.userId as any,
      createdAt: new Date(),
    })

    await request.save()

    // Notify Customer
    await Notification.create({
      recipientCustomerId: request.customerId,
      targetAudience: "customer",
      title: "Booking Schedule & Quote Provided",
      message: `We have provided a schedule for your request ${request.trackingNumber}. Please review the details.`,
      type: "request_update",
      channel: "in_app",
      severity: "normal",
      actionUrl: `/portal/requests`,
      relatedRequestId: request._id,
      isRead: false,
      emailStatus: "not_applicable",
      whatsappStatus: "not_applicable",
      dispatchedBy: session.userId,
    })

    return NextResponse.json({ success: true, request })
  } catch (error: any) {
    console.error("Provide Quote Error:", error)
    return NextResponse.json(
      { error: "Failed to provide quote", details: error.message },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { generateInvoicePdfBuffer } from "@/lib/services/invoice-pdf-generator"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "portal-invoice-pdf", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    // Resolve customer ID
    let customerId = session.customerId
    if (!customerId) {
      const { User } = await import("@/lib/models")
      const user = await User.findById(session.userId).lean() as any
      customerId = user?.customerId
    }

    if (!customerId && session.role !== "super_admin" && session.role !== "staff") {
      return NextResponse.json({ error: "Forbidden: Customer profile required" }, { status: 403 })
    }

    // STRICT IDOR & DRAFT BARRIER
    const query: Record<string, any> = {
      _id: id,
      status: { $ne: "draft" },
    }

    if (session.role === "customer" || session.role === "customer_admin") {
      query.customerId = customerId
    }

    const invoice = await Invoice.findOne(query).populate("customerId")
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found or unavailable" }, { status: 404 })
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice)

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    })
  } catch (error: any) {
    console.error("Portal invoice PDF download error:", error)
    return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 })
  }
}

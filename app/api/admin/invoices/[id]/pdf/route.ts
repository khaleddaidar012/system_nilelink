import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice } from "@/lib/models"
import type { FinancialDocumentType } from "@/lib/models/Invoice"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { assertStaffPermission } from "@/lib/auth/require-permission"
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
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "admin-invoice-pdf", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const invoice = await Invoice.findById(id).populate("customerId").populate("relatedRequestId")
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const requestedType = searchParams.get("type") as FinancialDocumentType | null
    const effectiveType = requestedType || invoice.documentType || "statement"

    // STRICT SECURITY GATE: Tax Invoices require explicit authorization
    if (effectiveType === "tax_invoice") {
      const auth = await assertStaffPermission(req, "issueTaxInvoice")
      if (!auth.authorized) {
        return auth.response
      }
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice, requestedType || undefined)

    const filename = `${effectiveType}_${invoice.invoiceNumber}.pdf`

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    })
  } catch (error: any) {
    console.error("Admin generate PDF error:", error)
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 })
  }
}

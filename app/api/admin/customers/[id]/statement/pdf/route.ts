import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { assertStaffPermission } from "@/lib/auth/require-permission"
import { generateCustomerLedger } from "@/lib/engine/customer-ledger-engine"
import { generateCustomerStatementPdfBuffer } from "@/lib/services/statement-pdf-generator"
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
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "statement-pdf", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = await assertStaffPermission(req, "exportCustomerStatements")
    if (!auth.authorized) {
      return auth.response
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Customer ID" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const type = (searchParams.get("type") as any) || "all"
    const currency = searchParams.get("currency") || "EGP"

    const statement = await generateCustomerLedger({
      customerId: id,
      fromDate,
      toDate,
      filterType: type,
      currency,
      actorSession: {
        userId: session.userId,
        name: `${session.firstName} ${session.lastName}`.trim(),
        email: session.email,
      },
    })

    const pdfBuffer = await generateCustomerStatementPdfBuffer(statement)

    const sanitizedCompanyName = (statement.customer.companyName || "client")
      .replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, "_")
      .substring(0, 30)
    const filename = `Statement_${sanitizedCompanyName}_${fromDate || "all"}.pdf`

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
    console.error("Generate statement PDF error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate statement PDF" },
      { status: 500 }
    )
  }
}

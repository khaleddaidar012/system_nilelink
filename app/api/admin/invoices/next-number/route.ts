import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { peekNextInvoiceNumber } from "@/lib/services/invoice-number-service"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export async function GET(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-next-number", request: req })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get("year")
    const year = yearParam ? parseInt(yearParam, 10) : undefined

    const nextNumber = await peekNextInvoiceNumber({ year })

    return NextResponse.json({
      success: true,
      nextNumber,
      year: year || new Date().getFullYear(),
    })
  } catch (error: any) {
    console.error("Fetch next invoice number error:", error)
    return NextResponse.json({ error: "Failed to preview next invoice number" }, { status: 500 })
  }
}

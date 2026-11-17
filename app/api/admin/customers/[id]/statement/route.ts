import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { assertStaffPermission } from "@/lib/auth/require-permission"
import { generateCustomerLedger } from "@/lib/engine/customer-ledger-engine"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "statement-view", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Server-side permission check: viewCustomerStatements
    const auth = await assertStaffPermission(req, "viewCustomerStatements")
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

    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      return NextResponse.json(
        { error: "From Date cannot be later than To Date" },
        { status: 400 }
      )
    }

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

    return NextResponse.json({
      success: true,
      statement,
    })
  } catch (error: any) {
    console.error("Fetch customer statement error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate customer statement" },
      { status: 500 }
    )
  }
}

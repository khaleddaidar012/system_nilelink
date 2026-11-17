import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1AccountAction } from "@/lib/accounts/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Customer } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()

    if (getDatabaseProvider() === "d1") {
      return handleD1AccountAction({ action: "customers-search", request: req })
    }

    await connectDB()

    const query: Record<string, any> = {}
    if (q) {
      query.$or = [
        { companyName: { $regex: q, $options: "i" } },
        { commercialRegisterNumber: { $regex: q, $options: "i" } },
        { contactEmail: { $regex: q, $options: "i" } },
      ]
    }

    const customers = await Customer.find(query)
      .select("companyName commercialRegisterNumber contactEmail contactPhone address city country")
      .sort({ companyName: 1 })
      .limit(30)
      .lean()

    return NextResponse.json({
      success: true,
      customers: customers.map((c: any) => ({
        id: c._id.toString(),
        companyName: c.companyName,
        commercialRegisterNumber: c.commercialRegisterNumber,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        address: c.address,
        city: c.city,
        country: c.country,
      })),
    })
  } catch (error: any) {
    console.error("Customer search error:", error)
    return NextResponse.json({ error: "Failed to search customers" }, { status: 500 })
  }
}

import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { PricingRule } from "@/lib/models/PricingRule"
import { connectDB } from "@/lib/mongodb"

export async function GET(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "pricing-list", request: req })
    }

    await connectDB()
    const rules = await PricingRule.find().sort({ createdAt: -1 })
    return NextResponse.json({ success: true, data: rules })
  } catch (error) {
    console.error("Error fetching pricing rules:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch pricing rules" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "pricing-create", request: req })
    }

    await connectDB()
    const body = await req.json()
    const newRule = await PricingRule.create(body)
    return NextResponse.json({ success: true, data: newRule }, { status: 201 })
  } catch (error) {
    console.error("Error creating pricing rule:", error)
    return NextResponse.json({ success: false, error: "Failed to create pricing rule" }, { status: 500 })
  }
}

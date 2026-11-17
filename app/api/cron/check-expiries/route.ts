import { NextRequest, NextResponse } from "next/server"
import { runExpiryEvaluation } from "@/lib/cron/expiry-tracker"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export async function POST(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "expiry-evaluate", request: req })
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET || "nilelink_cron_secret_2026_automated_radar"

    // Either authorized via bearer cron secret, or authenticated staff/manager
    const isCronSecretValid = authHeader === `Bearer ${cronSecret}`
    let isStaffSession = false

    if (!isCronSecretValid) {
      const session = await getSessionFromRequest(req)
      if (session && (session.role === "staff" || session.role === "super_admin")) {
        isStaffSession = true
      }
    }

    if (!isCronSecretValid && !isStaffSession) {
      return NextResponse.json({ error: "Unauthorized access to cron runner" }, { status: 401 })
    }

    const results = await runExpiryEvaluation()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    })
  } catch (error: unknown) {
    console.error("POST /api/cron/check-expiries error:", error)
    return NextResponse.json({ error: "Internal server error during expiry check" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

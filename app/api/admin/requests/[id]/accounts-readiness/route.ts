import { NextResponse } from "next/server"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

type Context = { params: Promise<{ id: string }> }
export const dynamic = "force-dynamic"

/** POST { action: "mark" | "approve" | "reject", note?: string } */
export async function POST(request: Request, context: Context) {
  let payload: Record<string, unknown> = {}
  try {
    const value = await request.json()
    if (value && typeof value === "object" && !Array.isArray(value)) payload = value as Record<string, unknown>
  } catch { /* an empty or invalid body is rejected below */ }
  const kind = payload.action
  const action = kind === "mark" ? "accounts-readiness-mark" : kind === "approve" || kind === "reject" ? "accounts-readiness-decide" : null
  if (!action) return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  const response = await handleD1Workflow({ action, request, id: (await context.params).id, input: { decision: kind, note: payload.note } })
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

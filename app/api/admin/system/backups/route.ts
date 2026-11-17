import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { callAgent } from "@/lib/backup/agent-client"
import { recordSystemAudit } from "@/lib/backup/audit"
import { backupErrorResponse, clientIp, requireBackupAdmin } from "@/lib/backup/guard"
import { connectDB } from "@/lib/mongodb"
import { SystemAuditLog } from "@/lib/models/SystemAuditLog"

export const dynamic = "force-dynamic"

const COOLDOWN_MS = 30_000

const querySchema = z.object({
  type: z.enum(["automatic", "manual", "safety", "import"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().min(0).default(0),
})

const createSchema = z.object({ reason: z.string().trim().max(200).optional() }).strict()

export async function GET(request: NextRequest) {
  const ctx = await requireBackupAdmin(request)
  if (ctx instanceof NextResponse) return ctx
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return NextResponse.json({ error: "Invalid query", code: "INVALID_REQUEST" }, { status: 400 })
    const qs = new URLSearchParams({ limit: String(parsed.data.limit), cursor: String(parsed.data.cursor) })
    if (parsed.data.type) qs.set("type", parsed.data.type)
    const data = await callAgent("GET", `/v1/backups?${qs.toString()}`, { actor: ctx.actor })
    return NextResponse.json(data)
  } catch (err) {
    return backupErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireBackupAdmin(request, { stateChanging: true })
  if (ctx instanceof NextResponse) return ctx
  try {
    let json: unknown = {}
    try {
      const text = await request.text()
      if (text) json = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: "Malformed JSON", code: "INVALID_REQUEST" }, { status: 400 })
    }
    const parsed = createSchema.safeParse(json)
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "INVALID_REQUEST" }, { status: 400 })

    // Cross-isolate cool-down: no manual request by any admin within the last 30 s
    await connectDB()
    const recent = await SystemAuditLog.exists({
      event: "BACKUP_REQUESTED",
      createdAt: { $gt: new Date(Date.now() - COOLDOWN_MS) },
    })
    if (recent) {
      return NextResponse.json(
        { error: "A backup was requested a moment ago. Please wait a few seconds.", code: "COOLDOWN" },
        { status: 429 }
      )
    }

    const actorAudit = {
      userId: ctx.actor.userId,
      email: ctx.actor.email,
      name: `${ctx.session.firstName ?? ""} ${ctx.session.lastName ?? ""}`.trim(),
      role: ctx.session.role,
      kind: "user" as const,
    }
    await recordSystemAudit({
      event: "BACKUP_REQUESTED",
      operation: "backup",
      result: "requested",
      actor: actorAudit,
      details: { reason: parsed.data.reason },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    try {
      const data = await callAgent<{ jobId: string }>("POST", "/v1/backups", {
        body: parsed.data.reason ? { reason: parsed.data.reason } : {},
        actor: ctx.actor,
      })
      return NextResponse.json(data, { status: 202 })
    } catch (err) {
      await recordSystemAudit({
        event: "BACKUP_FAILED",
        operation: "backup",
        result: "failure",
        actor: actorAudit,
        details: { stage: "request", error: err instanceof Error ? err.message : "unknown" },
      })
      throw err
    }
  } catch (err) {
    return backupErrorResponse(err)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { callAgent } from "@/lib/backup/agent-client"
import { recordSystemAudit } from "@/lib/backup/audit"
import { BACKUP_ID_REGEX, backupErrorResponse, clientIp, requireBackupAdmin } from "@/lib/backup/guard"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }

const restoreSchema = z
  .object({
    targetMode: z.enum(["test", "production"]).default("test"),
    targetDbName: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    confirmPhrase: z.string().optional(),
    acknowledgeDataLoss: z.boolean().optional(),
  })
  .strict()

export async function POST(request: NextRequest, { params }: Props) {
  const ctx = await requireBackupAdmin(request, { destructive: true, stateChanging: true })
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  if (!BACKUP_ID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid backup id", code: "INVALID_ID" }, { status: 400 })
  }

  const rawJson = await request.json().catch(() => null)
  const parsed = restoreSchema.safeParse(rawJson)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid restore request", code: "INVALID_REQUEST" }, { status: 400 })
  }

  // Production restore strictly requires super_admin role and explicit confirmations
  if (parsed.data.targetMode === "production") {
    if (ctx.session.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super administrators can perform production database restores", code: "FORBIDDEN" },
        { status: 403 }
      )
    }
    if (parsed.data.confirmPhrase !== "RESTORE") {
      return NextResponse.json(
        { error: "Confirmation phrase must be 'RESTORE'", code: "INVALID_REQUEST" },
        { status: 400 }
      )
    }
    if (!parsed.data.acknowledgeDataLoss) {
      return NextResponse.json(
        { error: "You must acknowledge potential data loss before proceeding", code: "INVALID_REQUEST" },
        { status: 400 }
      )
    }
  }

  const actorAudit = {
    userId: ctx.actor.userId,
    email: ctx.actor.email,
    name: `${ctx.session.firstName ?? ""} ${ctx.session.lastName ?? ""}`.trim(),
    role: ctx.session.role,
    kind: "user" as const,
  }

  await recordSystemAudit({
    event: "RESTORE_REQUESTED",
    operation: "restore",
    result: "requested",
    actor: actorAudit,
    backupId: id,
    details: {
      targetMode: parsed.data.targetMode,
      targetDbName: parsed.data.targetDbName,
    },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  try {
    const data = await callAgent<{ jobId: string }>("POST", `/v1/backups/${id}/restore`, {
      body: parsed.data,
      actor: ctx.actor,
    })
    return NextResponse.json(data, { status: 202 })
  } catch (err) {
    await recordSystemAudit({
      event: "RESTORE_FAILED",
      operation: "restore",
      result: "failure",
      actor: actorAudit,
      backupId: id,
      details: {
        stage: "request",
        targetMode: parsed.data.targetMode,
        error: err instanceof Error ? err.message : "unknown",
      },
    })
    return backupErrorResponse(err)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { callAgent } from "@/lib/backup/agent-client"
import { recordSystemAudit } from "@/lib/backup/audit"
import { BACKUP_ID_REGEX, backupErrorResponse, clientIp, requireBackupAdmin } from "@/lib/backup/guard"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Props) {
  const ctx = await requireBackupAdmin(request)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!BACKUP_ID_REGEX.test(id)) return NextResponse.json({ error: "Invalid backup id", code: "INVALID_ID" }, { status: 400 })
  try {
    return NextResponse.json(await callAgent("GET", `/v1/backups/${id}`, { actor: ctx.actor }))
  } catch (err) {
    return backupErrorResponse(err)
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const ctx = await requireBackupAdmin(request, { destructive: true })
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!BACKUP_ID_REGEX.test(id)) return NextResponse.json({ error: "Invalid backup id", code: "INVALID_ID" }, { status: 400 })
  const actor = { userId: ctx.actor.userId, email: ctx.actor.email, role: ctx.session.role, kind: "user" as const }
  try {
    const data = await callAgent("DELETE", `/v1/backups/${id}`, { actor: ctx.actor })
    await recordSystemAudit({ event: "BACKUP_DELETED", operation: "delete", result: "success", actor, backupId: id, ipAddress: clientIp(request) })
    return NextResponse.json(data)
  } catch (err) {
    await recordSystemAudit({
      event: "BACKUP_DELETED",
      operation: "delete",
      result: "failure",
      actor,
      backupId: id,
      details: { error: err instanceof Error ? err.message : "unknown" },
    })
    return backupErrorResponse(err)
  }
}

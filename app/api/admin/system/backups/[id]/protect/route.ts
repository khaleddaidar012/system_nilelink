import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { callAgent } from "@/lib/backup/agent-client"
import { recordSystemAudit } from "@/lib/backup/audit"
import { BACKUP_ID_REGEX, backupErrorResponse, clientIp, requireBackupAdmin } from "@/lib/backup/guard"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }
const bodySchema = z.object({ protected: z.boolean() }).strict()

export async function POST(request: NextRequest, { params }: Props) {
  const ctx = await requireBackupAdmin(request, { destructive: true })
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!BACKUP_ID_REGEX.test(id)) return NextResponse.json({ error: "Invalid backup id", code: "INVALID_ID" }, { status: 400 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "INVALID_REQUEST" }, { status: 400 })
  try {
    const data = await callAgent("POST", `/v1/backups/${id}/protect`, { body: parsed.data, actor: ctx.actor })
    await recordSystemAudit({
      event: parsed.data.protected ? "BACKUP_PROTECTED" : "BACKUP_UNPROTECTED",
      operation: "protect",
      result: "success",
      actor: { userId: ctx.actor.userId, email: ctx.actor.email, role: ctx.session.role, kind: "user" },
      backupId: id,
      ipAddress: clientIp(request),
    })
    return NextResponse.json(data)
  } catch (err) {
    return backupErrorResponse(err)
  }
}

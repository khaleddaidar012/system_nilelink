import { NextRequest, NextResponse } from "next/server"
import { callAgent } from "@/lib/backup/agent-client"
import { backupErrorResponse, requireBackupAdmin } from "@/lib/backup/guard"

export const dynamic = "force-dynamic"

/** Agent health + scheduler info. Returns `{ online:false }` instead of an error when the agent is down. */
export async function GET(request: NextRequest) {
  const ctx = await requireBackupAdmin(request)
  if (ctx instanceof NextResponse) return ctx
  try {
    const data = await callAgent<Record<string, unknown>>("GET", "/v1/health", { actor: ctx.actor, timeoutMs: 6000 })
    return NextResponse.json({ online: true, ...data })
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code
      if (
        code === "AGENT_UNAVAILABLE" ||
        code === "BACKUP_NOT_CONFIGURED" ||
        code === "CF_ACCESS_DENIED" ||
        code === "AGENT_AUTH_FAILED"
      ) {
        return NextResponse.json({ online: false, reason: code })
      }
    }
    return backupErrorResponse(err)
  }
}


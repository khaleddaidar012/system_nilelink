import { NextRequest, NextResponse } from "next/server"
import { callAgent } from "@/lib/backup/agent-client"
import { recordSystemAudit } from "@/lib/backup/audit"
import { JOB_ID_REGEX, backupErrorResponse, requireBackupAdmin } from "@/lib/backup/guard"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ jobId: string }> }

interface AgentJob {
  jobId: string
  kind: string
  state: "queued" | "running" | "succeeded" | "failed" | "interrupted"
  step: string | null
  resultBackupId?: string
  error?: { code: string; message: string }
}

/** Polling endpoint. The first poll that sees a terminal backup job writes its audit entry (unique per jobId+event). */
export async function GET(request: NextRequest, { params }: Props) {
  const ctx = await requireBackupAdmin(request)
  if (ctx instanceof NextResponse) return ctx
  const { jobId } = await params
  if (!JOB_ID_REGEX.test(jobId)) return NextResponse.json({ error: "Invalid job id", code: "INVALID_REQUEST" }, { status: 400 })
  try {
    const job = await callAgent<AgentJob>("GET", `/v1/jobs/${jobId}`, { actor: ctx.actor })
    if (job.kind === "backup" && (job.state === "succeeded" || job.state === "failed" || job.state === "interrupted")) {
      await recordSystemAudit({
        event: job.state === "succeeded" ? "BACKUP_CREATED" : "BACKUP_FAILED",
        operation: "backup",
        result: job.state === "succeeded" ? "success" : "failure",
        actor: { userId: ctx.actor.userId, email: ctx.actor.email, role: ctx.session.role, kind: "user" },
        backupId: job.resultBackupId,
        jobId,
        details: job.error ? { code: job.error.code, message: job.error.message } : undefined,
      })
    }
    if (job.kind === "restore" && (job.state === "succeeded" || job.state === "failed" || job.state === "interrupted")) {
      await recordSystemAudit({
        event: job.state === "succeeded" ? "RESTORE_COMPLETED" : "RESTORE_FAILED",
        operation: "restore",
        result: job.state === "succeeded" ? "success" : "failure",
        actor: { userId: ctx.actor.userId, email: ctx.actor.email, role: ctx.session.role, kind: "user" },
        backupId: job.resultBackupId,
        jobId,
        details: job.error ? { code: job.error.code, message: job.error.message } : undefined,
      })
    }
    return NextResponse.json(job)
  } catch (err) {
    return backupErrorResponse(err)
  }
}

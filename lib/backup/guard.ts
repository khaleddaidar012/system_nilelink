import { NextResponse } from "next/server"
import { assertStaffPermission } from "@/lib/auth/require-permission"
import type { AuthSessionPayload } from "@/lib/auth/token-service"
import { connectDB } from "@/lib/mongodb"
import { User } from "@/lib/models/User"
import { BackupApiError } from "./agent-client"
import type { AgentActor } from "./agent-client"
import { getDatabaseProvider } from "../db/provider"

export const BACKUP_ID_REGEX = /^bk_\d{8}T\d{6}Z_(auto|manual|safety|import)_[a-z0-9]{8}$/
export const JOB_ID_REGEX = /^job_[a-f0-9]{16}$/

export interface BackupAdminContext {
  session: AuthSessionPayload
  actor: AgentActor
}

/** Same-origin enforcement for cookie-authenticated state-changing requests. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  const host = request.headers.get("host")
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site")
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none"
}

let requireBackupAdminOverride: ((request: Request, options?: { destructive?: boolean; stateChanging?: boolean }) => Promise<BackupAdminContext | NextResponse>) | null = null

export function setRequireBackupAdminOverrideForTesting(override: typeof requireBackupAdminOverride) {
  requireBackupAdminOverride = override
}

/**
 * super_admin, or staff with the `canManageBackups` permission (decision D5).
 * Destructive operations re-check role, status and permission against the database.
 */
export async function requireBackupAdmin(
  request: Request,
  options: { destructive?: boolean; stateChanging?: boolean } = {}
): Promise<BackupAdminContext | NextResponse> {
  if (requireBackupAdminOverride) {
    return requireBackupAdminOverride(request, options)
  }
  if (getDatabaseProvider() === "d1") {
    try {
      const { getD1 } = await import("../db/d1")
      const { WorkflowStore, actorFor } = await import("../workflows/runtime")
      const actor = await actorFor(new WorkflowStore(await getD1()), request)
      if (actor.user.role !== "super_admin" && !(actor.user.role === "staff" && actor.user.staffPermissions?.canManageBackups)) {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
      }
      if ((options.stateChanging || options.destructive) && !isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected", code: "FORBIDDEN" }, { status: 403 })
      return NextResponse.json({ error: "D1-native backup and restore are not configured. MongoDB backup agent cannot operate on D1.", code: "D1_BACKUP_UNAVAILABLE" }, { status: 503 })
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 503
      return NextResponse.json({ error: "D1 backup access unavailable", code: "D1_BACKUP_UNAVAILABLE" }, { status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 503 })
    }
  }
  const auth = await assertStaffPermission(request, "canManageBackups")
  if (!auth.authorized) return auth.response

  if ((options.stateChanging || options.destructive) && !isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected", code: "FORBIDDEN" }, { status: 403 })
  }

  const { session } = auth
  if (options.destructive) {
    await connectDB()
    const user = await User.findById(session.userId).select("role status staffPermissions").lean()
    const allowed =
      user &&
      user.status === "active" &&
      (user.role === "super_admin" || (user.role === "staff" && user.staffPermissions?.canManageBackups === true))
    if (!allowed) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
  }

  return { session, actor: { userId: String(session.userId), email: session.email } }
}

export function backupErrorResponse(err: unknown): NextResponse {
  if (err instanceof BackupApiError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  }
  console.error("Unexpected backup API error")
  return NextResponse.json({ error: "Internal error", code: "INTERNAL" }, { status: 500 })
}

export function clientIp(request: Request): string | undefined {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined
}

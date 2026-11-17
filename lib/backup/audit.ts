import { connectDB } from "@/lib/mongodb"
import { SystemAuditLog, SystemAuditEvent, SystemAuditOperation, SystemAuditResult } from "@/lib/models/SystemAuditLog"
import mongoose from "mongoose"

export interface RecordAuditParams {
  event: SystemAuditEvent
  operation: SystemAuditOperation
  result: SystemAuditResult
  actor?: {
    userId?: string | mongoose.Types.ObjectId
    email?: string
    name?: string
    role?: string
    kind?: "user" | "system" | "agent"
  }
  backupId?: string
  relatedBackupId?: string
  jobId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Strips secrets, URIs and credentials from audit details.
 */
function sanitizeAuditDetails(details?: Record<string, unknown>): Record<string, unknown> {
  if (!details) return {}
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(details)) {
    // Drop keys matching passwords, secrets, tokens
    if (/password|secret|token|uri|key|auth/i.test(key)) {
      continue
    }

    if (typeof value === "string") {
      // Redact Mongo URIs and tokens if found inside string values
      sanitized[key] = value
        .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "mongodb://[REDACTED]")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
        .slice(0, 500)
    } else if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditDetails(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 50)
    }
  }

  return sanitized
}

let recordSystemAuditOverride: ((params: RecordAuditParams) => Promise<void>) | null = null

export function setRecordSystemAuditOverrideForTesting(override: typeof recordSystemAuditOverride) {
  recordSystemAuditOverride = override
}

/**
 * Records an immutable audit log entry in MongoDB for backup and system operations.
 */
export async function recordSystemAudit(params: RecordAuditParams): Promise<void> {
  if (recordSystemAuditOverride) {
    return recordSystemAuditOverride(params)
  }
  try {
    await connectDB()

    const sanitizedDetails = sanitizeAuditDetails(params.details)

    await SystemAuditLog.create({
      event: params.event,
      operation: params.operation,
      result: params.result,
      actor: {
        userId: params.actor?.userId ? new mongoose.Types.ObjectId(String(params.actor.userId)) : undefined,
        email: params.actor?.email,
        name: params.actor?.name,
        role: params.actor?.role,
        kind: params.actor?.kind || "system",
      },
      backupId: params.backupId,
      relatedBackupId: params.relatedBackupId,
      jobId: params.jobId,
      details: sanitizedDetails,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      createdAt: new Date(),
    })
  } catch (error) {
    // If recording a terminal or non-critical audit fails, log error so it does not crash the caller
    console.error("Failed to record system audit log:", error)
  }
}

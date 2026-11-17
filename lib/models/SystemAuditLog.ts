import mongoose, { Schema, Document as MongooseDoc, Model } from "mongoose"

export type SystemAuditEvent =
  | "BACKUP_REQUESTED"
  | "BACKUP_CREATED"
  | "BACKUP_FAILED"
  | "BACKUP_DELETED"
  | "RESTORE_REQUESTED"
  | "RESTORE_STARTED"
  | "RESTORE_COMPLETED"
  | "RESTORE_FAILED"
  | "BACKUP_IMPORTED"
  | "BACKUP_IMPORT_FAILED"
  | "BACKUP_PROTECTED"
  | "BACKUP_UNPROTECTED"
  | "BACKUP_VERIFIED"
  | "ROLLBACK_STARTED"
  | "ROLLBACK_COMPLETED"
  | "ROLLBACK_FAILED"
  | "MAINTENANCE_ENABLED"
  | "MAINTENANCE_DISABLED"
  | "AGENT_AUTH_FAILED"
  | "EMAIL_SERVICE_OUTAGE"
  | "EMAIL_SERVICE_RESTORED"
  | "STAFF_CREATED"
  | "STAFF_UPDATED"

export type SystemAuditOperation =
  | "backup"
  | "restore"
  | "import"
  | "delete"
  | "protect"
  | "verify"
  | "retention"
  | "maintenance"
  | "email"
  | "staff"
  | "system"

export type SystemAuditResult = "requested" | "success" | "failure"

export interface ISystemAuditLog extends MongooseDoc {
  event: SystemAuditEvent
  operation: SystemAuditOperation
  result: SystemAuditResult
  actor: {
    userId?: mongoose.Types.ObjectId
    email?: string
    name?: string
    role?: string
    kind: "user" | "system" | "agent"
  }
  backupId?: string
  relatedBackupId?: string
  jobId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

const SystemAuditLogSchema = new Schema<ISystemAuditLog>(
  {
    event: {
      type: String,
      required: true,
      index: true,
    },
    operation: {
      type: String,
      required: true,
      index: true,
    },
    result: {
      type: String,
      enum: ["requested", "success", "failure"],
      required: true,
    },
    actor: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      email: { type: String, default: null },
      name: { type: String, default: null },
      role: { type: String, default: null },
      kind: {
        type: String,
        enum: ["user", "system", "agent"],
        required: true,
        default: "system",
      },
    },
    backupId: {
      type: String,
      default: null,
      index: true,
    },
    relatedBackupId: {
      type: String,
      default: null,
    },
    jobId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

// Compound indexes for administrative querying and timeline audit checks
SystemAuditLogSchema.index({ createdAt: -1 })
SystemAuditLogSchema.index({ backupId: 1, createdAt: -1 })
SystemAuditLogSchema.index({ event: 1, createdAt: -1 })
SystemAuditLogSchema.index({ jobId: 1, event: 1 }, { unique: true, sparse: true })

export const SystemAuditLog: Model<ISystemAuditLog> =
  mongoose.models.SystemAuditLog ||
  mongoose.model<ISystemAuditLog>("SystemAuditLog", SystemAuditLogSchema)

export default SystemAuditLog

export type AgentErrorCode =
  | "BUSY"
  | "INVALID_ID"
  | "NOT_FOUND"
  | "PROTECTED"
  | "TOOLS_NOT_FOUND"
  | "DB_UNREACHABLE"
  | "DISK_FULL"
  | "DISK_SPACE_LOW"
  | "DUMP_FAILED"
  | "TIMEOUT"
  | "VERIFY_FAILED"
  | "CORRUPT_BACKUP"
  | "INTERRUPTED"
  | "INVALID_REQUEST"
  | "NOT_IMPLEMENTED"
  | "SAFETY_BACKUP_FAILED"
  | "RESTORE_FAILED"
  | "CONFIG_INVALID"
  | "INTERNAL"

/** Typed error carrying a stable, safe code. Messages must never contain secrets. */
export class AgentError extends Error {
  readonly code: AgentErrorCode

  constructor(code: AgentErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = "AgentError"
    this.code = code
    if (options?.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

export function isAgentError(err: unknown): err is AgentError {
  return err instanceof AgentError
}

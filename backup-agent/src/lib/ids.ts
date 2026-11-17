import crypto from "node:crypto"
import { BACKUP_TYPES, BackupType, TYPE_TOKEN } from "../types/backup"

/**
 * Backup IDs are opaque, generated server-side and are the ONLY identifier accepted from API callers.
 * Format: bk_<UTC yyyyMMddTHHmmssZ>_<auto|manual|safety|import>_<8 hex chars>
 */
export const BACKUP_ID_REGEX = /^bk_\d{8}T\d{6}Z_(auto|manual|safety|import)_[a-z0-9]{8}$/

export function generateBackupId(
  type: BackupType,
  now: Date = new Date(),
  randomHex: () => string = () => crypto.randomBytes(4).toString("hex")
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  return `bk_${stamp}_${TYPE_TOKEN[type]}_${randomHex()}`
}

export function isValidBackupId(id: unknown): id is string {
  return typeof id === "string" && id.length <= 64 && BACKUP_ID_REGEX.test(id)
}

export function typeFromBackupId(id: string): BackupType | null {
  const match = BACKUP_ID_REGEX.exec(id)
  if (!match) return null
  const token = match[1]
  return BACKUP_TYPES.find((t) => TYPE_TOKEN[t] === token) ?? null
}

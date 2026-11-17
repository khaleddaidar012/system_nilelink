export const BACKUP_TYPES = ["automatic", "manual", "safety", "import"] as const
export type BackupType = (typeof BACKUP_TYPES)[number]

/** Folder (under BACKUP_ROOT) that holds each backup type. */
export const TYPE_FOLDER: Record<BackupType, string> = {
  automatic: "automatic",
  manual: "manual",
  safety: "safety",
  import: "imports",
}

/** Token embedded in the backup ID for each type. */
export const TYPE_TOKEN: Record<BackupType, string> = {
  automatic: "auto",
  manual: "manual",
  safety: "safety",
  import: "import",
}

export const ARCHIVE_FILE_NAME = "dump.archive.gz"
export const METADATA_FILE_NAME = "metadata.json"
export const CHECKSUM_FILE_NAME = "checksum.sha256"

export type BackupStatus = "completed" | "failed" | "running" | "quarantined"

/** Lightweight view used for listings (derived from metadata.json + file checks). */
export interface BackupSummary {
  id: string
  type: BackupType
  status: BackupStatus
  createdAt: string | null
  completedAt: string | null
  sizeBytes: number
  protected: boolean
  createdBy: { kind: "system" | "user"; userId?: string; email?: string } | null
  reason: string | null
  /** Why an item is quarantined (never contains paths or secrets). */
  problem: string | null
}

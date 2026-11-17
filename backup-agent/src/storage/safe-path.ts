import { promises as fs } from "node:fs"
import path from "node:path"
import { AgentError } from "../recovery/errors"
import { isValidBackupId, typeFromBackupId } from "../lib/ids"
import { BackupType } from "../types/backup"
import { typeDir } from "./layout"

/**
 * Resolve the directory of a backup from an opaque ID. Callers never supply paths.
 * 1) the ID must match the strict regex (rejects "..", slashes, drive letters, UNC, reserved names, etc.)
 * 2) the resolved path must stay inside BACKUP_ROOT (defence in depth)
 */
export function resolveBackupDir(root: string, id: string): { dir: string; type: BackupType } {
  if (!isValidBackupId(id)) {
    throw new AgentError("INVALID_ID", "Invalid backup id")
  }
  const type = typeFromBackupId(id)
  if (!type) {
    throw new AgentError("INVALID_ID", "Invalid backup id")
  }
  const dir = path.resolve(typeDir(root, type), id)
  assertInsideRoot(root, dir)
  return { dir, type }
}

export function assertInsideRoot(root: string, target: string): void {
  const resolvedRoot = path.resolve(root)
  const rel = path.relative(resolvedRoot, path.resolve(target))
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AgentError("INVALID_ID", "Path escapes the backup root")
  }
}

/** Rejects symlinks / junctions (reparse points). Returns false if the path does not exist. */
export async function existsAsPlainDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.lstat(p)
    if (st.isSymbolicLink()) {
      throw new AgentError("CORRUPT_BACKUP", "Backup folder is a link, refusing to follow")
    }
    return st.isDirectory()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
    throw err
  }
}

import { promises as fs } from "node:fs"
import path from "node:path"
import { BackupType, TYPE_FOLDER } from "../types/backup"

/**
 * Layout under BACKUP_ROOT:
 *   automatic\<id>\  manual\<id>\  safety\<id>\  imports\<id>\   (each: dump.archive.gz, metadata.json, checksum.sha256)
 *   temp\            working dirs (<id>.partial), upload staging, agent.lock, per-run mongo config files
 *   logs\            agent logs, failed\<id>.json, scheduler state, local audit
 */
export const LAYOUT_DIRS = ["automatic", "manual", "safety", "imports", "temp", "logs"] as const

export function typeDir(root: string, type: BackupType): string {
  return path.join(root, TYPE_FOLDER[type])
}

export function tempDir(root: string): string {
  return path.join(root, "temp")
}

export function logsDir(root: string): string {
  return path.join(root, "logs")
}

export function failedDir(root: string): string {
  return path.join(logsDir(root), "failed")
}

export function lockFilePath(root: string): string {
  return path.join(tempDir(root), "agent.lock")
}

export async function ensureLayout(root: string): Promise<void> {
  for (const dir of LAYOUT_DIRS) {
    await fs.mkdir(path.join(root, dir), { recursive: true })
  }
  await fs.mkdir(failedDir(root), { recursive: true })
}

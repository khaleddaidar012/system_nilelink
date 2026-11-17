import { promises as fs } from "node:fs"
import path from "node:path"
import { AgentError } from "../recovery/errors"
import { isValidBackupId } from "../lib/ids"
import { ARCHIVE_FILE_NAME, BACKUP_TYPES, BackupSummary, BackupType, METADATA_FILE_NAME } from "../types/backup"
import { typeDir } from "./layout"
import { BackupMetadata, readMetadata, writeMetadata } from "./metadata"
import { existsAsPlainDirectory, resolveBackupDir } from "./safe-path"

export interface BackupStoreOptions {
  /** Return true if the backup is currently being used by a running job. */
  isInUse?: (id: string) => boolean
}

/**
 * Reads/writes backups on disk. metadata.json is the source of truth.
 * Anything inconsistent is reported as `quarantined` (never deleted automatically, never restorable).
 */
export class BackupStore {
  constructor(
    private readonly root: string,
    private readonly options: BackupStoreOptions = {}
  ) {}

  async list(filter: { type?: BackupType; limit?: number } = {}): Promise<BackupSummary[]> {
    const types = filter.type ? [filter.type] : [...BACKUP_TYPES]
    const out: BackupSummary[] = []
    for (const type of types) {
      let names: string[] = []
      try {
        names = await fs.readdir(typeDir(this.root, type))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue
        throw err
      }
      for (const name of names) {
        if (!isValidBackupId(name)) continue // foreign/unknown entries are ignored, never touched
        out.push(await this.summarize(type, name))
      }
    }
    out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id))
    return filter.limit ? out.slice(0, filter.limit) : out
  }

  /** Returns validated metadata or throws NOT_FOUND / CORRUPT_BACKUP. */
  async get(id: string): Promise<BackupMetadata> {
    const { dir } = resolveBackupDir(this.root, id)
    if (!(await existsAsPlainDirectory(dir))) throw new AgentError("NOT_FOUND", "Backup not found")
    let metadata: BackupMetadata
    try {
      metadata = await readMetadata(path.join(dir, METADATA_FILE_NAME))
    } catch {
      throw new AgentError("CORRUPT_BACKUP", "Backup metadata is missing or invalid")
    }
    if (metadata.id !== id) throw new AgentError("CORRUPT_BACKUP", "Backup metadata does not match its folder")
    const problem = await this.archiveProblem(dir, metadata)
    if (problem) throw new AgentError("CORRUPT_BACKUP", problem)
    return metadata
  }

  async exists(id: string): Promise<boolean> {
    const { dir } = resolveBackupDir(this.root, id)
    return existsAsPlainDirectory(dir)
  }

  async setProtected(id: string, value: boolean): Promise<BackupMetadata> {
    const metadata = await this.get(id)
    const { dir } = resolveBackupDir(this.root, id)
    const updated = { ...metadata, protected: value }
    await writeMetadata(path.join(dir, METADATA_FILE_NAME), updated)
    return updated
  }

  /**
   * Deletes a backup. Refuses protected backups, backups in use and the last valid backup.
   * `allowProtected` is only used by retention for `safety` backups (which are protected by default).
   */
  async delete(id: string, opts: { allowProtected?: boolean } = {}): Promise<void> {
    const { dir } = resolveBackupDir(this.root, id)
    if (!(await existsAsPlainDirectory(dir))) throw new AgentError("NOT_FOUND", "Backup not found")
    if (this.options.isInUse?.(id)) throw new AgentError("BUSY", "Backup is in use")
    let metadata: BackupMetadata
    try {
      metadata = await readMetadata(path.join(dir, METADATA_FILE_NAME))
    } catch {
      // unreadable metadata -> quarantined item; deletion requires an explicit human action elsewhere
      throw new AgentError("CORRUPT_BACKUP", "Backup metadata is unreadable; refusing to delete automatically")
    }
    if (metadata.protected && !(opts.allowProtected && metadata.type === "safety")) {
      throw new AgentError("PROTECTED", "Backup is protected")
    }
    if (metadata.status === "completed") {
      const others = (await this.list()).filter((b) => b.id !== id && b.status === "completed")
      if (others.length === 0) throw new AgentError("PROTECTED", "Cannot delete the last valid backup")
    }
    await fs.rm(dir, { recursive: true, force: true })
  }

  /** Best effort: flag a half-deleted backup so it is never restored or counted as valid. */
  async markQuarantined(id: string): Promise<void> {
    const { dir } = resolveBackupDir(this.root, id)
    try {
      const file = path.join(dir, METADATA_FILE_NAME)
      const md = await readMetadata(file)
      await writeMetadata(file, { ...md, status: "quarantined" })
    } catch {
      /* nothing more can be done; listing will report it as quarantined anyway */
    }
  }

  /** Size of the most recent completed backup (used by the disk pre-flight). */
  async lastCompletedSizeBytes(): Promise<number> {
    const completed = (await this.list()).filter((b) => b.status === "completed")
    return completed[0]?.sizeBytes ?? 0
  }

  private async archiveProblem(dir: string, md: BackupMetadata): Promise<string | null> {
    try {
      const st = await fs.stat(path.join(dir, ARCHIVE_FILE_NAME))
      if (st.size !== md.archive.sizeBytes) return "Archive size does not match metadata"
      return null
    } catch {
      return "Archive file is missing"
    }
  }

  private async summarize(type: BackupType, id: string): Promise<BackupSummary> {
    const dir = path.join(typeDir(this.root, type), id)
    const base: BackupSummary = {
      id,
      type,
      status: "quarantined",
      createdAt: null,
      completedAt: null,
      sizeBytes: 0,
      protected: false,
      createdBy: null,
      reason: null,
      problem: null,
    }
    try {
      if (!(await existsAsPlainDirectory(dir))) return { ...base, problem: "Not a plain directory" }
      const md = await readMetadata(path.join(dir, METADATA_FILE_NAME))
      if (md.id !== id || md.type !== type) return { ...base, problem: "Metadata does not match folder" }
      const problem = await this.archiveProblem(dir, md)
      return {
        id,
        type,
        status: problem ? "quarantined" : md.status,
        createdAt: md.createdAt,
        completedAt: md.completedAt ?? null,
        sizeBytes: md.archive.sizeBytes,
        protected: md.protected,
        createdBy: md.createdBy,
        reason: md.reason ?? null,
        problem,
      }
    } catch {
      return { ...base, problem: "Metadata is missing or invalid" }
    }
  }
}

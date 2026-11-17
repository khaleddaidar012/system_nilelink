import { createReadStream, promises as fs } from "node:fs"
import path from "node:path"
import { Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"
import { ARCHIVE_FILE_NAME } from "../types/backup"
import { BackupStore } from "../storage/backup-store"
import { resolveBackupDir } from "../storage/safe-path"
import { sha256File } from "../storage/metadata"

export interface GzipTestResult {
  ok: boolean
  uncompressedBytes: number
  error?: string
}

/** Streams the whole file through gunzip: detects truncation and corruption without needing the database. */
export async function gzipTest(file: string): Promise<GzipTestResult> {
  let bytes = 0
  try {
    await pipeline(
      createReadStream(file),
      createGunzip(),
      new Writable({
        write(chunk: Buffer, _enc, cb) {
          bytes += chunk.length
          cb()
        },
      })
    )
    return { ok: true, uncompressedBytes: bytes }
  } catch (err) {
    return { ok: false, uncompressedBytes: 0, error: err instanceof Error ? err.message : "gzip test failed" }
  }
}

export interface StoredVerification {
  ok: boolean
  problems: string[]
}

/** Re-verifies a stored backup: size, SHA-256 and gzip integrity against its metadata. */
export async function verifyStoredBackup(root: string, store: BackupStore, id: string): Promise<StoredVerification> {
  const problems: string[] = []
  const md = await store.get(id) // throws NOT_FOUND / CORRUPT_BACKUP
  const { dir } = resolveBackupDir(root, id)
  const file = path.join(dir, ARCHIVE_FILE_NAME)

  const st = await fs.stat(file)
  if (st.size !== md.archive.sizeBytes) problems.push("size mismatch")
  if ((await sha256File(file)) !== md.archive.sha256) problems.push("checksum mismatch")
  const gz = await gzipTest(file)
  if (!gz.ok) problems.push("archive is not a valid gzip stream")

  return { ok: problems.length === 0, problems }
}

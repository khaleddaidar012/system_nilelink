import crypto from "node:crypto"
import { createReadStream, promises as fs } from "node:fs"
import { z } from "zod"
import { BACKUP_ID_REGEX } from "../lib/ids"
import { ARCHIVE_FILE_NAME, BACKUP_TYPES } from "../types/backup"

export const MetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(BACKUP_ID_REGEX),
  type: z.enum(BACKUP_TYPES),
  status: z.enum(["completed", "failed", "running", "quarantined"]),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  createdBy: z.object({
    kind: z.enum(["system", "user"]),
    userId: z.string().max(64).optional(),
    email: z.string().max(254).optional(),
  }),
  reason: z.string().max(200).optional(),
  source: z.object({
    database: z.string().max(64),
    /** Human label from config. NEVER a connection string. */
    host: z.string().max(64),
    mongodumpVersion: z.string().max(64).optional(),
  }),
  archive: z.object({
    file: z.literal(ARCHIVE_FILE_NAME),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    compression: z.literal("gzip"),
  }),
  collections: z.array(z.object({ name: z.string().max(128), documents: z.number().int().nonnegative() })),
  verification: z
    .object({
      verifiedAt: z.string(),
      method: z.enum(["gzipTest", "gzipTest+dryRun"]),
      ok: z.boolean(),
    })
    .optional(),
  protected: z.boolean().default(false),
  restoredFrom: z.string().regex(BACKUP_ID_REGEX).optional(),
  importedFrom: z
    .object({
      originalFileName: z.string().max(120),
      uploadedBy: z.string().max(254).optional(),
    })
    .optional(),
  error: z.object({ code: z.string().max(40), message: z.string().max(500) }).optional(),
})

export type BackupMetadata = z.infer<typeof MetadataSchema>

/** Write JSON atomically: temp file in the same folder, then rename. */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 })
  await fs.rename(tmp, filePath)
}

export async function writeMetadata(filePath: string, metadata: BackupMetadata): Promise<void> {
  await writeJsonAtomic(filePath, MetadataSchema.parse(metadata))
}

export async function readMetadata(filePath: string): Promise<BackupMetadata> {
  const raw = await fs.readFile(filePath, "utf8")
  return MetadataSchema.parse(JSON.parse(raw))
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256")
    const stream = createReadStream(filePath)
    stream.on("error", reject)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

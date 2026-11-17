import { z } from "zod"
import { BACKUP_ID_REGEX } from "../lib/ids"
import { BACKUP_TYPES } from "../types/backup"

export const BackupIdSchema = z.string().regex(BACKUP_ID_REGEX)

export const CreateBackupBody = z.object({ reason: z.string().trim().max(200).optional() }).strict()
export const ProtectBody = z.object({ protected: z.boolean() }).strict()
export const RestoreBackupBody = z
  .object({
    targetMode: z.enum(["test", "production"]).default("test"),
    targetDbName: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    confirmPhrase: z.string().optional(),
    acknowledgeDataLoss: z.boolean().optional(),
  })
  .strict()
export const EmptyBody = z.object({}).strict()

export const ListQuery = z.object({
  type: z.enum(BACKUP_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
})

/** Informational only; never used for authorization. */
export const ActorSchema = z.object({ userId: z.string().max(64), email: z.string().max(254) }).strict()

export const MAX_BODY_BYTES = 64 * 1024

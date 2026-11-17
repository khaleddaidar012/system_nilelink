import { promises as fs } from "node:fs"
import { z } from "zod"
import { AgentError } from "./recovery/errors"

const EnvSchema = z
  .object({
    BACKUP_ROOT: z.string().min(1).default("C:\\NileLink\\Backups"),
    AGENT_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    AGENT_BIND: z.string().min(1).default("127.0.0.1"),
    MONGO_TOOLS_DIR: z.string().optional(),
    MONGO_DB_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .default("nilelink"),
    MONGO_SOURCE_LABEL: z.string().max(64).default("mongodb"),
    MONGODB_URI: z.string().optional(),
    MONGO_URI_FILE: z.string().optional(),
    AGENT_HMAC_KEYS: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    DUMP_TIMEOUT_MINUTES: z.coerce.number().positive().default(30),
    MIN_FREE_GB: z.coerce.number().nonnegative().default(1),
    MIN_ARCHIVE_BYTES: z.coerce.number().int().nonnegative().default(1024),
    REQUIRED_COLLECTIONS: z.string().default("users,customers"),
    VERIFY_WITH_DRYRUN: z.enum(["true", "false"]).default("false"),
    RETENTION_AUTOMATIC_COUNT: z.coerce.number().int().positive().default(30),
    RETENTION_SAFETY_MIN_COUNT: z.coerce.number().int().nonnegative().default(3),
    RETENTION_SAFETY_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
    RETENTION_MIN_FREE_GB: z.coerce.number().nonnegative().default(2),
    BACKUP_SCHEDULE_TIME: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24h)")
      .default("21:00"),
    BACKUP_TIMEZONE: z.string().min(1).default("Africa/Cairo"),
    SCHEDULER_ENABLED: z.enum(["true", "false"]).default("true"),
    MISSED_RUN_GRACE_MINUTES: z.coerce.number().int().positive().default(180),
    MAILENABLE_PATH: z.string().optional(),
    MAILENABLE_BADMAIL_PATH: z.string().optional(),
    MAILENABLE_HOST: z.string().default("127.0.0.1"),
    MAILENABLE_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(25),
    MAILENABLE_IMAP_PORT: z.coerce.number().int().min(1).max(65535).default(143),
    MAILENABLE_SMTP_SERVICE: z.string().default("MESMTPCS"),
    MAILENABLE_IMAP_SERVICE: z.string().default("MEIMAPS"),
  })
  .refine((e) => Boolean(e.MONGODB_URI || e.MONGO_URI_FILE), {
    message: "Either MONGODB_URI or MONGO_URI_FILE must be set",
    path: ["MONGODB_URI"],
  })

export interface AgentConfig {
  backupRoot: string
  port: number
  bind: string
  mongoToolsDir?: string
  mongoDb: string
  sourceLabel: string
  logLevel: "debug" | "info" | "warn" | "error"
  dumpTimeoutMs: number
  minFreeBytes: number
  minArchiveBytes: number
  requiredCollections: string[]
  verifyWithDryRun: boolean
  retentionAutomaticCount: number
  retentionSafetyMinCount: number
  retentionSafetyMaxAgeDays: number
  retentionMinFreeBytes: number
  scheduleTime: string
  timezone: string
  schedulerEnabled: boolean
  missedRunGraceMinutes: number
  hmacKeysRaw?: string
  mailEnable: {
    path?: string
    badMailPath?: string
    host: string
    smtpPort: number
    imapPort: number
    smtpService: string
    imapService: string
  }
  /** Reads the connection string on demand. The value is never stored on the config object, logged or returned by any API. */
  getMongoUri(): Promise<string>
}

/**
 * Validates environment configuration and fails fast.
 * Error messages list variable NAMES and rules only, never values.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const cleaned: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.trim() !== "") cleaned[k] = v
  }

  const parsed = EnvSchema.safeParse(cleaned)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    throw new AgentError("CONFIG_INVALID", `Invalid agent configuration -> ${problems.join("; ")}`)
  }
  const e = parsed.data

  return {
    backupRoot: e.BACKUP_ROOT,
    port: e.AGENT_PORT,
    bind: e.AGENT_BIND,
    mongoToolsDir: e.MONGO_TOOLS_DIR,
    mongoDb: e.MONGO_DB_NAME,
    sourceLabel: e.MONGO_SOURCE_LABEL,
    logLevel: e.LOG_LEVEL,
    dumpTimeoutMs: Math.round(e.DUMP_TIMEOUT_MINUTES * 60_000),
    minFreeBytes: Math.round(e.MIN_FREE_GB * 1024 ** 3),
    minArchiveBytes: e.MIN_ARCHIVE_BYTES,
    requiredCollections: e.REQUIRED_COLLECTIONS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    verifyWithDryRun: e.VERIFY_WITH_DRYRUN === "true",
    retentionAutomaticCount: e.RETENTION_AUTOMATIC_COUNT,
    retentionSafetyMinCount: e.RETENTION_SAFETY_MIN_COUNT,
    retentionSafetyMaxAgeDays: e.RETENTION_SAFETY_MAX_AGE_DAYS,
    retentionMinFreeBytes: Math.round(e.RETENTION_MIN_FREE_GB * 1024 ** 3),
    scheduleTime: e.BACKUP_SCHEDULE_TIME,
    timezone: e.BACKUP_TIMEZONE,
    schedulerEnabled: e.SCHEDULER_ENABLED === "true",
    missedRunGraceMinutes: e.MISSED_RUN_GRACE_MINUTES,
    hmacKeysRaw: e.AGENT_HMAC_KEYS,
    mailEnable: {
      path: e.MAILENABLE_PATH,
      badMailPath: e.MAILENABLE_BADMAIL_PATH,
      host: e.MAILENABLE_HOST,
      smtpPort: e.MAILENABLE_SMTP_PORT,
      imapPort: e.MAILENABLE_IMAP_PORT,
      smtpService: e.MAILENABLE_SMTP_SERVICE,
      imapService: e.MAILENABLE_IMAP_SERVICE,
    },
    async getMongoUri() {
      let uri: string | undefined
      if (e.MONGO_URI_FILE) {
        const raw = await fs.readFile(e.MONGO_URI_FILE, "utf8")
        uri = raw.split(/\r?\n/).find((l) => l.trim() !== "")?.trim()
      } else {
        uri = e.MONGODB_URI?.trim()
      }
      if (!uri || !/^mongodb(\+srv)?:\/\//i.test(uri)) {
        throw new AgentError("CONFIG_INVALID", "Mongo connection string is missing or malformed")
      }
      return uri
    },
  }
}

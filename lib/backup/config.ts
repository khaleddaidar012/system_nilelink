/** Resolves the backup agent connection settings. These are Worker secrets: never sent to the browser or logged. */
export interface BackupAgentConfig {
  url: string
  keyId: string
  secret: string
  cfClientId?: string
  cfClientSecret?: string
}

export type BackupConfigValidation =
  | { ok: true; config: BackupAgentConfig }
  | { ok: false; code: string; message: string }

function readEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare")
    const value = getCloudflareContext()?.env?.[name]
    return typeof value === "string" && value ? value : undefined
  } catch {
    return undefined
  }
}

/** Determines whether the endpoint is a local/loopback address (no Cloudflare Access needed). */
export function isLocalEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    return host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0" || host.endsWith(".local")
  } catch {
    return false
  }
}

/** Validates configuration and returns either validated config or a safe error descriptor. */
export function validateBackupAgentConfig(): BackupConfigValidation {
  const url = readEnv("BACKUP_AGENT_URL")
  const keyId = readEnv("BACKUP_AGENT_KEY_ID")
  const secret = readEnv("BACKUP_AGENT_HMAC_SECRET")
  const cfClientId = readEnv("CF_ACCESS_CLIENT_ID")?.trim() || undefined
  const cfClientSecret = readEnv("CF_ACCESS_CLIENT_SECRET")?.trim() || undefined

  if (!url) {
    return { ok: false, code: "BACKUP_NOT_CONFIGURED", message: "Backup agent URL is not configured (missing BACKUP_AGENT_URL)" }
  }
  if (!keyId || !secret) {
    return { ok: false, code: "BACKUP_NOT_CONFIGURED", message: "Backup agent credentials are not configured (missing BACKUP_AGENT_KEY_ID or BACKUP_AGENT_HMAC_SECRET)" }
  }

  if ((cfClientId && !cfClientSecret) || (!cfClientId && cfClientSecret)) {
    return {
      ok: false,
      code: "BACKUP_NOT_CONFIGURED",
      message: "Cloudflare Access credentials are incomplete (both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required)",
    }
  }

  const isLocal = isLocalEndpoint(url)
  if (!isLocal && (!cfClientId || !cfClientSecret)) {
    return {
      ok: false,
      code: "BACKUP_NOT_CONFIGURED",
      message: "Cloudflare Access service token is required for remote backup agent (missing CF_ACCESS_CLIENT_ID or CF_ACCESS_CLIENT_SECRET)",
    }
  }


  return {
    ok: true,
    config: {
      url: url.replace(/\/+$/, ""),
      keyId,
      secret,
      cfClientId,
      cfClientSecret,
    },
  }
}

export function getBackupAgentConfig(): BackupAgentConfig | null {
  const result = validateBackupAgentConfig()
  return result.ok ? result.config : null
}


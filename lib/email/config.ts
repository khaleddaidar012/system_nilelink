import type { EmailConfig } from "./types"
import { CONTACT } from "@/constants/contact"
import { getCloudflareContext } from "@opennextjs/cloudflare"

export function getMessagingEnvironment(): Record<string, string | undefined> {
  let cfEnv: Record<string, string | undefined> = {}
  try {
    cfEnv = getCloudflareContext()?.env as unknown as Record<string, string | undefined> || {}
  } catch {
    // Ignore error if not in Cloudflare environment
  }

  return { ...process.env, ...cfEnv }
}

export function getEmailConfig(): EmailConfig {
  const env = getMessagingEnvironment()
  const provider = (env.EMAIL_PROVIDER as EmailConfig["provider"]) || "resend"

  return {
    enabled: env.EMAIL_DELIVERY_ENABLED === "true",
    provider,
    from: env.EMAIL_FROM || CONTACT.EMAIL,
    to: env.EMAIL_TO || CONTACT.EMAIL,
    replyTo: env.EMAIL_REPLY_TO || env.EMAIL_TO || CONTACT.EMAIL,
    resendApiKey: env.RESEND_API_KEY,
    smtpHost: env.SMTP_HOST || env.EMAIL_SERVER_HOST,
    smtpPort: parseInt(env.SMTP_PORT || env.EMAIL_SERVER_PORT || "587", 10),
    smtpUser: env.SMTP_USER || env.EMAIL_SERVER_USER,
    smtpPass: env.SMTP_PASS || env.EMAIL_SERVER_PASSWORD,
    smtpSecure: env.SMTP_SECURE === "true",
  }
}


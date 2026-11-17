import { getEmailConfig } from "./config"
import { getProvider } from "./providers"
import type { SendEmailOptions } from "./types"

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  await sendEmailWithReceipt(options)
}

export async function sendEmailWithReceipt(options: SendEmailOptions): Promise<string> {
  const config = getEmailConfig()
  const provider = getProvider(config)

  const result = await provider.send({
    to: options.to || config.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    attachments: options.attachments,
    idempotencyKey: options.idempotencyKey,
  })

  if (!result.success) {
    throw new Error(`Email send failed: ${result.error}`)
  }
  if (!result.messageId) throw new Error("Email provider returned no receipt")
  return result.messageId
}

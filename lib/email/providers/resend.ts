import type { EmailConfig, EmailProvider, SendEmailOptions } from "../types"
import { brandedSender, plainTextFromHtml } from "../message"

export function createResendProvider(config: EmailConfig): EmailProvider {
  return {
    name: "resend",

    async send(options: SendEmailOptions) {
      const apiKey = config.resendApiKey || process.env.RESEND_API_KEY

      if (!apiKey) {
        if (process.env.NODE_ENV !== "production") {
          console.log("\n==================================================")
          console.log("[MOCK EMAIL DISPATCH] (No RESEND_API_KEY found)")
          console.log(`To: ${options.to || config.to}`)
          console.log(`Subject: ${options.subject}`)
          console.log("==================================================\n")
          return { success: true, messageId: "mock-id-dev" }
        }
        return { success: false, error: "RESEND_API_KEY is not configured" }
      }

      const payload: Record<string, any> = {
        from: brandedSender(config.from),
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text || plainTextFromHtml(options.html),
        reply_to: options.replyTo || config.replyTo,
        headers: { "X-Mailer": "NileLink Logistics" },
      }

      if (options.attachments && options.attachments.length > 0) {
        payload.attachments = options.attachments.map((att) => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content.toString("base64") : att.content,
        }))
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        await response.arrayBuffer()
        return {
          success: false,
          error: `Resend API rejected the request (${response.status})`,
        }
      }

      const data = (await response.json()) as { id?: string }
      if (!data.id) return { success: false, error: "Email provider returned no receipt" }
      return { success: true, messageId: data.id }
    },
  }
}

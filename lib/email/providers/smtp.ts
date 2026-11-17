import nodemailer from "nodemailer"
import type { EmailConfig, EmailProvider, SendEmailOptions } from "../types"
import { brandedSender, plainTextFromHtml } from "../message"

export function createSmtpProvider(config: EmailConfig): EmailProvider {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  })

  return {
    name: "smtp",

    async send(options: SendEmailOptions) {
      const info = await transporter.sendMail({
        from: brandedSender(config.from),
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || plainTextFromHtml(options.html),
        replyTo: options.replyTo || config.replyTo,
        headers: { "X-Mailer": "NileLink Logistics" },
        attachments: options.attachments,
      })

      console.log(`[SMTP SENT]: To=${options.to}, MessageId=${info.messageId}, Accepted=${JSON.stringify(info.accepted)}, Response=${info.response}`)
      return { success: true, messageId: info.messageId }
    },
  }
}

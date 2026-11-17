export interface EmailConfig {
  enabled?: boolean
  provider: "smtp" | "resend" | "ses"
  from: string
  to: string
  replyTo?: string
  resendApiKey?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  smtpSecure?: boolean
}

export interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: EmailAttachment[]
  idempotencyKey?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface EmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>
  name: string
}

export interface QuoteFormData {
  firstName: string
  lastName: string
  company?: string
  email: string
  phone: string
  freightType: "air" | "road" | "ocean"
  weight?: string
  quantity?: string
  from: string
  to: string
  notes?: string
}

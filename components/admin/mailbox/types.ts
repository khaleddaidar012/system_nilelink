export interface MailboxStatus { available: boolean; connected: boolean; email: string | null; employeeName: string | null; unread: number; needsServerSetup: boolean }
export interface MailAddress { name: string; address: string }
export interface MailSummary { uid: number; subject: string; from: MailAddress[]; to: MailAddress[]; date: string | null; seen: boolean; size: number }
export interface MailMessage extends MailSummary { text: string; html?: string; replyTo: MailAddress[]; attachments: { index: number; name: string; size: number; contentType: string }[] }
export interface MailFolder { path: string; name: string; specialUse: string | null }
export interface MailListing { messages: MailSummary[]; folders: MailFolder[]; folder: string; uidValidity: string; hasMore: boolean; unread: number }
export const MAILBOX_REFRESH_EVENT = "nilelink:mailbox-updated"

/** Shared multipart content for transactional messages; never add marketing opt-out headers to OTP mail. */
export function plainTextFromHtml(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(?:p|div|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim()
}

export function brandedSender(sender: string): string {
  if (/[\r\n]/.test(sender)) throw new Error("Invalid email sender")
  return sender.includes("<") ? sender : `NileLink Logistics <${sender}>`
}

export function senderAddress(sender: string): string {
  return sender.match(/<([^<>]+)>$/)?.[1] || sender
}

import type { SendOtpOptions, DispatchResult } from "./otp-service"
import { getEmailConfig, getMessagingEnvironment } from "../email/config"
import { sendEmailWithReceipt } from "../email/send"
const escape = (value: string) => value.replace(/[&<>"']/g, item => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[item]!)

/** Never claim success after a provider failure or expose security codes in production logs. */
export async function dispatchOtpNotification({ to, channel, code, purpose, recipientName = "NileLink Client" }: SendOtpOptions): Promise<DispatchResult> {
  const base = { channel, recipient: to, code, dispatchedAt: new Date() }
  try {
    if (channel === "email") {
      const config = getEmailConfig()
      if (!config.resendApiKey && !config.smtpHost) throw new Error("Email provider is not configured")
      await sendEmailWithReceipt({ to, subject: purpose === "password_reset" ? "NileLink — Password reset code" : "NileLink — Email verification code",
        html: `<div><h2>NileLink Security</h2><p>Hello ${escape(recipientName)},</p><p>Your verification code is <strong>${escape(code)}</strong>.</p><p>Expires in 10 minutes. Do not share this code.</p></div>` })
    } else {
      const env = getMessagingEnvironment()
      const token = env.WHATSAPP_API_TOKEN, phoneId = env.WHATSAPP_PHONE_NUMBER_ID
      const template = env.WHATSAPP_OTP_TEMPLATE, version = env.WHATSAPP_GRAPH_VERSION
      if (!token || /your_|placeholder/i.test(token) || !/^\d+$/.test(phoneId || "") || !template || !/^v\d+\.\d+$/.test(version || "")) throw new Error("WhatsApp authentication template is not configured")
      const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "template", template: {
          name: template, language: { code: env.WHATSAPP_OTP_LANGUAGE || "en_US" }, components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        } }),
      })
      if (!response.ok) throw new Error("WhatsApp provider rejected the request")
      const receipt = await response.json() as { messages?: { id?: string }[] }
      if (!receipt.messages?.[0]?.id) throw new Error("WhatsApp provider returned no receipt")
    }
    return { ...base, success: true }
  } catch {
    return { ...base, success: false, error: channel === "email" ? "Email could not be sent" : "WhatsApp could not be sent" }
  }
}

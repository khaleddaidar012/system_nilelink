import { sendEmailWithReceipt } from "../email/send"
import { liveEmailConfigured } from "../email/readiness"
import type { DeliveryTransport } from "./delivery-worker"

export const liveEmailTransport: DeliveryTransport = {
  mode: "live",
  async deliver(message, key) {
    if (!liveEmailConfigured()) throw new Error("Email delivery is not configured")
    const receiptId = await sendEmailWithReceipt({
      to: message.to, subject: message.subject, html: message.html, idempotencyKey: key,
      attachments: [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.contentBase64, "base64"), contentType: message.attachment.contentType }],
    })
    return { receiptId }
  },
}

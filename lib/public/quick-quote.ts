import {quickQuoteSchema} from "@/types/quick-quote"

type Message = {subject: string; html: string; text: string; idempotencyKey: string}
type Delivery = (message: Message) => Promise<string>
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character]!))
const json = (body: unknown, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}})

// Delivery is injected so contract tests never contact a real email provider.
export function createQuickQuoteHandler(deliver: Delivery) {
  return async function POST(request: Request) {
    try {
      const key = request.headers.get("Idempotency-Key") || ""
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)) return json({success: false, code: "INVALID_REQUEST"}, 400)
      if (Number(request.headers.get("content-length")) > 4096) return json({success: false, code: "INVALID_REQUEST"}, 413)
      const raw = await request.text()
      if (raw.length > 4096) return json({success: false, code: "INVALID_REQUEST"}, 413)
      let body: unknown
      try { body = JSON.parse(raw) } catch { return json({success: false, code: "INVALID_REQUEST"}, 400) }
      const parsed = quickQuoteSchema.safeParse(body)
      if (!parsed.success) return json({success: false, code: "VALIDATION_FAILED", fields: [...new Set(parsed.error.issues.map(issue => issue.path[0]).filter(Boolean))]}, 400)
      const data = parsed.data
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)))
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
      const rows = [["Origin", data.from], ["Destination", data.to], ["Shipment type", data.shipmentType], ["Phone", data.phone]]
      const text = "NileLink — Quick quote inquiry\nPlease contact the requester by phone.\n\n" + rows.map(([label, value]) => `${label}: ${value}`).join("\n")
      const receipt = await deliver({
        subject: "NileLink — New quick quote inquiry",
        text,
        html: `<h1>NileLink — Quick quote inquiry</h1><p>Please contact the requester by phone.</p><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join("")}</dl>`,
        idempotencyKey: `quick-quote-${key}-${fingerprint}`,
      })
      if (!receipt || receipt.startsWith("mock-")) throw new Error("No delivery receipt")
      return json({success: true}, 200)
    } catch {
      return json({success: false, code: "DELIVERY_UNAVAILABLE"}, 503)
    }
  }
}

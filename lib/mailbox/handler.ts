import { z } from "zod"
import { getD1, type D1Binding } from "../db/d1"
import { getSessionFromRequest } from "../auth/token-service"
import { getMessagingEnvironment } from "../email/config"
import { callMailboxAgent, mailboxConfigured, MailboxApiError, type MailboxEnvironment } from "./gateway"
import { sealMailboxPassword, openMailboxPassword, type SealedMailboxPassword } from "./security"
import { checkRateLimit } from "../auth/rate-limiter"
import { WorkflowStore, WorkflowError } from "../workflows/runtime"
import type { StoredUser } from "../db/repositories/users"

interface Profile { email: string; password: SealedMailboxPassword; connectedAt: string }
interface MailboxUser extends StoredUser { mailbox?: Profile }
interface Overrides { db?: D1Binding; session?: { userId: string; tokenType?: string } | null; env?: MailboxEnvironment; gateway?: typeof callMailboxAgent }
const refSchema = z.object({ folder: z.string().min(1).max(200), uid: z.coerce.number().int().positive(), uidValidity: z.string().regex(/^\d+$/) }).strict()
const address = z.email().max(254).refine(value => !/[\r\n]/.test(value))
const sendSchema = z.object({ action: z.literal("send"), requestId: z.uuid(), to: z.array(address).min(1).max(20), cc: z.array(address).max(20).default([]), subject: z.string().max(250).refine(v => !/[\r\n]/.test(v)), text: z.string().max(100000), quote: z.string().max(100000).optional(), includeSignature: z.boolean().default(false), reply: refSchema.optional(), attachments: z.array(z.object({ name: z.string().min(1).max(180).refine(v => !/[\r\n/\\]/.test(v)), contentType: z.string().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/), base64: z.string().max(7000000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict()).max(5).default([]) }).strict().superRefine((value, context) => {
  const fullTextLength = value.text.length + (value.quote?.length || 0) + (value.includeSignature ? 600 : 0)
  if (!value.text.trim() && !value.quote?.trim() && !value.includeSignature) context.addIssue({ code: "custom", message: "Message cannot be empty", path: ["text"] })
  if (fullTextLength > 100000) context.addIssue({ code: "custom", message: "Message is too long", path: ["text"] })
})
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
function fail(code: string, status: number): never { throw new MailboxApiError(code, status) }
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => HTML_ESCAPES[character])
const plainToHtml = (value: string) => `<div dir="auto" style="font:14px/1.6 Arial,sans-serif;color:#172033;white-space:normal">${escapeHtml(value).replace(/\r?\n/g, "<br>")}</div>`
function employeeSignature(user: MailboxUser, email: string) {
  const name = [user.firstName, user.lastName].map(value => String(value || "").trim()).filter(Boolean).join(" ") || email.split("@")[0]
  const safeName = escapeHtml(name), safeEmail = escapeHtml(email)
  const text = `${name}\n${email}\nNile Link Logistics Services\nhttps://nilelinklogistics.com\nFacebook: https://www.facebook.com/nilelinklogistic`
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-collapse:collapse;font-family:Arial,sans-serif;color:#172033"><tr><td style="border-left:4px solid #0786c9;padding:2px 0 2px 14px"><div style="font-size:16px;font-weight:700;color:#102a43">${safeName}</div><div style="margin-top:3px;font-size:13px;color:#52647a">${safeEmail}</div><div style="margin-top:9px;font-size:14px;font-weight:700;color:#0786c9">Nile Link Logistics Services</div><div style="margin-top:4px;font-size:13px"><a href="https://nilelinklogistics.com" style="color:#0786c9;text-decoration:none">nilelinklogistics.com</a><span style="color:#9aa7b5">&nbsp; | &nbsp;</span><a href="https://www.facebook.com/nilelinklogistic" style="color:#0786c9;text-decoration:none">Facebook</a></div></td></tr></table>`
  return { text, html }
}

/** Own mailbox only: no userId/account selector is accepted from the browser. */
export async function handleMailboxRequest(request: Request, overrides: Overrides = {}): Promise<Response> {
  try {
    const url = new URL(request.url)
    if (!["GET", "POST"].includes(request.method)) return json({ error: "METHOD_NOT_ALLOWED" }, 405)
    if (request.method === "POST" && request.headers.get("origin") !== url.origin) return json({ error: "INVALID_ORIGIN" }, 403)
    const session = overrides.session !== undefined ? overrides.session : await getSessionFromRequest(request)
    if (!session || session.tokenType !== "access") return json({ error: "AUTHENTICATION_REQUIRED" }, 401)
    const db = overrides.db || await getD1()
    const row = await db.prepare("SELECT data,revision FROM users WHERE id=?").bind(session.userId).first<{ data: string; revision: number }>()
    if (!row) return json({ error: "AUTHENTICATION_REQUIRED" }, 401)
    const user: MailboxUser = JSON.parse(row.data)
    if (user.status !== "active") return json({ error: "AUTHENTICATION_REQUIRED" }, 401)
    if (!["staff", "super_admin"].includes(user.role)) return json({ error: "STAFF_REQUIRED" }, 403)
    if (!checkRateLimit(`mailbox:${user._id}`, { windowMs: 60000, maxAttempts: 90 }).allowed) return json({ error: "RATE_LIMIT" }, 429)
    const env = overrides.env || getMessagingEnvironment(), available = mailboxConfigured(env)
    const gateway = overrides.gateway || callMailboxAgent
    let input: Record<string, unknown> = {}
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length")) > 8 * 1024 * 1024) fail("PAYLOAD_TOO_LARGE", 413)
      const text = await request.text()
      if (new TextEncoder().encode(text).length > 8 * 1024 * 1024) fail("PAYLOAD_TOO_LARGE", 413)
      try { input = JSON.parse(text) } catch { fail("INVALID_REQUEST", 400) }
      if (!input || Array.isArray(input) || typeof input !== "object") fail("INVALID_REQUEST", 400)
    }
    const action = request.method === "GET" ? url.searchParams.get("action") || "status" : String(input.action || "")
    if (request.method === "GET" && ["connect", "disconnect", "read", "send"].includes(action)) fail("METHOD_NOT_ALLOWED", 405)
    if (request.method === "POST" && !["connect", "disconnect", "read", "send"].includes(action)) fail("INVALID_REQUEST", 400)
    const update = async (mailbox?: Profile) => {
      const store = new WorkflowStore(db)
      store.activity = { user, action: `mailbox-${action}` }
      await store.commit({ updates: [{ before: { table: "users", id: user._id, revision: row.revision, data: user }, patch: { mailbox } }] })
    }
    if (action === "disconnect") {
      if (!z.object({ action: z.literal("disconnect") }).strict().safeParse(input).success) fail("INVALID_REQUEST", 400)
      await update(); return json({ success: true, connected: false })
    }
    const employeeName = [user.firstName, user.lastName].map(value => String(value || "").trim()).filter(Boolean).join(" ") || null
    if (action === "status" && (!available || !user.mailbox)) return json({ available, connected: !!user.mailbox, email: user.mailbox?.email || null, employeeName, unread: 0, needsServerSetup: !available })
    if (!available) fail("MAILBOX_NOT_CONFIGURED", 503)
    if (action === "connect") {
      const parsed = z.object({ action: z.literal("connect"), email: address, password: z.string().min(1).max(512) }).strict().safeParse(input)
      if (!parsed.success) fail("INVALID_REQUEST", 400)
      const email = parsed.data.email.toLowerCase()
      if (email.split("@")[1] !== "nilelinklogistics.com") fail("DOMAIN_NOT_ALLOWED", 400)
      await gateway(env, { action, actorId: user._id, email, password: parsed.data.password })
      const password = await sealMailboxPassword(parsed.data.password, user._id, email, env.MAILBOX_ENCRYPTION_KEY!)
      await update({ email, password, connectedAt: new Date().toISOString() })
      return json({ success: true, connected: true, email })
    }
    if (!user.mailbox) fail("MAILBOX_NOT_CONNECTED", 409)
    const credentials = { actorId: user._id, email: user.mailbox.email, password: await openMailboxPassword(user.mailbox.password, user._id, user.mailbox.email, env.MAILBOX_ENCRYPTION_KEY!) }
    let payload: Record<string, unknown>
    if (action === "status") payload = { action }
    else if (action === "list") {
      const parsed = z.object({ folder: z.string().min(1).max(200), page: z.coerce.number().int().min(0).max(1000) }).safeParse({ folder: url.searchParams.get("folder") || "INBOX", page: url.searchParams.get("page") || 0 })
      if (!parsed.success) fail("INVALID_REQUEST", 400)
      payload = { action, ...parsed.data }
    } else if (["message", "attachment", "read"].includes(action)) {
      const raw = action === "read" ? { folder: input.folder, uid: input.uid, uidValidity: input.uidValidity } : { folder: url.searchParams.get("folder"), uid: url.searchParams.get("uid"), uidValidity: url.searchParams.get("uidValidity") }
      const parsed = refSchema.safeParse(raw); if (!parsed.success) fail("INVALID_REQUEST", 400)
      if (action === "read" && Object.keys(input).some(k => !["action", "folder", "uid", "uidValidity"].includes(k))) fail("INVALID_REQUEST", 400)
      payload = { action, ...parsed.data }
      if (action === "attachment") { const index = z.coerce.number().int().min(0).max(100).safeParse(url.searchParams.get("index")); if (!index.success) fail("INVALID_REQUEST", 400); payload.index = index.data }
    } else if (action === "send") {
      const parsed = sendSchema.safeParse(input); if (!parsed.success) fail("INVALID_REQUEST", 400)
      if (parsed.data.attachments.reduce((n, a) => n + Buffer.byteLength(a.base64, "base64"), 0) > 5 * 1024 * 1024) fail("ATTACHMENTS_TOO_LARGE", 413)
      const signature = parsed.data.includeSignature ? employeeSignature(user, user.mailbox.email) : null
      const text = [parsed.data.text.trim(), signature?.text, parsed.data.quote?.trim()].filter(Boolean).join("\n\n")
      const html = [parsed.data.text.trim() ? plainToHtml(parsed.data.text.trim()) : "", signature?.html || "", parsed.data.quote?.trim() ? `<blockquote style="margin:18px 0 0;border-left:2px solid #cbd5e1;padding:4px 0 4px 14px;color:#52647a">${plainToHtml(parsed.data.quote.trim())}</blockquote>` : ""].filter(Boolean).join("")
      payload = { ...parsed.data, text, ...(signature ? { html } : {}) }
      delete payload.quote
      delete payload.includeSignature
    } else fail("INVALID_REQUEST", 400)
    const result = await gateway<Record<string, unknown>>(env, { ...payload!, ...credentials })
    if (action === "status") return json({ available: true, connected: true, email: user.mailbox.email, employeeName, unread: result.unread, needsServerSetup: false })
    if (action === "attachment") {
      if (typeof result.base64 !== "string" || result.base64.length > 7000000 || typeof result.filename !== "string") fail("INVALID_AGENT_RESPONSE", 502)
      const name = result.filename.replace(/[\r\n/\\\x00-\x1f]/g, "_").slice(0, 180)
      return new Response(Buffer.from(result.base64, "base64"), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" } })
    }
    return json({ success: true, ...result })
  } catch (error) {
    if (error instanceof WorkflowError && error.status === 409) return json({ error: "ACCOUNT_CHANGED" }, 409)
    if (error instanceof MailboxApiError) return json({ error: error.code }, error.status)
    return json({ error: "MAILBOX_UNAVAILABLE" }, 502)
  }
}

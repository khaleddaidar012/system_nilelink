import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import { simpleParser } from 'mailparser'
import { z } from 'zod'

const address = z.email().max(254).refine(value => !/[\r\n]/.test(value))
const messageRef = { folder: z.string().min(1).max(200), uid: z.number().int().positive(), uidValidity: z.string().regex(/^\d+$/) }
const common = { actorId: z.string().regex(/^[a-f0-9]{24}$/), email: address, password: z.string().min(1).max(512) }
const schemas = {
  connect: z.object({ ...common, action: z.literal('connect') }).strict(),
  status: z.object({ ...common, action: z.literal('status') }).strict(),
  list: z.object({ ...common, action: z.literal('list'), folder: z.string().min(1).max(200), page: z.number().int().min(0).max(1000).default(0) }).strict(),
  message: z.object({ ...common, ...messageRef, action: z.literal('message') }).strict(),
  read: z.object({ ...common, ...messageRef, action: z.literal('read') }).strict(),
  attachment: z.object({ ...common, ...messageRef, action: z.literal('attachment'), index: z.number().int().min(0).max(100) }).strict(),
  send: z.object({ ...common, action: z.literal('send'), requestId: z.uuid(), to: z.array(address).min(1).max(20), cc: z.array(address).max(20).default([]), subject: z.string().max(250).refine(v => !/[\r\n]/.test(v)), text: z.string().min(1).max(100000), html: z.string().max(2000000).optional(), reply: z.object(messageRef).strict().optional(), attachments: z.array(z.object({ name: z.string().min(1).max(180).refine(v => !/[\r\n/\\]/.test(v)), contentType: z.string().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/), base64: z.string().max(7000000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict()).max(5).default([]) }).strict(),
}
export class MailboxError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status } }
const cleanFilename = value => (value || 'attachment').replace(/[\r\n/\\\x00-\x1f]/g, '_').slice(0, 180)
const addresses = values => (values || []).map(v => ({ name: v.name || '', address: v.address || '' }))
const summary = message => ({ uid: message.uid, subject: message.envelope?.subject || '', from: addresses(message.envelope?.from), to: addresses(message.envelope?.to), date: message.envelope?.date?.toISOString() || null, seen: message.flags?.has('\\Seen') || false, size: message.size || 0 })

export function createMailboxService(config, overrides = {}) {
  const imapFactory = overrides.imapFactory || (options => new ImapFlow(options))
  const smtpFactory = overrides.smtpFactory || (options => nodemailer.createTransport(options))
  const compose = overrides.compose || (options => new MailComposer(options).compile().build())
  const smtpOptions = input => ({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure !== false, requireTLS: config.smtpSecure === false, auth: { user: config.authUsernameFormat === 'local-part' ? input.email.split('@')[0] : input.email, pass: input.password }, tls: { rejectUnauthorized: true, ...(config.tlsServerName ? { servername: config.tlsServerName } : {}) }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true })
  async function withImap(input, callback) {
    const client = imapFactory({ host: config.imapHost, port: config.imapPort, secure: true, auth: { user: config.authUsernameFormat === 'local-part' ? input.email.split('@')[0] : input.email, pass: input.password }, tls: { rejectUnauthorized: true, ...(config.tlsServerName ? { servername: config.tlsServerName } : {}) }, logger: false, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 })
    try { await client.connect(); return await callback(client) } finally { await client.logout().catch(() => client.close()) }
  }
  async function mailbox(client, input) {
    await client.mailboxOpen(input.folder)
    if (input.uidValidity && String(client.mailbox.uidValidity) !== input.uidValidity) throw new MailboxError('MAILBOX_CHANGED', 409)
  }
  async function parsedMessage(client, input) {
    await mailbox(client, input)
    const meta = await client.fetchOne(input.uid, { size: true }, { uid: true })
    if (!meta) throw new MailboxError('MESSAGE_NOT_FOUND', 404)
    if (meta.size > 8 * 1024 * 1024) throw new MailboxError('MESSAGE_TOO_LARGE', 413)
    const message = await client.fetchOne(input.uid, { source: true, envelope: true, flags: true, size: true }, { uid: true })
    if (!message?.source) throw new MailboxError('MESSAGE_NOT_FOUND', 404)
    const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: 2 * 1024 * 1024 })
    return { message, parsed }
  }
  function htmlContent(parsed) {
    if (!parsed.html || typeof parsed.html !== 'string') return ''
    let budget = 2 * 1024 * 1024
    const related = new Map()
    for (const item of parsed.attachments || []) {
      if (!item.contentId || !item.content?.length || item.content.length > budget) continue
      related.set(String(item.contentId).replace(/^<|>$/g, '').toLowerCase(), `data:${item.contentType || 'application/octet-stream'};base64,${item.content.toString('base64')}`)
      budget -= item.content.length
    }
    return parsed.html.slice(0, 2 * 1024 * 1024).replace(/cid:([^\s"'<>]+)/gi, (whole, id) => {
      let decoded = id
      try { decoded = decodeURIComponent(id) } catch { /* Invalid escapes are treated as an unavailable inline image. */ }
      return related.get(decoded.replace(/^<|>$/g, '').toLowerCase()) || 'about:blank'
    })
  }
  async function send(input) {
    const bytes = input.attachments.reduce((n, item) => n + Buffer.byteLength(item.base64, 'base64'), 0)
    if (bytes > 5 * 1024 * 1024) throw new MailboxError('ATTACHMENTS_TOO_LARGE', 413)
    const directory = path.join(config.stateDirectory, createHash('sha256').update(input.actorId).digest('hex'))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const filename = path.join(directory, input.requestId + '.json')
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...input, password: undefined })).digest('hex')
    try {
      const previous = JSON.parse(await readFile(filename, 'utf8'))
      if (previous.fingerprint !== fingerprint) throw new MailboxError('REQUEST_CONFLICT', 409)
      if (previous.state === 'accepted') return previous.result
      throw new MailboxError('SEND_OUTCOME_UNKNOWN', 409)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    let inReplyTo, references
    if (input.reply) await withImap(input, async client => {
      const { parsed } = await parsedMessage(client, input.reply)
      inReplyTo = parsed.messageId; references = [...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []), ...(inReplyTo ? [inReplyTo] : [])].slice(-20)
    })
    const raw = await compose({ from: input.email, to: input.to, cc: input.cc, subject: input.subject, text: input.text, ...(input.html ? { html: input.html } : {}), ...(inReplyTo ? { inReplyTo, references } : {}), attachments: input.attachments.map(a => ({ filename: a.name, contentType: a.contentType, content: Buffer.from(a.base64, 'base64') })), disableFileAccess: true, disableUrlAccess: true })
    try { await writeFile(filename, JSON.stringify({ fingerprint, state: 'pending', createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }) }
    catch (error) { if (error.code === 'EEXIST') throw new MailboxError('SEND_OUTCOME_UNKNOWN', 409); throw error }
    const transport = smtpFactory(smtpOptions(input))
    let result
    try {
      const sent = await transport.sendMail({ raw, envelope: { from: input.email, to: [...input.to, ...input.cc] } })
      if (!sent.accepted?.length) throw new MailboxError('SEND_REJECTED', 502)
      result = { accepted: true, messageId: sent.messageId || '', sentCopySaved: false, partialDelivery: (sent.rejected?.length || 0) > 0 }
      // Persist acceptance before saving Sent, so a failed copy can never resend SMTP.
      await writeFile(filename, JSON.stringify({ fingerprint, state: 'accepted', result }), { mode: 0o600 })
    } catch (error) {
      await writeFile(filename, JSON.stringify({ fingerprint, state: 'uncertain' }), { mode: 0o600 }).catch(() => {})
      throw new MailboxError(error.code === 'SEND_REJECTED' ? 'SEND_REJECTED' : 'SEND_OUTCOME_UNKNOWN', 502)
    } finally { transport.close() }
    try {
      await withImap(input, async client => {
        const folders = await client.list()
        let sent = folders.find(f => f.specialUse === '\\Sent')?.path || folders.find(f => /^(sent|sent items)$/i.test(f.path))?.path
        if (!sent) { sent = 'Sent Items'; await client.mailboxCreate(sent) }
        await client.append(sent, raw, ['\\Seen'])
      })
      result.sentCopySaved = true
      await writeFile(filename, JSON.stringify({ fingerprint, state: 'accepted', result }), { mode: 0o600 })
    } catch { /* SMTP already accepted: report copy warning, never send again. */ }
    return result
  }
  return async raw => {
    const input = schemas[raw?.action]?.safeParse(raw)
    if (!input?.success) throw new MailboxError('INVALID_REQUEST')
    const value = input.data
    if (value.email.split('@')[1].toLowerCase() !== config.allowedDomain.toLowerCase()) throw new MailboxError('DOMAIN_NOT_ALLOWED', 403)
    if (value.action === 'send') return send(value)
    if (value.action === 'connect') {
      await withImap(value, async () => {})
      const transport = smtpFactory(smtpOptions(value)); try { await transport.verify() } finally { transport.close() }
      return { connected: true }
    }
    return withImap(value, async client => {
      if (value.action === 'status') {
        const status = await client.status('INBOX', { unseen: true })
        return { unread: status.unseen || 0 }
      }
      if (value.action === 'list') {
        const folders = (await client.list()).filter(f => !f.flags?.has('\\Noselect')).map(f => ({ path: f.path, name: f.name, specialUse: f.specialUse || null }))
        await mailbox(client, value)
        const end = client.mailbox.exists - value.page * 30, start = Math.max(1, end - 29)
        const messages = end > 0 ? await client.fetchAll(`${start}:${end}`, { envelope: true, flags: true, size: true }) : []
        const status = await client.status('INBOX', { unseen: true })
        return { messages: messages.map(summary).reverse(), folders, folder: value.folder, uidValidity: String(client.mailbox.uidValidity), hasMore: start > 1, unread: status.unseen || 0 }
      }
      if (value.action === 'read') {
        await mailbox(client, value)
        if (!await client.fetchOne(value.uid, { uid: true }, { uid: true })) throw new MailboxError('MESSAGE_NOT_FOUND', 404)
        await client.messageFlagsAdd(value.uid, ['\\Seen'], { uid: true })
        return { read: true, unread: (await client.status('INBOX', { unseen: true })).unseen || 0 }
      }
      const { message, parsed } = await parsedMessage(client, value)
      if (value.action === 'attachment') {
        const attachment = parsed.attachments[value.index]
        if (!attachment) throw new MailboxError('ATTACHMENT_NOT_FOUND', 404)
        if (attachment.size > 5 * 1024 * 1024) throw new MailboxError('ATTACHMENTS_TOO_LARGE', 413)
        return { filename: cleanFilename(attachment.filename), contentType: attachment.contentType, base64: attachment.content.toString('base64') }
      }
      return { ...summary(message), text: (parsed.text || '').slice(0, 200000), html: htmlContent(parsed), replyTo: addresses(parsed.replyTo?.value || parsed.from?.value), attachments: parsed.attachments.map((a, index) => ({ index, name: cleanFilename(a.filename), size: a.size, contentType: a.contentType })) }
    })
  }
}

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { verifyMailboxRequest } from './protocol.mjs'
import { createMailboxService, MailboxError } from './service.mjs'

export function createMailAgentServer(config, service = createMailboxService(config)) {
  const nonces = new Map(), rates = new Map()
  let active = 0
  return http.createServer(async (req, res) => {
    const respond = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)) }
    if (req.method !== 'POST' || req.url !== '/mailbox') return respond(404, { ok: false, error: { code: 'NOT_FOUND' } })
    if (active >= 8) return respond(429, { ok: false, error: { code: 'BUSY' } })
    active++
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new MailboxError('PAYLOAD_TOO_LARGE', 413); chunks.push(chunk) }
      const body = Buffer.concat(chunks).toString('utf8')
      if (!verifyMailboxRequest(config.hmacKey, req.headers, body, nonces)) return respond(401, { ok: false, error: { code: 'UNAUTHORIZED' } })
      let input; try { input = JSON.parse(body) } catch { throw new MailboxError('INVALID_REQUEST') }
      if (!/^[a-f0-9]{24}$/.test(input.actorId || '')) throw new MailboxError('INVALID_REQUEST')
      const now = Date.now(), rate = rates.get(input.actorId)
      if (rate && rate.until > now && rate.count >= 90) throw new MailboxError('RATE_LIMIT', 429)
      for (const [id, value] of rates) if (value.until <= now) rates.delete(id)
      rates.set(input.actorId, rate?.until > now ? { ...rate, count: rate.count + 1 } : { count: 1, until: now + 60000 })
      const data = await service(input)
      respond(200, { ok: true, data })
    } catch (error) {
      // Raw IMAP/SMTP errors can include credentials or message contents: never log or return them.
      respond(error instanceof MailboxError ? error.status : 502, { ok: false, error: { code: error instanceof MailboxError ? error.code : 'MAIL_SERVER_UNAVAILABLE' } })
    } finally { active-- }
  })
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
  const configPath = process.env.MAIL_AGENT_CONFIG || path.join(path.dirname(fileURLToPath(import.meta.url)), 'agent.config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(config.hmacKey || '') || !config.imapHost || !config.smtpHost || !config.allowedDomain || !config.stateDirectory || ![465, 587].includes(config.smtpPort) || config.imapPort !== 993) throw Error('Invalid mail agent configuration')
  const server = createMailAgentServer(config)
  server.requestTimeout = 45000; server.headersTimeout = 10000
  server.listen(config.port || 8791, '127.0.0.1', () => console.log('NileLink Mail Agent ready on loopback.'))
  } catch { console.error('Mail Agent startup failed. Check the restricted configuration file and service permissions.'); process.exitCode = 1 }
}

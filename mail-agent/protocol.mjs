import { createHmac, timingSafeEqual } from 'node:crypto'
export const signMailboxRequest = (key, time, nonce, body) => createHmac('sha256', Buffer.from(key, 'hex')).update(`POST\n/mailbox\n${time}\n${nonce}\n${body}`).digest('hex')
export function verifyMailboxRequest(key, headers, body, nonces, now = Date.now()) {
  const time = headers['x-nl-mail-time'], nonce = headers['x-nl-mail-nonce'], signature = headers['x-nl-mail-signature']
  if (!/^\d{13}$/.test(time || '') || !/^[a-f0-9-]{36}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '') || Math.abs(now - Number(time)) > 60000) return false
  const expected = signMailboxRequest(key, time, nonce, body)
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return false
  for (const [value, expiry] of nonces) if (expiry <= now) nonces.delete(value)
  if (nonces.has(nonce) || nonces.size > 10000) return false
  nonces.set(nonce, now + 120000)
  return true
}

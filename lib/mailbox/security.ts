import { randomBytes } from "node:crypto"
export interface SealedMailboxPassword { version: 1; iv: string; ciphertext: string }
function key(hex: string) {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("Mailbox encryption is not configured")
  return crypto.subtle.importKey("raw", Buffer.from(hex, "hex"), "AES-GCM", false, ["encrypt", "decrypt"])
}
export async function sealMailboxPassword(password: string, ownerId: string, email: string, hex: string): Promise<SealedMailboxPassword> {
  const iv = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`nilelink-mailbox-v1:${ownerId}:${email}`) }, await key(hex), new TextEncoder().encode(password))
  return { version: 1, iv: iv.toString("base64"), ciphertext: Buffer.from(ciphertext).toString("base64") }
}
export async function openMailboxPassword(value: SealedMailboxPassword, ownerId: string, email: string, hex: string): Promise<string> {
  if (value.version !== 1 || typeof value.iv !== "string" || typeof value.ciphertext !== "string") throw Error("Invalid mailbox credential")
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(value.iv, "base64"), additionalData: new TextEncoder().encode(`nilelink-mailbox-v1:${ownerId}:${email}`) }, await key(hex), Buffer.from(value.ciphertext, "base64"))
  return new TextDecoder().decode(bytes)
}

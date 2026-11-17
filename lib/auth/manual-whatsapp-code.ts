/** Business-requested manual code. Predictable; does not prove phone possession.
 * Only for WhatsApp account acknowledgement, never email or password recovery. */
export function manualWhatsappCode(phone: string): string | null {
  const digits = phone.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/\D/g, "")
  if (digits.length < 6) return null
  return String(Number(digits.slice(-6)) + 123456).slice(-6).padStart(6, "0")
}

import { getEmailConfig } from "./config"
import { senderAddress } from "./message"

export function liveEmailConfigured(): boolean {
  const config = getEmailConfig()
  return config.enabled === true && config.provider === "resend" &&
    /^re_[A-Za-z0-9_-]+$/.test(config.resendApiKey || "") &&
    !/[\r\n]/.test(config.from) && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(senderAddress(config.from))
}

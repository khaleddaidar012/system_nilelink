import {getEmailConfig} from "@/lib/email/config"
import {sendEmailWithReceipt} from "@/lib/email/send"
import {createQuickQuoteHandler} from "@/lib/public/quick-quote"

export const POST = createQuickQuoteHandler(async message => {
  const config = getEmailConfig()
  if (!config.enabled) throw new Error("Email delivery disabled")
  return sendEmailWithReceipt({...message, to: config.to})
})

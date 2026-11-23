import {z} from "zod"

const place = z.string().trim().min(1).max(200)
export const quickQuoteSchema = z.object({
  from: place,
  to: place,
  shipmentType: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30).refine(value => {
    const normalized = value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    const digits = normalized.replace(/\D/g, "")
    return /^\+?[\d\s().-]+$/.test(normalized) && digits.length >= 7 && digits.length <= 15
  }),
}).strict()

export type QuickQuoteData = z.infer<typeof quickQuoteSchema>

/**
 * Smart bilingual (Arabic + English) normalization for shipment & invoice search.
 */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
}

export function matchesSmartQuery(haystackParts: Array<unknown>, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true
  const combined = normalizeSearchText(haystackParts.filter(Boolean).join(" "))
  return normalizedQuery.split(" ").every(token => combined.includes(token))
}

export type DateRangePreset = "today" | "last7" | "thisMonth" | "last30" | "last90" | "all"

function cairoToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo" }).format(new Date())
}

function shiftDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  return dt.toISOString().slice(0, 10)
}

export function resolveDatePreset(preset: DateRangePreset): { dateFrom: string; dateTo: string } {
  if (preset === "all") return { dateFrom: "", dateTo: "" }
  const today = cairoToday()
  if (preset === "today") return { dateFrom: today, dateTo: today }
  if (preset === "last7") return { dateFrom: shiftDays(today, -6), dateTo: today }
  if (preset === "thisMonth") return { dateFrom: today.slice(0, 7) + "-01", dateTo: today }
  if (preset === "last30") return { dateFrom: shiftDays(today, -29), dateTo: today }
  return { dateFrom: shiftDays(today, -89), dateTo: today }
}

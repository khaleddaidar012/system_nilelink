/** Wall-clock helpers based on the IANA zone (DST-aware); never depends on the OS timezone. */

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function parseHHmm(value: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!m) throw new Error("schedule time must be HH:mm (24h)")
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

function formatter(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function nowInZone(tz: string, date: Date = new Date()): ZonedParts {
  const parts: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0")

/** `YYYY-MM-DD` of the given instant in the zone. Used to ensure one automatic run per date. */
export function scheduleDateKey(tz: string, date: Date = new Date()): string {
  const p = nowInZone(tz, date)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** Converts a wall-clock time in the zone to a UTC instant. */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0)
  let guess = wall
  for (let i = 0; i < 3; i++) {
    const p = nowInZone(tz, new Date(guess))
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const diff = wall - asUtc
    if (diff === 0) break
    guess += diff
  }
  return new Date(guess)
}

/** The scheduled instant for the zone-local date that contains `date`. */
export function scheduledInstantForDate(timeHHmm: string, tz: string, date: Date): Date {
  const { hour, minute } = parseHHmm(timeHHmm)
  const p = nowInZone(tz, date)
  return zonedTimeToUtc(p.year, p.month, p.day, hour, minute, tz)
}

/** First scheduled instant strictly after `from`. */
export function nextRun(timeHHmm: string, tz: string, from: Date): Date {
  const today = scheduledInstantForDate(timeHHmm, tz, from)
  if (today.getTime() > from.getTime()) return today
  const { hour, minute } = parseHHmm(timeHHmm)
  const p = nowInZone(tz, new Date(today.getTime() + 36 * 3_600_000)) // safely inside the next local day
  return zonedTimeToUtc(p.year, p.month, p.day, hour, minute, tz)
}

export function formatLocal(tz: string, date: Date): string {
  const p = nowInZone(tz, date)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

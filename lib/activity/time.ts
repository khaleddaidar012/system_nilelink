/** Resolve midnight in Cairo including DST, using the runtime timezone database. */
export function cairoDayBoundary(date: string, next = false): string {
  const day = new Date(`${date}T00:00:00Z`)
  if (next) day.setUTCDate(day.getUTCDate() + 1)
  const wanted = day.toISOString().slice(0, 10)
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" })
  // Find the first instant on the business date. This also handles a DST jump
  // at midnight, where 00:00 itself does not exist in the local timezone.
  let low = day.getTime() / 1000 - 86400, high = day.getTime() / 1000 + 86400
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const parts = formatter.formatToParts(new Date(middle * 1000))
    const value = (type: string) => parts.find(part => part.type === type)!.value
    const local = `${value("year")}-${value("month")}-${value("day")}`
    if (local < wanted) low = middle + 1
    else high = middle
  }
  return new Date(low * 1000).toISOString()
}

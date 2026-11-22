import { serviceStages } from "./tracking"
import { serviceColorKey } from "./service-colors"

type HistoryEvent = { serviceKey?: string; title?: string; createdAt?: string | Date; [key: string]: unknown }
type HistoryService = { serviceKey: string }
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()
const canonical: Record<string, string> = { sea: "sea_freight", air: "air_freight", land: "land_freight", inland: "inland_transportation", customs: "customs_clearance", storage: "warehousing" }
const groupKey = (key: string) => canonical[serviceColorKey(key)] || key

/** Display-only classification. Never rewrites the persisted audit events. */
export function groupTimelineEvents<T extends HistoryEvent>(events: T[], services: HistoryService[] = []) {
  const available = [...new Set(services.map(service => groupKey(service.serviceKey)))]
  const groups = new Map<string, T[]>()
  const sorted = events.map((event, index) => ({ event, index })).sort((a, b) =>
    (Date.parse(String(a.event.createdAt)) || 0) - (Date.parse(String(b.event.createdAt)) || 0) || a.index - b.index)
  let previousStageService: string | null = null
  for (const { event } of sorted) {
    let key = event.serviceKey ? groupKey(event.serviceKey) : "general"
    if (!event.serviceKey) {
      const title = normalize(event.title || "")
      const stageMatch = title.match(/^(?:تم إنجاز|تحديث مرحلة|stage completed|stage updated)\s*:\s*(.+)$/u)
      if (stageMatch) {
        const label = stageMatch[1]
        const matches = available.filter(serviceKey => serviceStages({ serviceKey }).some(stage =>
          [stage.labelAr, stage.labelEn, ...(stage.stageKey === "release" ? ["تسليم إذن الإفراج", "Issuing release permit"] : [])].some(text => normalize(text) === label)))
        if (matches.length === 1) key = matches[0]
        // Shared labels (e.g. delivery in sea and air) need an immediately
        // preceding recognized stage of the same service, otherwise stay general.
        else if (previousStageService && matches.includes(previousStageService)) key = previousStageService
        previousStageService = key === "general" ? null : key
      } else {
        previousStageService = null
        if (available.includes("customs_clearance") && ["تم تعيين ucr / ucr provided", "ucr provided"].includes(title)) key = "customs_clearance"
      }
    } else {
      previousStageService = event.stageKey ? key : null
    }
    groups.set(key, [...(groups.get(key) || []), event])
  }
  return groups
}

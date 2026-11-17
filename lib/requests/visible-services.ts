import { canonicalServiceStatus } from "./progress"

/** Customer-facing services exclude cancelled and unaccepted quote services. */
export function visibleRequestServices<T extends { _id: string; status: string }>(services: T[], acceptedServiceIds?: string[] | null): T[] {
  const accepted = Array.isArray(acceptedServiceIds) ? new Set(acceptedServiceIds.map(String)) : null
  return services.filter(service => canonicalServiceStatus(service.status) !== "cancelled" && (!accepted || accepted.has(String(service._id))))
}

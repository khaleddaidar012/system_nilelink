import type { CSSProperties } from "react"

// Brand palette: 1.pdf, page 15. Service assignments and accessible shades
// are derived design choices, rather than additional official brand colors.
export const brandPalette = { corten: "#A4492A", steel: "#161616", chalk: "#F2EEE6", patina: "#3B2A22", ember: "#DF7B4F", quay: "#E5DFD3" } as const
const colors = {
  sea: [brandPalette.corten, "#ECA98E", brandPalette.corten],
  air: ["#9A4825", brandPalette.ember, brandPalette.ember],
  land: [brandPalette.patina, "#C5A18C", brandPalette.patina],
  inland: ["#77513A", "#D5B18B", "#A87850"],
  customs: ["#494540", "#C4C0B8", "#494540"],
  storage: ["#6C634B", "#C9BF9A", "#9C916D"],
  general: ["#55514B", brandPalette.quay, "#77736C"],
} as const
export function serviceColorKey(key: string): keyof typeof colors {
  if (["sea_freight", "ocean_freight", "freight_booking"].includes(key)) return "sea"
  if (key === "air_freight") return "air"
  if (["land_freight", "land_transport"].includes(key)) return "land"
  if (key === "inland_transportation") return "inland"
  if (key === "customs_clearance") return "customs"
  if (["warehousing", "storage"].includes(key)) return "storage"
  return "general"
}
export function serviceStyle(key: string): CSSProperties {
  const [ink, light, tone] = colors[serviceColorKey(key)]
  return { "--service-ink": ink, "--service-light": light, "--service-tone": tone } as CSSProperties
}

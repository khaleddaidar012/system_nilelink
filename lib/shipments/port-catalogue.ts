export type PortCountry = { code: string; name: string }
export const transportModes = ["road", "sea", "air"] as const
export type TransportMode = typeof transportModes[number]
export type CataloguePort = { code: string; name: string; ascii?: string; modes?: TransportMode[] }
export type PortCatalogue = { version: string; source: string; countries: PortCountry[]; ports: CataloguePort[]; locationCount: number; modeCounts: Record<TransportMode, number> }
export const portCatalogueUrl = "/data/unlocode-2025-1/index.json"
const modeNames = { road: "Road", sea: "Sea", air: "Air" }
const aliases: Record<string, string[]> = {
  EGALY: ["الإسكندرية", "الاسكندرية", "Alexandria"], EGDAM: ["دمياط", "Damietta"],
  EGPSD: ["بورسعيد"], EGPSE: ["شرق بورسعيد"], EGAIS: ["العين السخنة"],
  EGSOK: ["ميناء السخنة", "السخنة"], EGEDK: ["الدخيلة"], EGSUZ: ["السويس", "Suez"],
  EGSGA: ["سفاجا"], EGHRG: ["الغردقة"], EGNUW: ["نويبع"], EGSSH: ["شرم الشيخ"],
  MACAS: ["الدار البيضاء", "كازابلانكا"],
  EGCAI: ["القاهرة", "مطار القاهرة", "Cairo"],
}
export function foldLocation(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f\u064b-\u065f]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim().toLowerCase()
}
export function formatPort(port: CataloguePort, mode?: TransportMode) { return `${port.name} [${port.code}]${mode ? ` · ${modeNames[mode]}` : ""}` }
export function formatCountry(country: PortCountry, mode?: TransportMode) { return `${country.name} [${country.code}]${mode ? ` · ${modeNames[mode]}` : ""}` }
export function isCountryLocation(value: string) { return /\[[A-Z]{2}\](?: · (?:Road|Sea|Air))?$/.test(value) }
export function locationCountry(value: string, catalogue: PortCatalogue | null): string {
  if (!catalogue || !value) return ""
  const code = /\[([A-Z]{2}(?:[A-Z0-9]{3})?)\](?: · (?:Road|Sea|Air))?$/.exec(value)?.[1]
  if (code?.length === 2 && catalogue.countries.some(country => country.code === code)) return code
  if (code?.length === 5 && catalogue.countries.some(country => country.code === code.slice(0, 2))) return code.slice(0, 2)
  // Legacy free text is preserved; infer a country only when all exact matches agree.
  const needle = foldLocation(value), countries = new Set<string>()
  for (const port of catalogue.ports) {
    const names = [port.name, port.ascii || "", ...(aliases[port.code] || []), ...[...port.name.matchAll(/\(([^)]+)\)/g)].map(match => match[1])]
    if (names.some(name => name && foldLocation(name) === needle)) countries.add(port.code.slice(0, 2))
  }
  return countries.size === 1 ? [...countries][0] : ""
}
export function countryOptions(catalogue: PortCatalogue, locale: string) {
  const local = new Intl.DisplayNames([locale], { type: "region" }), english = new Intl.DisplayNames(["en"], { type: "region" })
  return catalogue.countries.map(country => {
    const localName = local.of(country.code), enName = english.of(country.code)
    const name = localName && localName !== country.code ? localName : country.name, en = enName && enName !== country.code ? enName : country.name
    return { ...country, label: `${name}${name !== en ? ` — ${en}` : ""} (${country.code})` }
  }).sort((a, b) => a.label.localeCompare(b.label, locale))
}
export function countryPorts(catalogue: PortCatalogue, country: string, query = "", mode: TransportMode = "sea") {
  const needle = foldLocation(query)
  return catalogue.ports.filter(port => port.code.startsWith(country) && country.length === 2 && (port.modes || ["sea"]).includes(mode) && (!needle ||
    [port.name, port.ascii || "", port.code, ...(aliases[port.code] || [])].some(value => foldLocation(value).includes(needle))))
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
}
export function locationMode(value: string, catalogue?: PortCatalogue | null): TransportMode {
  const explicit = / · (Road|Sea|Air)$/.exec(value)?.[1].toLowerCase() as TransportMode | undefined
  if (explicit) return explicit
  const code = /\[([A-Z]{2}[A-Z0-9]{3})\]$/.exec(value)?.[1]
  const modes = catalogue?.ports.find(port => port.code === code)?.modes
  return modes?.length === 1 ? modes[0] : "sea"
}
export function portLabel(port: CataloguePort, ar: boolean) {
  const arabic = ar ? aliases[port.code]?.find(name => /[\u0600-\u06ff]/.test(name)) : undefined
  return `${arabic ? arabic + " — " : ""}${port.name} (${port.code})`
}
export function readPortCatalogue(value: unknown): PortCatalogue {
  const catalogue = value as PortCatalogue
  if (!catalogue || catalogue.version !== "2025-1" || !Array.isArray(catalogue.countries) || !Array.isArray(catalogue.ports)) throw Error("Invalid port catalogue")
  const countries = new Set(catalogue.countries.map(country => country.code))
  if (countries.size < 240 || !Number.isSafeInteger(catalogue.locationCount) || catalogue.locationCount < 100000 || !catalogue.countries.every(country => /^[A-Z]{2}$/.test(country.code) && typeof country.name === "string") ||
    !catalogue.ports.every(port => /^[A-Z]{2}[A-Z0-9]{3}$/.test(port.code) && countries.has(port.code.slice(0, 2)) && typeof port.name === "string" && (port.ascii === undefined || typeof port.ascii === "string") && formatPort(port, "road").length <= 200 && Array.isArray(port.modes) && port.modes.length > 0 && port.modes.every(mode => transportModes.includes(mode))) || new Set(catalogue.ports.map(port => port.code)).size !== catalogue.ports.length) throw Error("Incomplete port catalogue")
  return catalogue
}
const countryLoads = new Map<string, Promise<PortCatalogue>>()
export function loadCountryCatalogue(country: string, index: PortCatalogue): Promise<PortCatalogue> {
  if (!/^[A-Z]{2}$/.test(country) || !index.countries.some(item => item.code === country)) return Promise.reject(Error("Invalid location country"))
  if (!countryLoads.has(country)) countryLoads.set(country, fetch(`/data/unlocode-2025-1/countries/${country}.json`, { cache: "force-cache" }).then(async response => {
    if (!response.ok) throw Error("Country locations unavailable")
    const data = await response.json()
    if (data.version !== index.version || data.country !== country || !Array.isArray(data.ports) || data.ports.some((port: CataloguePort) => !port.code.startsWith(country))) throw Error("Country location mismatch")
    return readPortCatalogue({ ...index, ports: data.ports })
  }).catch(error => { countryLoads.delete(country); throw error }))
  return countryLoads.get(country)!
}
let pending: Promise<PortCatalogue> | undefined
export function loadPortCatalogue(): Promise<PortCatalogue> {
  if (!pending) pending = fetch(portCatalogueUrl, { cache: "force-cache" }).then(async response => {
    if (!response.ok) throw Error("Port catalogue unavailable")
    return readPortCatalogue(await response.json())
  }).catch(error => { pending = undefined; throw error })
  return pending
}

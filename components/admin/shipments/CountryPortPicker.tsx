"use client"
import { useEffect, useMemo, useState } from "react"
import { LocationCombobox } from "./LocationCombobox"
import { countryOptions, countryPorts, foldLocation, formatCountry, formatPort, isCountryLocation, loadCountryCatalogue, locationCountry, locationMode, portLabel, transportModes, type PortCatalogue, type TransportMode } from "@/lib/shipments/port-catalogue"

export function CountryPortPicker({ id, value, catalogue, ar, inputClass, onChange }: {
  id: "port_of_loading" | "port_of_discharge"; value: string; catalogue: PortCatalogue | null; ar: boolean; inputClass: string; onChange: (value: string) => void
}) {
  const [country, setCountry] = useState(() => locationCountry(value, catalogue))
  const [mode, setMode] = useState<TransportMode>(() => locationMode(value, catalogue))
  const [search, setSearch] = useState(""), [countrySearch, setCountrySearch] = useState("")
  const [countryData, setCountryData] = useState<PortCatalogue | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (value && catalogue) { setCountry(locationCountry(value, catalogue)); setMode(locationMode(value, countryData || catalogue)) }
  }, [value, catalogue, countryData])
  useEffect(() => {
    if (!country || !catalogue) { setCountryData(null); return }
    let active = true
    setCountryData(null); setLoading(true); setError(false)
    loadCountryCatalogue(country, catalogue).then(data => { if (active) setCountryData(data) })
      .catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [country, catalogue, retry])
  const options = useMemo(() => catalogue ? countryOptions(catalogue, ar ? "ar" : "en") : [], [catalogue, ar])
  const visibleCountries = useMemo(() => options.filter(item => foldLocation(item.label + " " + item.name).includes(foldLocation(countrySearch)) || item.code.toLowerCase().includes(countrySearch.trim().toLowerCase())), [options, countrySearch])
  const allPorts = useMemo(() => countryData ? countryPorts(countryData, country, "", mode) : [], [countryData, country, mode])
  const ports = useMemo(() => countryData ? countryPorts(countryData, country, search, mode) : [], [countryData, country, search, mode])
  const visiblePorts = ports.slice(0, 500)
  const portValue = isCountryLocation(value) && locationCountry(value, catalogue) ? "" : value
  const selectedPort = allPorts.find(port => formatPort(port, mode) === portValue)
  const origin = id === "port_of_loading"
  const countryLabel = ar ? origin ? "دولة الشحن" : "دولة التفريغ" : origin ? "Loading country" : "Discharge country"
  const modeLabel = ar ? origin ? "نوع منفذ الشحن" : "نوع منفذ التفريغ" : origin ? "Loading transport mode" : "Discharge transport mode"
  const modeLabels = ar ? { road: "بري", sea: "بحري", air: "جوي" } : { road: "Road", sea: "Sea", air: "Air" }
  const portTitle = ar ? mode === "air" ? origin ? "مطار الشحن" : "مطار الوصول" : mode === "road" ? origin ? "منفذ الشحن البري" : "منفذ الوصول البري" : origin ? "ميناء الشحن" : "ميناء التفريغ"
    : mode === "air" ? origin ? "Loading airport" : "Arrival airport" : mode === "road" ? origin ? "Loading road location" : "Arrival road location" : origin ? "Port of loading" : "Port of discharge"
  const setLocationCountry = (code: string, selectedMode = mode) => {
    setCountry(code); setSearch(""); setCountrySearch("")
    const selected = catalogue?.countries.find(item => item.code === code)
    onChange(selected ? formatCountry(selected, selectedMode) : "")
  }
  return <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2 dark:border-slate-700">
    <label className="space-y-1 text-sm sm:col-span-2" htmlFor={id + "-mode"}><span>{modeLabel}</span>
      <select id={id + "-mode"} className={inputClass} disabled={!catalogue} value={mode} onChange={event => {
        const next = event.target.value as TransportMode; setMode(next); setLocationCountry(country, next)
      }}>{transportModes.map(item => <option key={item} value={item}>{modeLabels[item]}</option>)}</select>
    </label>
    <div className="space-y-1 text-sm"><label htmlFor={id + "-country"}>{countryLabel}</label>
      <LocationCombobox id={id + "-country"} value={country} label={options.find(item => item.code === country)?.label || ""} ariaLabel={countryLabel}
        placeholder={ar ? "اختر الدولة أو ابحث بالاسم والكود" : "Choose or search country"} options={visibleCountries.map(item => ({ value: item.code, label: item.label }))}
        disabled={!catalogue} inputClass={inputClass} ar={ar} onChange={setLocationCountry} onSearch={setCountrySearch} />
      <p className="text-xs text-slate-500">{ar ? "تغيير النوع أو الدولة يمسح اختيار المنفذ السابق." : "Changing mode or country clears the previous location selection."}</p>
    </div>
    <div className="space-y-1 text-sm"><label htmlFor={id + "-port"}>{portTitle}</label>
      <LocationCombobox key={country + mode} id={id + "-port"} value={portValue} label={selectedPort ? portLabel(selectedPort, ar) : portValue} ariaLabel={portTitle}
        placeholder={loading ? ar ? "جارٍ التحميل…" : "Loading…" : ar ? "اختر المنفذ أو ابحث بالاسم والكود" : "Choose or search location"}
        options={visiblePorts.map(port => ({ value: formatPort(port, mode), label: portLabel(port, ar) }))}
        disabled={!countryData || !country || loading || !allPorts.length} inputClass={inputClass} ar={ar} onSearch={setSearch} onChange={next => {
          const selected = allPorts.find(port => formatPort(port, mode) === next)
          const selectedCountry = catalogue?.countries.find(item => item.code === country)
          onChange(selected ? formatPort(selected, mode) : selectedCountry ? formatCountry(selectedCountry, mode) : "")
        }} />
      {loading && country && <p role="status" className="text-xs text-slate-500">{ar ? "جارٍ تحميل منافذ الدولة…" : "Loading country locations…"}</p>}
      {error && country && <p role="alert" className="text-xs text-red-600">{ar ? "تعذّر تحميل منافذ الدولة." : "Unable to load country locations."} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>{ar ? "إعادة المحاولة" : "Retry"}</button></p>}
      {countryData && country && !loading && <p className="text-xs text-slate-500" role="status">{!allPorts.length ? ar ? "لا توجد مواقع مسجلة لهذا النوع في الدولة المختارة." : "No locations of this mode are listed for this country."
        : !ports.length ? ar ? "لا توجد نتائج مطابقة للبحث." : "No locations match your search."
        : ports.length > 500 ? ar ? `أول 500 نتيجة من ${ports.length}. استخدم البحث للوصول إلى باقي المواقع.` : `First 500 of ${ports.length}. Search to find other locations.`
        : ar ? `${ports.length} موقع مطابق من ${allPorts.length}` : `${ports.length} matching locations of ${allPorts.length}`}</p>}
      {portValue && !country && <p className="text-xs text-slate-500">{ar ? "القيمة المحفوظة لم تتغير؛ اختر الدولة لتحديثها." : "The saved value is unchanged; choose a country to update it."} <bdi>{portValue}</bdi></p>}
    </div>
  </div>
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { TOP_100_SHIPPING_LINES } from "@/lib/constants/shipping-lines"
import { normalizeSearchText } from "@/lib/shipments/smart-search"

interface ShippingLineComboboxProps {
  value: string
  extraOptions?: string[]
  ar: boolean
  inputClass: string
  onChange: (value: string) => void
}

export function ShippingLineCombobox({
  value,
  extraOptions = [],
  ar,
  inputClass,
  onChange,
}: ShippingLineComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  const allLines = useMemo(() => {
    const seen = new Set<string>()
    const merged: string[] = []
    for (const item of [...TOP_100_SHIPPING_LINES, ...extraOptions]) {
      const clean = item.trim()
      if (!clean) continue
      const key = clean.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(clean)
    }
    return merged
  }, [extraOptions])

  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query)
    if (!needle) return allLines
    return allLines.filter(line => normalizeSearchText(line).includes(needle))
  }, [allLines, query])

  const selectLine = (line: string) => {
    setQuery(line)
    onChange(line)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative space-y-1 text-sm">
      <span className="block">{ar ? "الخط الملاحي (أهم 100 خط)" : "Shipping line (Top 100)"}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 rtl:right-2.5 rtl:left-auto" />
        <input
          type="text"
          className={`${inputClass} pl-8 pr-14 rtl:pr-8 rtl:pl-14`}
          maxLength={200}
          value={query}
          placeholder={ar ? "ابحث في أهم 100 خط ملاحي أو اكتب خطًا…" : "Search top 100 shipping lines or type…"}
          onFocus={() => setOpen(true)}
          onChange={event => {
            const next = event.target.value
            setQuery(next)
            onChange(next)
            setOpen(true)
          }}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault()
              if (open && filtered.length > 0) {
                selectLine(filtered[0])
              } else {
                setOpen(false)
              }
            } else if (event.key === "Escape") {
              setOpen(false)
            }
          }}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 rtl:left-2 rtl:right-auto">
          {query && (
            <button
              type="button"
              aria-label={ar ? "مسح الخط الملاحي" : "Clear shipping line"}
              onClick={() => {
                setQuery("")
                onChange("")
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label={ar ? "عرض قائمة الخطوط الملاحية" : "Toggle shipping lines"}
            onClick={() => setOpen(prev => !prev)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {filtered.length > 0 ? (
            filtered.map(line => (
              <button
                key={line}
                type="button"
                onClick={() => selectLine(line)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-xs font-medium transition hover:bg-sky-50 dark:hover:bg-slate-800 ${
                  line.toLowerCase() === value.trim().toLowerCase()
                    ? "bg-sky-50 font-bold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                    : "text-slate-800 dark:text-slate-200"
                }`}
              >
                <bdi dir="ltr">{line}</bdi>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">
              {ar
                ? `استخدام خط ملاحي مخصّص: «${query}»`
                : `Using custom shipping line: "${query}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

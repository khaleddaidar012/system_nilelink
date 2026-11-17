"use client"
import { Combobox } from "@headlessui/react"
import { Check, ChevronDown } from "lucide-react"

export function LocationCombobox({ id, value, label, ariaLabel, placeholder, options, disabled, inputClass, ar, onChange, onSearch }: {
  id: string; value: string; label: string; ariaLabel: string; placeholder: string; options: { value: string; label: string }[]; disabled?: boolean; inputClass: string; ar: boolean; onChange: (value: string) => void; onSearch: (query: string) => void
}) {
  return <Combobox value={value} onChange={(next: string | null) => { onChange(next || ""); onSearch("") }} disabled={disabled} nullable>
    <div className="relative">
      <Combobox.Input id={id} aria-label={ariaLabel} autoComplete="off" placeholder={placeholder}
        className={`${inputClass} pe-11 disabled:cursor-not-allowed disabled:opacity-60`}
        defaultValue={label} displayValue={() => label} onChange={event => onSearch(event.target.value)} />
      <Combobox.Button aria-label={ar ? "عرض الخيارات" : "Show options"} className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-slate-400 disabled:cursor-not-allowed" onClick={() => onSearch("")}>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Combobox.Button>
      <Combobox.Options className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl focus:outline-none dark:border-slate-700 dark:bg-slate-900">
        <Combobox.Option value="" className={({ active }) => `cursor-pointer rounded-lg px-3 py-2.5 text-sm text-slate-500 ${active ? "bg-sky-50 dark:bg-slate-800" : ""}`}>
          {ar ? "مسح الاختيار" : "Clear selection"}
        </Combobox.Option>
        {options.map(option => <Combobox.Option key={option.value} value={option.value} className={({ active }) => `flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "text-slate-700 dark:text-slate-200"}`}>
          {({ selected }) => <><span dir="auto">{option.label}</span>{selected && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}</>}
        </Combobox.Option>)}
        {!options.length && <div className="px-3 py-4 text-center text-sm text-slate-500">{ar ? "لا توجد نتائج مطابقة" : "No matching results"}</div>}
      </Combobox.Options>
    </div>
  </Combobox>
}

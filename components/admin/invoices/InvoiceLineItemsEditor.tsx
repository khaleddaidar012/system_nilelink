"use client"

import { useLocale } from "next-intl"
import { Plus, Trash2, Sparkles } from "lucide-react"
import { RawInvoiceItemInput } from "@/lib/engine/invoice-calculator"

interface InvoiceLineItemsEditorProps {
  items: RawInvoiceItemInput[]
  currency: string
  onChange: (items: RawInvoiceItemInput[]) => void
}

export function InvoiceLineItemsEditor({
  items,
  currency,
  onChange,
}: InvoiceLineItemsEditorProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  const presets = [
    { en: "Ocean Freight 40ft HC Container", ar: "شحن بحري حاوية 40 قدم عالية السقف" },
    { en: "Ocean Freight 20ft Standard Container", ar: "شحن بحري حاوية 20 قدم قياسية" },
    { en: "Customs Clearance & Inspection (Nafeza ACID)", ar: "تخليص جمركي وفحص (نافذة ACID)" },
    { en: "Port Terminal Handling & Demurrage Charges", ar: "أرضيات ورسوم تداول بمحطة الميناء" },
    { en: "Inland Truck Dispatch (Port to Warehouse)", ar: "نقل بري بالشاحنات (من الميناء إلى المستودع)" },
    { en: "Bonded Warehouse Storage & Logistics Handling", ar: "تخزين مستودعات جمركية ومناولة لوجستية" },
  ]

  const handleItemChange = (index: number, field: keyof RawInvoiceItemInput, value: any) => {
    const updated = [...items]
    updated[index] = {
      ...updated[index],
      [field]: value,
    }
    onChange(updated)
  }

  const handleAddItem = () => {
    onChange([
      ...items,
      { description: "", quantity: 1, unitPrice: 0 },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    const updated = items.filter((_, i) => i !== index)
    onChange(updated)
  }

  const handleApplyPreset = (index: number, presetText: string) => {
    handleItemChange(index, "description", presetText)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          {isAr ? "بنود الفاتورة والخدمات" : "Line Items & Services"}
        </h4>
        <button
          type="button"
          onClick={handleAddItem}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary-600 bg-primary-50 rounded-xl hover:bg-primary-100 dark:bg-primary-950/40 dark:text-primary-400 dark:hover:bg-primary-900/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isAr ? "إضافة بند جديد" : "Add Line Item"}</span>
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const qty = Number(item.quantity) || 0
          const price = Number(item.unitPrice) || 0
          const rowTotal = Math.round((qty * price) * 100) / 100

          return (
            <div
              key={idx}
              className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                {/* Description & Preset selector */}
                <div className="md:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {isAr ? `البند #${idx + 1} — الوصف` : `Item #${idx + 1} — Description`}
                    </label>
                    {/* Logistics Quick Template Dropdown */}
                    <div className="relative group">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                        title="Pick Logistics Template"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{isAr ? "قالب سريع" : "Template"}</span>
                      </button>
                      <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 py-1 text-xs">
                        {presets.map((p, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => handleApplyPreset(idx, isAr ? p.ar : p.en)}
                            className="w-full text-left rtl:text-right px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 truncate"
                          >
                            {isAr ? p.ar : p.en}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                    placeholder={isAr ? "مثال: شحن بحري حاوية 40 قدم مع التخليص" : "e.g. Ocean Freight 40ft HC with Clearance"}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                  />
                </div>

                {/* Quantity */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {isAr ? "الكمية" : "Quantity"}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={item.quantity}
                    onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                  />
                </div>

                {/* Unit Price */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {isAr ? `السعر (${currency})` : `Unit Price (${currency})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                  />
                </div>

                {/* Subtotal & Delete Action */}
                <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 pt-1 md:pt-6">
                  <div className="text-right rtl:text-left">
                    <span className="text-xs text-slate-400 block md:hidden">{isAr ? "الإجمالي" : "Total"}</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                      {rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title={isAr ? "حذف البند" : "Delete Item"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

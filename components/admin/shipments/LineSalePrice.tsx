import type { CostInput } from "@/lib/shipments/accounting"

export function LineSalePrice({ cost, ar, disabled, onChange }: { cost: CostInput; ar: boolean; disabled: boolean; onChange: (patch: Partial<CostInput>) => void }) {
  const linked = !cost.isTiered && cost.saleEqualsCost !== false
  return <div className="space-y-2 sm:col-span-2">
    <label className="block text-xs">{ar ? "سعر البيع للعميل" : "Customer selling price"} · {cost.currency}
      <input aria-label={ar ? "سعر بيع البند" : "Item selling price"} disabled={disabled || linked || cost.isTiered} inputMode="decimal"
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
        value={linked ? cost.amount : cost.sellingPrice ?? ""} onChange={event => onChange({ sellingPrice: event.target.value })} />
    </label>
    {!cost.isTiered&&<label className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={linked} disabled={disabled}
      onChange={event => onChange({ saleEqualsCost: event.target.checked, sellingPrice: cost.amount })} />{ar ? "التكلفة هي سعر البيع" : "Cost equals selling price"}</label>}
    <p className="text-xs text-slate-500">{cost.isTiered?(ar?"سعر البيع محسوب من الشرائح.":"Selling price is calculated from tiers."):ar ? "ألغِ الاختيار لتعديل سعر البيع. العميل يرى سعر البيع فقط." : "Uncheck to edit the selling price. Customers see only the selling price."}</p>
  </div>
}

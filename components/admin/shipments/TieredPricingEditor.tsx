"use client"

import { useState } from "react"
import { MoneyInput } from "./MoneyInput"
import { decimal, minor, tierSubtotal, type CostInput, type PricingTier } from "@/lib/shipments/accounting"

export function TieredPricingEditor({
  cost,
  stage,
  ar,
  disabled,
  allowed,
  onChange,
}: {
  cost: CostInput
  stage: string
  ar: boolean
  disabled: boolean
  allowed: boolean
  onChange: (patch: Partial<CostInput>) => void
}) {
  const tiers = cost.tiers || []
  const [useQuantity, setUseQuantity] = useState(() =>
    tiers.some(t => t.quantity && t.quantity !== "1")
  )

  if (!allowed && !cost.isTiered) return null

  const update = (next: PricingTier[]) => {
    let sellingPrice: string | undefined
    try {
      sellingPrice = decimal(next.reduce((sum, tier) => sum + minor(tierSubtotal(tier)), BigInt(0)))
    } catch {}
    onChange({ tiers: next, saleEqualsCost: false, ...(sellingPrice ? { sellingPrice } : {}) })
  }

  const toggle = (enabled: boolean) => {
    if (!enabled) {
      onChange({ isTiered: false, tiers: undefined })
      return
    }
    const labels =
      stage === "transportation"
        ? ar
          ? ["اليوم الأول", "اليوم 2–5", "اليوم 6+"]
          : ["First day", "Days 2–5", "Day 6+"]
        : stage === "customs"
          ? ar
            ? ["الشحنة الأولى", "الشحنة الثانية", "الشحنة الثالثة+"]
            : ["First shipment", "Second shipment", "Third shipment+"]
          : ar
            ? ["الحاوية الأولى", "الحاوية الثانية", "الحاوية الثالثة+"]
            : ["First container", "Second container", "Third container+"]
    onChange({
      isTiered: true,
      saleEqualsCost: false,
      sellingPrice: "0.00",
      tiers: labels.map(label => ({ label, quantity: "1", unitPrice: "0" })),
    })
  }

  const handleToggleQuantity = (enabled: boolean) => {
    setUseQuantity(enabled)
    if (!enabled && tiers.length > 0) {
      // Collapse back to unit price with quantity = 1 preserving subtotal
      update(
        tiers.map(row => {
          let sub = row.unitPrice
          try {
            sub = tierSubtotal(row)
          } catch {}
          return { ...row, quantity: "1", unitPrice: sub }
        })
      )
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:col-span-2 lg:col-span-4 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={cost.isTiered === true}
            disabled={disabled || !allowed}
            onChange={event => toggle(event.target.checked)}
          />
          {ar ? "تفعيل التسعير المتدرج" : "Enable tiered pricing"}
        </label>

        {cost.isTiered && (
          <label className="flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-bold text-sky-900 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-200">
            <input
              type="checkbox"
              checked={useQuantity}
              disabled={disabled || !allowed}
              onChange={event => handleToggleQuantity(event.target.checked)}
            />
            {ar ? "تفعيل حقل الكمية (اختياري)" : "Enable Quantity column (optional)"}
          </label>
        )}
      </div>

      {cost.isTiered && (
        <>
          <p className="text-xs text-slate-500">
            {ar
              ? "الشرائح تحدد سعر البيع للعميل. تكلفة البند الداخلية تُسجل منفصلة بالأعلى."
              : "Tiers set the customer's selling price. Record the internal item cost separately above."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-start text-xs">
              <thead>
                <tr>
                  {(useQuantity
                    ? ar
                      ? ["وصف الشريحة", "الكمية", "سعر الوحدة", "الإجمالي", ""]
                      : ["Tier description", "Qty", "Unit price", "Subtotal", ""]
                    : ar
                      ? ["وصف الشريحة", "السعر", "الإجمالي", ""]
                      : ["Tier description", "Price", "Subtotal", ""]
                  ).map((label, index) => (
                    <th key={index} className="p-2 text-start">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, index) => {
                  let subtotal = "—"
                  try {
                    subtotal = tierSubtotal(tier)
                  } catch {}
                  return (
                    <tr key={index}>
                      <td className="p-1">
                        <input
                          aria-label={ar ? "وصف الشريحة" : "Tier description"}
                          className="w-full rounded border bg-transparent p-2"
                          value={tier.label}
                          maxLength={160}
                          disabled={disabled || !allowed}
                          onChange={event =>
                            update(
                              tiers.map((row, i) =>
                                i === index ? { ...row, label: event.target.value } : row
                              )
                            )
                          }
                        />
                      </td>
                      {useQuantity && (
                        <td className="w-24 p-1">
                          <input
                            type="number"
                            min={1}
                            step="1"
                            dir="ltr"
                            aria-label={ar ? "الكمية" : "Quantity"}
                            className="w-full rounded border bg-transparent p-2 text-center tabular-nums"
                            value={tier.quantity || "1"}
                            disabled={disabled || !allowed}
                            onChange={event => {
                              const q = event.target.value.trim() || "1"
                              update(
                                tiers.map((row, i) =>
                                  i === index ? { ...row, quantity: q } : row
                                )
                              )
                            }}
                          />
                        </td>
                      )}
                      <td className="w-32 p-1">
                        <MoneyInput
                          aria-label={ar ? "سعر الشريحة" : "Tier price"}
                          className="w-full rounded border bg-transparent p-2"
                          value={useQuantity ? tier.unitPrice : subtotal === "—" ? tier.unitPrice : subtotal}
                          disabled={disabled || !allowed}
                          onValueChange={value =>
                            update(
                              tiers.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      quantity: useQuantity ? row.quantity || "1" : "1",
                                      unitPrice: value,
                                    }
                                  : row
                              )
                            )
                          }
                        />
                      </td>
                      <td className="p-2 font-semibold tabular-nums">
                        <bdi dir="ltr">
                          {subtotal} {cost.currency}
                        </bdi>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={disabled || !allowed || tiers.length <= 1}
                          onClick={() => update(tiers.filter((_, i) => i !== index))}
                          className="p-2 text-rose-600 disabled:opacity-30"
                        >
                          {ar ? "حذف" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={disabled || !allowed || tiers.length >= 30}
            onClick={() =>
              update([...tiers, { label: ar ? "شريحة جديدة" : "New tier", quantity: "1", unitPrice: "0" }])
            }
            className="rounded-lg border border-sky-300 px-3 py-2 text-xs disabled:opacity-40"
          >
            {ar ? "+ إضافة شريحة" : "+ Add tier"}
          </button>
        </>
      )}
    </div>
  )
}

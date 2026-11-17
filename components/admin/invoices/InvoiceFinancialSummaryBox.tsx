"use client"

import { useLocale } from "next-intl"
import { InvoiceCalculationResult } from "@/lib/engine/invoice-calculator"

interface InvoiceFinancialSummaryBoxProps {
  calculation: InvoiceCalculationResult
  currency: string
  taxRate: number
  discount: number
  additionalCharges: number
  onTaxRateChange: (rate: number) => void
  onDiscountChange: (discount: number) => void
  onAdditionalChargesChange: (charges: number) => void
}

export function InvoiceFinancialSummaryBox({
  calculation,
  currency,
  taxRate,
  discount,
  additionalCharges,
  onTaxRateChange,
  onDiscountChange,
  onAdditionalChargesChange,
}: InvoiceFinancialSummaryBoxProps) {
  const locale = useLocale()
  const isAr = locale === "ar"

  return (
    <div className="bg-slate-50 dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {isAr ? "الضرائب والخصومات والمجموع الإجمالي" : "Taxes, Surcharges & Net Total"}
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Additional Charges Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {isAr ? "رسوم ومصاريف إضافية" : "Additional Surcharges"}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={additionalCharges}
            onChange={(e) => onAdditionalChargesChange(Math.max(0, parseFloat(e.target.value) || 0))}
            placeholder="0.00"
            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
          />
          <span className="text-[10px] text-slate-400 block">
            {isAr ? "أرضيات، غرامات، رسوم مناولة" : "Demurrage, terminal handling, etc."}
          </span>
        </div>

        {/* Discount Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {isAr ? "الخصم التجاري" : "Discount Amount"}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => onDiscountChange(Math.max(0, parseFloat(e.target.value) || 0))}
            placeholder="0.00"
            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
          />
        </div>

        {/* Tax Rate Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {isAr ? "نسبة ضريبة القيمة المضافة (%)" : "VAT Rate (%)"}
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={taxRate}
            onChange={(e) => onTaxRateChange(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
          />
        </div>
      </div>

      {/* Financial Calculations Summary Breakdown */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2 text-sm">
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>{isAr ? "المجموع الفرعي (قبل الضريبة)" : "Subtotal:"}</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-white">
            {calculation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
          </span>
        </div>

        {calculation.additionalCharges > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>{isAr ? "الرسوم الإضافية:" : "Additional Charges:"}</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              +{calculation.additionalCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
            </span>
          </div>
        )}

        {calculation.discount > 0 && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>{isAr ? "الخصم المطبق:" : "Discount Applied:"}</span>
            <span className="font-mono font-semibold">
              -{calculation.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
            </span>
          </div>
        )}

        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>{isAr ? `ضريبة القيمة المضافة (${calculation.taxRate}%):` : `VAT Amount (${calculation.taxRate}%):`}</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-white">
            +{calculation.tax.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
          </span>
        </div>

        {/* Grand Total Callout Box */}
        <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between mt-2 shadow-sm">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 block font-bold">
              {isAr ? "المبلغ الإجمالي المستحق" : "Grand Total Due"}
            </span>
            <span className="text-xs text-slate-300">
              {isAr ? "شامل ضريبة القيمة المضافة والرسوم" : "Includes all taxes & applicable charges"}
            </span>
          </div>
          <div className="text-right rtl:text-left">
            <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
              {calculation.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-primary-400 ml-1.5 rtl:ml-0 rtl:mr-1.5 uppercase">
              {currency}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

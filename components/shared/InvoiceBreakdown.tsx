import { Fragment } from "react"
import type { InvoiceGroup } from "@/lib/shipments/accounting"

export function InvoiceBreakdown({ groups, currency, ar }: { groups: InvoiceGroup[]; currency: string; ar: boolean }) {
  const labels = ar ? { shipping: "الشحن", transportation: "النقل", customs: "التخليص الجمركي" }
    : { shipping: "Shipping", transportation: "Transportation", customs: "Customs clearance" }
  const money = (value: string) => <bdi>{Number(value).toLocaleString(ar ? "ar-EG" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</bdi>
  return <table dir={ar ? "rtl" : "ltr"} className="w-full text-start text-sm">
    <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="p-3 text-start">{ar ? "البند والتفاصيل" : "Item and details"}</th><th className="p-3 text-end">{ar ? "المبلغ" : "Amount"}</th></tr></thead>
    <tbody>{groups.map(group => <Fragment key={group.stage}>
      <tr className="bg-slate-100 font-bold text-slate-900 dark:bg-slate-800 dark:text-white"><th scope="rowgroup" colSpan={2} className="p-3 text-start">{labels[group.stage]}</th></tr>
      {group.items.map((item, index) => <Fragment key={index}><tr className="border-b border-slate-100 dark:border-slate-800"><td className="whitespace-pre-wrap py-3 pe-3 ps-6">{item.description}</td><td className="p-3 text-end tabular-nums">{money(item.amount)}</td></tr>{item.tiers?.map((tier,tierIndex)=><tr key={tierIndex} className="text-xs text-slate-500"><td className="py-2 pe-3 ps-10">{tier.label} · <bdi>{tier.quantity} × {tier.unitPrice} {tier.currency}</bdi></td><td className="p-2 text-end">{money(tier.subtotal)}</td></tr>)}</Fragment>)}
      <tr className="border-b border-slate-200 font-semibold dark:border-slate-700"><td className="p-3">{ar ? "إجمالي" : "Subtotal"} {labels[group.stage]}</td><td className="p-3 text-end tabular-nums">{money(group.total)}</td></tr>
    </Fragment>)}</tbody>
  </table>
}

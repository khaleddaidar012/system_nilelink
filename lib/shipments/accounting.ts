import { z } from "zod"

export const currencies = ["EGP", "USD", "EUR"] as const
export const stages = ["shipping", "transportation", "customs"] as const
const amount = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
const rate = z.string().regex(/^(0|[1-9]\d{0,5})(\.\d{1,8})?$/)
export const tierSchema = z.object({label:z.string().trim().min(1).max(160),quantity:z.string().regex(/^(0|[1-9]\d{0,5})(\.\d{1,4})?$/).refine(value=>Number(value)>0),unitPrice:amount}).strict()
export type PricingTier=z.infer<typeof tierSchema>
export type PublishedTier=PricingTier & {currency:string;subtotal:string}
export const costSchema = z.object({
  id: z.uuid(), description: z.string().trim().min(1).max(500), amount,
  currency: z.enum(currencies), exchangeRate: rate,
  notes: z.string().trim().max(2000),
  saleEqualsCost: z.boolean().optional(),
  sellingPrice: amount.optional(),
  isTiered:z.boolean().optional(), tiers:z.array(tierSchema).min(1).max(30).optional(),
}).strict().refine(cost => cost.isTiered===true || cost.saleEqualsCost !== false || cost.sellingPrice !== undefined, { path: ["sellingPrice"], message: "Enter the selling price" }).refine(cost=>!cost.isTiered||!!cost.tiers?.length,{path:["tiers"],message:"Add at least one pricing tier"})
export const stageSchema = z.object({ completed: z.boolean(), costs: z.array(costSchema).max(100) }).strict()
export const draftSchema = z.object({
  revision: z.number().int().nonnegative(),
  pricingMode: z.literal("per-item-v1").optional(),
  stages: z.object({ shipping: stageSchema, transportation: stageSchema, customs: stageSchema }).strict(),
  customerItems: z.array(z.object({ description: z.string().trim().min(1).max(500), amount }).strict()).max(100).optional(),
  sellingPrice: amount.optional(),
  internalSellingPrice: amount.optional(),
  notes: z.string().trim().max(2000),
}).strict()
export type CostInput = z.infer<typeof costSchema>
export type Cost = CostInput & { createdAt: string; createdBy: string; updatedAt: string; updatedBy: string }
export type Stage = { completed: boolean; costs: Cost[] }
export type AccountingDraft = {
  pricingMode?: "per-item-v1"
  stages: Record<typeof stages[number], Stage>
  customerItems: { description: string; amount: string }[]
  internalSellingPrice: string
  notes: string
}
export type InvoiceGroup = {
  stage: typeof stages[number]
  items: { description: string; amount: string; tiers?:PublishedTier[] }[]
  total: string
}
export type Publication = {
  referenceNumber?: string
  version: number; publishedAt: string; publishedBy: string
  invoiceNumber: string; shipmentId: string; booking: string; customerId: string; customerName: string
  currency: typeof currencies[number]; items: { description: string; amount: string }[]
  total: string; notes: string; groups?: InvoiceGroup[]
}
export type ApprovalRequest = { at: string; by: string; byName: string; revision: number }
export type Accounting = { draft: AccountingDraft; publications: Publication[]; pendingRevision: boolean; approvalRequest?: ApprovalRequest | null }
// All supported currencies use two minor digits. Conversion uses a decimal rate
// supplied for the entry, rounded half up once at the converted line total.
const maxUnits = BigInt(999999999999)
export function minor(value: string): bigint {
  const parsed = amount.parse(value)
  const [whole, fraction = ""] = parsed.split(".")
  return bounded(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")))
}
function bounded(value: bigint): bigint {
  if (value < -maxUnits || value > maxUnits) throw new Error("MONEY_LIMIT")
  return value
}
export function decimal(value: bigint): string {
  const absolute = value < BigInt(0) ? -value : value
  return `${value < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`
}
export function converted(cost: CostInput, base: string): bigint {
  const [whole, fraction = ""] = rate.parse(cost.exchangeRate).split(".")
  const denominator = BigInt(10) ** BigInt(fraction.length)
  const numerator = BigInt(whole + fraction)
  if (!numerator || (cost.currency === base && numerator !== denominator)) throw new Error("INVALID_RATE")
  return bounded((minor(cost.amount) * numerator + denominator / BigInt(2)) / denominator)
}
export function totals(draft: AccountingDraft, currency: string) {
  const perStage = Object.fromEntries(stages.map(stage => [stage,
    decimal(draft.stages[stage].costs.reduce((sum, cost) => bounded(sum + converted(cost, currency)), BigInt(0))),
  ])) as Record<typeof stages[number], string>
  const totalCosts = bounded(stages.reduce((sum, stage) => sum + minor(perStage[stage]), BigInt(0)))
  const perStageSales = Object.fromEntries(stages.map(stage => [stage, decimal(draft.stages[stage].costs.reduce((sum, cost) => bounded(sum + convertedSale(cost, currency)), BigInt(0)))])) as Record<typeof stages[number], string>
  const customerTotal = draft.pricingMode === "per-item-v1" ? bounded(stages.reduce((sum, stage) => sum + minor(perStageSales[stage]), BigInt(0))) : minor(draft.internalSellingPrice)
  return { perStage, perStageSales, totalCosts: decimal(totalCosts), customerTotal: decimal(customerTotal),
    expectedProfit: decimal(bounded(customerTotal - totalCosts)) }
}
export function convertedSale(cost: CostInput, currency: string) {
  if(cost.isTiered)return (cost.tiers||[]).reduce((sum,tier)=>bounded(sum+converted({...cost,amount:tierSubtotal(tier)},currency)),BigInt(0))
  if (cost.saleEqualsCost !== false) return converted(cost, currency)
  if (cost.sellingPrice === undefined) throw new Error("SELLING_PRICE_REQUIRED")
  return converted({ ...cost, amount: cost.sellingPrice }, currency)
}
export function tierSubtotal(input:PricingTier):string {
  const tier=tierSchema.parse(input),[whole,fraction=""]=tier.quantity.split("."),denominator=BigInt(10)**BigInt(fraction.length)
  return decimal(bounded((minor(tier.unitPrice)*BigInt(whole+fraction)+denominator/BigInt(2))/denominator))
}
/** Retain the old storage key while using one selling price throughout the app. */
export function accountingDraft(accounting: Accounting): AccountingDraft {
  const latest = accounting.publications[accounting.publications.length - 1]
  return { ...accounting.draft, internalSellingPrice: latest && !accounting.pendingRevision ? latest.total : accounting.draft.internalSellingPrice }
}
export function customerSaleItems(draft: AccountingDraft, currency = "EGP") {
  if (draft.pricingMode === "per-item-v1") return customerInvoiceGroups(draft, currency).flatMap(group => group.items)
  if (minor(draft.internalSellingPrice) === BigInt(0)) return []
  return [{ description: "خدمات الشحن والنقل والتخليص الجمركي / Logistics services", amount: decimal(minor(draft.internalSellingPrice)) }]
}
/** Customer-approved line amounts only; internal notes and staff attribution stay private. */
export function customerInvoiceGroups(draft: AccountingDraft, currency: string): InvoiceGroup[] {
  return stages.flatMap(stage => {
    const items = draft.stages[stage].costs.map(cost => ({ description: cost.description, amount: decimal(draft.pricingMode === "per-item-v1" ? convertedSale(cost, currency) : converted(cost, currency)),
      ...(cost.isTiered?{tiers:cost.tiers?.map(tier=>({...tier,currency:cost.currency,subtotal:decimal(converted({...cost,amount:tierSubtotal(tier)},currency))}))}:{}) }))
    return items.length ? [{ stage, items, total: decimal(items.reduce((sum, item) => bounded(sum + minor(item.amount)), BigInt(0))) }] : []
  })
}
export function draftBusinessKey(draft:AccountingDraft) {
  const numeric=(value:string)=>value.includes(".")?value.replace(/0+$/,"").replace(/\.$/,""):value
  return JSON.stringify({pricingMode:draft.pricingMode,sellingPrice:decimal(minor(draft.internalSellingPrice)),notes:draft.notes,
    stages:stages.map(stage=>({completed:draft.stages[stage].completed,costs:draft.stages[stage].costs.map(cost=>({id:cost.id,description:cost.description.trim(),amount:decimal(minor(cost.amount)),isTiered:cost.isTiered===true,tiers:cost.isTiered?cost.tiers:undefined,saleEqualsCost:cost.saleEqualsCost!==false,sellingPrice:!cost.isTiered&&cost.saleEqualsCost===false?decimal(minor(cost.sellingPrice!)):undefined,currency:cost.currency,exchangeRate:numeric(cost.exchangeRate),notes:cost.notes.trim()}))}))})
}
/** Empty rows have no amount yet and must not freeze totals for completed rows. */
export function previewTotals(draft: AccountingDraft, currency: string) {
  const previewStages = Object.fromEntries(stages.map(stage => [stage, { ...draft.stages[stage],
    costs: draft.stages[stage].costs.filter(cost => cost.amount.trim() !== ""),
  }])) as AccountingDraft["stages"]
  return totals({ ...draft, stages: previewStages, internalSellingPrice: draft.internalSellingPrice || "0.00" }, currency)
}
export function emptyAccounting(): Accounting {
  return { draft: { stages: { shipping: { completed: false, costs: [] }, transportation: { completed: false, costs: [] }, customs: { completed: false, costs: [] } },
    customerItems: [], internalSellingPrice: "0.00", notes: "" }, publications: [], pendingRevision: false }
}

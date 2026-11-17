/** Display only: never used to calculate or persist accounting amounts. */
export function formatInvoiceMoney(value:number|string|null|undefined,currency:string,locale="en-GB") {
  const number=Number(value??0)
  const code=/^[A-Z]{3}$/.test(currency??"")?currency:"—"
  return `${Number.isFinite(number)?new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(number):"—"} ${code}`
}

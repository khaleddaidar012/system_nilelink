/** Format stored money without converting or relabeling legacy currencies. */
export function formatMoney(amount: number, currency = "EGP", locale = "en-US"): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "EGP"
  return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

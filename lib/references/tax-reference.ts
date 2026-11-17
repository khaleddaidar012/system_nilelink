/** Preserve the displayed tax number; compare separators and Arabic digits consistently. */
export function taxDisplayReference(value: unknown): string {
  return String(value ?? "").trim().replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0)
    return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660)
  })
}
export function taxReferenceKey(value: unknown): string {
  return taxDisplayReference(value).replace(/[ -]/g, "").toUpperCase()
}
export function taxCustomerReference(value: unknown) {
  const customerCode = taxDisplayReference(value)
  const taxKey = taxReferenceKey(customerCode)
  if (!taxKey) throw new Error("Tax number is required")
  return { customerCode, taxReferenceKey: taxKey }
}
/** Only call with developer-owned SQL expressions, never request values. */
export function taxDisplaySql(expression = "json_extract(data,'$.taxCardNumber')") {
  let result = `trim(coalesce(${expression},''))`
  for (const alphabet of ["٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹"]) {
    for (let index = 0; index < alphabet.length; index++) result = `replace(${result},'${alphabet[index]}','${index}')`
  }
  return result
}
export function taxReferenceSql(expression = "json_extract(data,'$.taxCardNumber')") {
  return `upper(replace(replace(${taxDisplaySql(expression)},'-',''),' ',''))`
}

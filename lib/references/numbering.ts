import type { D1Binding } from "../db/d1"
import { taxCustomerReference, taxReferenceKey, taxReferenceSql } from "./tax-reference"

/** Atomic reservations are never reused, including after a failed business write. */
async function reserve(db: D1Binding, key: string, maximumSql: string, values: (string | number)[] = []) {
  const row = await db.prepare(`INSERT INTO _nilelink_workflow_sequences(id,seq)
    SELECT ?, coalesce(max(n),0)+1 FROM (${maximumSql}) WHERE 1=1
    ON CONFLICT(id) DO UPDATE SET seq=max(_nilelink_workflow_sequences.seq,excluded.seq-1)+1
    RETURNING seq`).bind(key, ...values).first<{seq:number}>()
  if (!row || !Number.isSafeInteger(row.seq) || row.seq < 1) throw new Error("Reference sequence exhausted")
  return row.seq
}
export async function newCustomerCode(db: D1Binding, year = new Date().getUTCFullYear()) {
  const seq = await reserve(db, `customer:${year}`, "SELECT CAST(json_extract(data,'$.customerSequence') AS INTEGER) AS n FROM customers WHERE json_extract(data,'$.customerYear')=?", [year])
  return { customerCode: `NL${year}${String(seq).padStart(4,"0")}`, customerYear: year, customerSequence: seq }
}
type CustomerSnapshot = { id: string; revision: number; data: Record<string, any> }
/** Refresh the caller's optimistic snapshot when upgrading an imported account. */
export async function ensureCustomerCode(db: D1Binding, customer: CustomerSnapshot): Promise<string> {
  if (taxReferenceKey(customer.data.taxCardNumber)) {
    const reference = taxCustomerReference(customer.data.taxCardNumber)
    if (customer.data.customerCode === reference.customerCode && customer.data.taxReferenceKey === reference.taxReferenceKey) return reference.customerCode
    const guard = crypto.randomUUID(), writeGuard = crypto.randomUUID()
    const patch = { ...reference, ...(customer.data.customerCode && !customer.data.legacyCustomerCode ? { legacyCustomerCode: customer.data.customerCode } : {}) }
    await db.batch([
      db.prepare(`INSERT INTO _nilelink_write_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM customers WHERE id<>? AND (${taxReferenceSql()}=? OR json_extract(data,'$.customerCode')=?)) THEN 0 ELSE 1 END`).bind(guard, customer.id, reference.taxReferenceKey, reference.customerCode),
      db.prepare("UPDATE customers SET data=json_patch(data,?),revision=revision+1 WHERE id=? AND revision=?").bind(JSON.stringify(patch), customer.id, customer.revision),
      db.prepare("INSERT INTO _nilelink_write_guards(id,valid) VALUES(?,changes())").bind(writeGuard),
      db.prepare("DELETE FROM _nilelink_write_guards WHERE id IN (?,?)").bind(guard, writeGuard),
    ])
    customer.data = { ...customer.data, ...patch }; customer.revision++
    return reference.customerCode
  }
  if (typeof customer.data.customerCode === "string" && /^NL\d{8,}$/.test(customer.data.customerCode)) return customer.data.customerCode
  const date = new Date(customer.data.createdAt || Date.now())
  const code = await newCustomerCode(db, Number.isFinite(date.getTime()) ? date.getUTCFullYear() : new Date().getUTCFullYear())
  await db.prepare(`UPDATE customers SET data=json_patch(data,?),revision=revision+1
    WHERE id=? AND json_extract(data,'$.customerCode') IS NULL`).bind(JSON.stringify(code), customer.id).run()
  const row = await db.prepare("SELECT data,revision FROM customers WHERE id=?").bind(customer.id).first<{data:string;revision:number}>()
  if (!row) throw new Error("Customer no longer exists")
  customer.data = JSON.parse(row.data); customer.revision = row.revision
  if (!/^NL\d{8,}$/.test(customer.data.customerCode || "")) throw new Error("Customer reference requires review")
  return customer.data.customerCode
}
export async function newRequestNumber(db: D1Binding, customer: CustomerSnapshot) {
  const customerCode = await ensureCustomerCode(db, customer)
  const requestSequence = await reserve(db, `request:${customer.id}`, "SELECT CAST(json_extract(data,'$.requestSequence') AS INTEGER) AS n FROM customer_requests WHERE customerId=?", [customer.id])
  return { trackingNumber: `${customerCode}-${requestSequence}`, customerCode, requestSequence }
}
export async function newInvoiceReference(db: D1Binding, customer: CustomerSnapshot, request?: {id:string;data:Record<string,any>} | null) {
  const customerCode = await ensureCustomerCode(db, customer)
  if (request && request.data.customerId !== customer.id) throw new Error("Invoice reference customer mismatch")
  const invoiceSequence = await reserve(db, `invoice:${request ? `request:${request.id}` : `customer:${customer.id}`}`,
    `SELECT CAST(json_extract(data,'$.invoiceSequence') AS INTEGER) AS n FROM invoices WHERE customerId=? AND coalesce(json_extract(data,'$.numberingRequestId'),'')=?`, [customer.id, request?.id || ""])
  const requestNumber = request && Number.isSafeInteger(request.data.requestSequence) ? `${customerCode}-${request.data.requestSequence}` : request?.data.trackingNumber
  return { referenceNumber: `${requestNumber || customerCode}-I${invoiceSequence}`, customerCode,
    invoiceSequence, numberingRequestId: request?.id || null }
}

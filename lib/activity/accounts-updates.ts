import type { D1Binding } from "../db/d1"
export async function accountsUpdates(db:D1Binding,seen:{row?:number;at?:string},fallbackAt="") {
  const row=await db.prepare("SELECT coalesce(max(rowid),0) AS latest FROM invoice_activity_logs").first<{latest:number}>()
  const through=row?.latest??0,after=seen.row??0,afterDate=seen.row===undefined?(seen.at??fallbackAt):""
  const predicate="l.rowid>? AND l.rowid<=? AND coalesce(json_extract(l.data,'$.createdAt'),'')>? AND json_extract(l.data,'$.meaningfulChange') IS NOT 0 AND json_extract(i.data,'$.shipmentRecordId') IS NOT NULL"
  const count=await db.prepare(`SELECT count(*) AS total FROM invoice_activity_logs l JOIN invoices i ON i.id=json_extract(l.data,'$.invoiceId') WHERE ${predicate}`).bind(after,through,afterDate).first<{total:number}>()
  const recent=await db.prepare(`SELECT l.rowid AS sequence,l.id,json_extract(l.data,'$.invoiceId') AS invoiceId,json_extract(l.data,'$.action') AS action,json_extract(l.data,'$.actorName') AS actorName,json_extract(l.data,'$.createdAt') AS createdAt,i.invoiceNumber,json_extract(i.data,'$.shipmentRecordId') AS shipmentId FROM invoice_activity_logs l JOIN invoices i ON i.id=json_extract(l.data,'$.invoiceId') WHERE l.rowid<=? AND json_extract(l.data,'$.meaningfulChange') IS NOT 0 AND json_extract(i.data,'$.shipmentRecordId') IS NOT NULL ORDER BY l.rowid DESC LIMIT 20`).bind(through).all()
  return {through,count:count?.total??0,events:recent.results}
}

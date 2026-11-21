import type {D1Binding} from "../db/d1"
import {DEFAULT_CATEGORIES} from "../workflows/default-categories"
import {accountHealth,accountDocumentStats,mandatoryCategoryKeys} from "./account-health"
export async function d1MandatoryKeys(db:D1Binding){
 const row=await db.prepare("SELECT data FROM system_settings WHERE settingKey = ?").bind("global_system_settings").first<{data:string}>()
 const saved=row?JSON.parse(row.data).documentCategories||[]:[]
 return mandatoryCategoryKeys([...DEFAULT_CATEGORIES.filter(c=>!saved.some((s:{key:string})=>s.key===c.key)),...saved])
}
export async function assessD1Customer<T extends {_id:string;[key:string]:any}>(db:D1Binding,customer:T){
 const [result,keys]=await Promise.all([db.prepare("SELECT data FROM documents WHERE customerId = ? AND isArchived = 0").bind(customer._id).all<{data:string}>(),d1MandatoryKeys(db)])
 const documents=result.results.map(row=>JSON.parse(row.data)),health=accountHealth(documents,customer,Date.now(),keys)
 return {documents,health,customer:{...customer,accountStatus:health.status,statusReason:health.reason,healthSource:health.source},stats:accountDocumentStats(documents)}
}

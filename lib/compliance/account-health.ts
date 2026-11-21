import {DEFAULT_CATEGORIES} from "../workflows/default-categories"
export type ComplianceDocument = { _id?: unknown; category?: string; title?: string; status?: string; entityType?: string; documentPurpose?: string; isArchived?: boolean; supersededBy?: unknown; expiryDate?: string|Date|null; doesNotExpire?: boolean; createdAt?: string|Date; reviewedAt?: string|Date }
export type HealthCustomer = {[key:string]:any;accountStatus?: string;statusReason?: string;administrativeHold?: boolean;accountStatusSource?: unknown}
export function isAccountDocument(doc:ComplianceDocument){return !doc.isArchived&&!doc.supersededBy&&doc.entityType!=="CustomerRequest"&&doc.documentPurpose!=="final_shipment"}
/** Date-only documents expire at the end of the named day in Africa/Cairo, including DST. */
export function expiryInstant(doc:ComplianceDocument):number|null {
 if(doc.doesNotExpire)return null
 if(!doc.expiryDate)return null
 const raw=doc.expiryDate instanceof Date?doc.expiryDate.toISOString():doc.expiryDate
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
 const parsed=Date.parse(raw+"T12:00:00Z");if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==raw)return NaN
 const offset=new Intl.DateTimeFormat("en",{timeZone:"Africa/Cairo",timeZoneName:"shortOffset"}).formatToParts(parsed).find(p=>p.type==="timeZoneName")?.value.match(/GMT([+-])(\d+)(?::(\d+))?/)
 const minutes=offset?(offset[1]==="-"?-1:1)*(Number(offset[2])*60+Number(offset[3]||0)):120
 return Date.parse(raw+"T00:00:00Z")+86400000-minutes*60000-1
 }
 return Date.parse(raw)
}
export function complianceState(doc:ComplianceDocument,time=Date.now()):string{
 if(doc.status==="rejected"||doc.status==="pending_review"||!doc.status)return doc.status||"pending_review"
 if(!["approved","expiring_soon","expired"].includes(doc.status))return "pending_review"
 if(doc.doesNotExpire)return "approved"
 const expiry=expiryInstant(doc)
 if(expiry===null)return doc.status==="expired"?"pending_review":"approved"
 if(!Number.isFinite(expiry)||new Date(expiry).getUTCFullYear()>new Date(time).getUTCFullYear()+100)return "pending_review"
 return expiry<=time?"expired":expiry<=time+10*86400000?"expiring_soon":"approved"
}
export function effectiveAccountDocuments<T extends ComplianceDocument>(documents:T[],time=Date.now()):T[]{
 const groups=new Map<string,T[]>()
 for(const doc of documents.filter(isAccountDocument)){const key=doc.category||String(doc._id||"legacy");groups.set(key,[...(groups.get(key)||[]),doc])}
 return [...groups.values()].map(rows=>rows.sort((a,b)=>{
  const rank=(d:T)=>["approved","expiring_soon"].includes(complianceState(d,time))?2:complianceState(d,time)==="pending_review"?1:0
  return rank(b)-rank(a)||(Date.parse(String(b.reviewedAt||b.createdAt||""))||0)-(Date.parse(String(a.reviewedAt||a.createdAt||""))||0)
 })[0])
}
export function accountDocumentStats(documents:ComplianceDocument[],time=Date.now()){
 const all=documents.filter(isAccountDocument),effective=effectiveAccountDocuments(all,time)
 const count=(state:string)=>effective.filter(doc=>complianceState(doc,time)===state).length
 return {totalDocs:all.length,approvedDocs:count("approved"),pendingDocs:all.filter(d=>complianceState(d,time)==="pending_review").length,rejectedDocs:count("rejected"),expiredDocs:count("expired"),expiringDocs:count("expiring_soon")}
}
export function mandatoryCategoryKeys(categories:{key:string;isMandatory?:boolean;isActive?:boolean}[]=DEFAULT_CATEGORIES){return categories.filter(c=>c.isMandatory&&c.isActive!==false).map(c=>c.key)}
export function accountHealth(documents:ComplianceDocument[],customer:HealthCustomer={},time=Date.now(),mandatory=mandatoryCategoryKeys()){
 const all=documents.filter(isAccountDocument),effective=effectiveAccountDocuments(all,time)
 const manualHold=customer.administrativeHold===true||(customer.accountStatus==="inactive"&&customer.accountStatusSource!=="documents")
 if(manualHold)return {status:"inactive" as const,reason:customer.statusReason||"Account restricted by administration.",source:"administrative" as const}
 const required=effective.filter(d=>!d.category||mandatory.includes(d.category))
 const expired=required.find(d=>complianceState(d,time)==="expired"),rejected=required.find(d=>complianceState(d,time)==="rejected")
 if(expired||rejected)return {status:"inactive" as const,reason:`Mandatory document (${(expired||rejected)!.title||"—"}) ${expired?"has expired.":"was rejected."}`,source:"documents" as const}
 const warning=required.find(d=>complianceState(d,time)==="expiring_soon")
 if(warning)return {status:"warning" as const,reason:`${warning.title||warning.category} will expire in ${Math.max(0,Math.ceil((expiryInstant(warning)!-time)/86400000))} days.`,source:"documents" as const}
 const priorApproval=["active","warning"].includes(customer.accountStatus||"")||customer.accountStatusSource==="documents"&&customer.accountStatus==="inactive"
 const covered=mandatory.length>0&&mandatory.every(key=>required.some(d=>d.category===key&&["approved","expiring_soon"].includes(complianceState(d,time))))
 if(covered||priorApproval&&(!required.length||required.every(d=>["approved","expiring_soon"].includes(complianceState(d,time)))))return {status:"active" as const,reason:"All company documents are verified and up to date.",source:"documents" as const}
 if(all.length)return {status:"under_review" as const,reason:"Documents submitted and currently under review by compliance team.",source:"documents" as const}
 return {status:"unverified" as const,reason:"Account is not verified yet. Please upload required documents to begin verification.",source:"documents" as const}
}

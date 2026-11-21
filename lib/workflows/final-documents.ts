import {createHash} from "node:crypto"
import {z} from "zod"
import {type WorkflowStore,type Actor,type WorkflowInput,requireStaff,requireCustomer,own,reject,response,timestamped,now,notification,body} from "./runtime"
import type {WorkflowStorage} from "./documents"
import {canOperateRequest} from "../requests/access"
import {executionServices} from "../requests/execution"
const fileView=(row:any)=>({id:row.id,revision:row.revision,title:row.data.title,fileName:row.data.fileName,mimeType:row.data.mimeType,fileSize:row.data.fileSize,createdAt:row.data.createdAt,fileUrl:`/api/portal/documents/${row.id}/download`})
function signature(bytes:Buffer,type:string){return type==="application/pdf"?bytes.subarray(0,5).toString()==="%PDF-":type==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==="image/webp"?bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP":false}
export async function handleFinalDocuments(store:WorkflowStore,actor:Actor,args:WorkflowInput,storage:WorkflowStorage){
 const admin=args.action.startsWith("admin-"),http=args.request,url=new URL(http.url)
 const parent=args.id?await store.read("customer_requests",args.id):null
 if(!parent)reject(404,"Request not found")
 if(admin){requireStaff(actor.user);if(!canOperateRequest(actor,parent.data))reject(403,"Request access required")}else {requireCustomer(actor);own(actor,parent)}
 const allServices=await Promise.all((parent.data.services||[]).map((id:string)=>store.read("request_services",id)))
 if(allServices.some(s=>!s||s.data.requestId!==parent.id))reject(409,"Service relationship requires review")
 const services=executionServices(allServices.map(s=>s!.data) as any[],parent.data.acceptedServiceIds),completed=parent.data.status==="completed"&&services.length>0&&services.every(s=>s.executionCompleted)
 const rows=await store.list("documents","customerId = ? AND json_extract(data, '$.entityId') = ? AND json_extract(data, '$.documentPurpose') = 'final_shipment' AND isArchived = 0",[parent.data.customerId,parent.id],"createdAt DESC, id DESC")
 if(http.method==="GET")return response({files:rows.map(fileView),completed,canUpload:admin&&completed,canArchive:admin&&actor.user.role==="super_admin",revision:parent.revision,reopened:!completed&&rows.length>0})
 if(!admin)reject(403,"Only authorized staff can upload final documents")
 if(http.headers.get("origin")!==url.origin)reject(403,"Invalid origin")
 if(http.method==="DELETE"){
  if(actor.user.role!=="super_admin")reject(403,"An administrator must archive delivered files")
  const input=z.object({id:z.string(),revision:z.number().int().nonnegative(),reason:z.string().trim().min(3).max(500)}).strict().safeParse(await body(args))
  if(!input.success)reject(400,"An archive reason is required")
  const row=rows.find(row=>row.id===input.data.id);if(!row)reject(404,"Final document not found")
  if(row.revision!==input.data.revision)reject(409,"Document changed. Reload first")
  const event={eventId:crypto.randomUUID(),eventType:"final_document_archived",status:parent.data.status,title:"تم أرشفة مستند نهائي / Final document archived",comment:row.data.title,createdAt:now(),updatedBy:actor.user._id}
  await store.commit({checks:[actor.snapshot],updates:[{before:row,patch:{isArchived:true,archivedAt:now(),archivedBy:actor.user._id,archiveReason:input.data.reason}},{before:parent,patch:{timeline:[...(parent.data.timeline||[]),event]}}],inserts:[{table:"document_activity_logs",data:timestamped({documentId:row.id,customerId:parent.data.customerId,actorId:actor.user._id,actorType:"staff",action:"delete",notes:input.data.reason,newState:{isArchived:true}})}]})
  return response({success:true})
 }
 if(http.method!=="POST")reject(405,"Method not allowed")
 if(!completed)reject(409,"Complete all requested services before uploading final documents")
 const form=await http.formData().catch(()=>reject(400,"Invalid upload form")),files=form.getAll("files"),titles=form.getAll("titles"),batch=String(form.get("batchId")||""),revision=Number(form.get("revision"))
 if(!/^[a-f\d-]{36}$/i.test(batch)||!Number.isSafeInteger(revision)||!files.length||files.length>20)reject(400,"Invalid upload batch or revision")
 let size=0;const prepared=[]
 for(let index=0;index<files.length;index++){
  const file=files[index];if(!(file instanceof File)||file.size<1||file.size>10*1024*1024)reject(400,"Each file must be between 1 byte and 10 MB")
  size+=file.size;if(size>50*1024*1024)reject(400,"Maximum batch size is 50 MB")
  const bytes=Buffer.from(await file.arrayBuffer());if(!signature(bytes,file.type))reject(400,"Use a valid PDF, JPG, PNG or WEBP file")
  const id=createHash("sha256").update(`${parent.id}:${batch}:${index}`).digest("hex").slice(0,24),hash=createHash("sha256").update(bytes).digest("hex"),existing=await store.read("documents",id)
  const title=String(titles[index]||file.name).trim().slice(0,200);if(!title)reject(400,"Document title is required")
  if(existing&&(existing.data.customerId!==parent.data.customerId||existing.data.entityId!==parent.id||existing.data.fileHash!==hash||existing.data.title!==title||existing.data.isArchived))reject(409,"Upload batch already has different files")
  prepared.push({file,bytes,id,hash,title,existing})
 }
 if(prepared.every(item=>item.existing))return response({success:true,replayed:true,revision:parent.revision,files:prepared.map(item=>fileView(item.existing))})
 if(prepared.some(item=>item.existing))reject(409,"Incomplete batch needs reconciliation")
 if(revision!==parent.revision)reject(409,"Request changed. Reload and retry")
 const pending:string[]=[],documents:any[]=[]
 try{
  for(const item of prepared){
   const safe=item.file.name.replace(/[/\\?%*:|"<>\u0000-\u001f]/g,"_").slice(0,100)||"document",key=`clients/${parent.data.customerId}/requests/${parent.id}/final/${item.id}_${safe}`
   await store.db.prepare("INSERT INTO _nilelink_storage_pending(storageKey,ownerId,createdAt) VALUES(?,?,?)").bind(key,actor.user._id,now()).run();pending.push(key)
   const saved=await storage.put(item.bytes,key,item.file.type,{customerId:parent.data.customerId,requestId:parent.id,documentPurpose:"final_shipment"})
   if(saved.fileHash!==item.hash||saved.fileSize!==item.file.size)throw Error("Uploaded file integrity check failed")
   documents.push(timestamped({_id:item.id,customerId:parent.data.customerId,entityType:"CustomerRequest",entityId:parent.id,documentPurpose:"final_shipment",category:"other",title:item.title,fileName:item.file.name,fileSize:item.file.size,mimeType:item.file.type,storageKey:key,fileHash:item.hash,fileUrl:`/api/portal/documents/${item.id}/download`,status:"approved",expiryDate:null,isArchived:false,uploadedBy:actor.user._id,uploadBatchId:batch}))
  }
  const event={eventId:crypto.randomUUID(),eventType:"final_documents_uploaded",status:parent.data.status,title:"تم رفع المستندات النهائية للشحنة / Final shipment documents uploaded",comment:`${documents.length} مستند / document(s)`,createdAt:now(),updatedBy:actor.user._id}
  await store.commit({checks:[actor.snapshot,...allServices.map(s=>s!)],updates:[{before:parent,patch:{finalDocumentsUpdatedAt:now(),timeline:[...(parent.data.timeline||[]),event]}}],inserts:[...documents.map(data=>({table:"documents" as const,data})),...documents.map(doc=>({table:"document_activity_logs" as const,data:timestamped({documentId:doc._id,customerId:parent.data.customerId,actorId:actor.user._id,actorType:"staff",action:"upload",newState:{documentPurpose:"final_shipment",entityId:parent.id,title:doc.title}})})),{table:"notifications",data:notification({recipientCustomerId:parent.data.customerId,targetAudience:"customer",type:"final_documents_uploaded",title:"المستندات النهائية جاهزة / Final documents ready",message:parent.data.trackingNumber,relatedRequestId:parent.id,actionUrl:`/portal/requests/${parent.id}#final-documents`})}],extra:pending.map(key=>store.db.prepare("DELETE FROM _nilelink_storage_pending WHERE storageKey=? AND ownerId=?").bind(key,actor.user._id))})
 }catch(error){
  let committed=false
  try{const references=await Promise.all(documents.map(doc=>store.read("documents",doc._id)));committed=documents.length===prepared.length&&references.every((row,index)=>row!==null&&row.data.fileHash===documents[index].fileHash&&row.data.title===documents[index].title&&row.data.entityId===parent.id&&row.data.customerId===parent.data.customerId);if(!committed)for(const key of pending){const refs=await store.list("documents","storageKey = ?",[key]);if(!refs.length&&await storage.remove(key))await store.db.prepare("DELETE FROM _nilelink_storage_pending WHERE storageKey=? AND ownerId=?").bind(key,actor.user._id).run()}}catch{/* Uncertain storage state stays journalled for reconciliation. */}
  if(!committed)throw error
 }
 return response({success:true,revision:parent.revision+1,files:documents.map(data=>fileView({id:data._id,revision:0,data}))},201)
}

import { z } from "zod"
import type { D1Binding } from "../db/d1"
import { WorkflowStore, actorFor, WorkflowError, reject, timestamped, staff } from "../workflows/runtime"
import type { Actor, Snapshot } from "../workflows/runtime"
import { activityStatement } from "../activity/record"
import { checkRateLimit } from "../auth/rate-limiter"

const headers = { "cache-control":"private, no-store", "x-content-type-options":"nosniff" }
const json = (value:unknown,status=200)=>Response.json(value,{status,headers})
const person = (data:Record<string,any>)=>({id:data._id,name:`${data.firstName||""} ${data.lastName||""}`.trim()||data.username||"User",username:data.username||"",role:data.role,status:data.status})
const memberId = (room:string,user:string)=>`${room}:${user}`
const positive = (value:string|null,fallback=0)=>{
  if(value===null)return fallback
  const parsed=Number(value);if(!Number.isSafeInteger(parsed)||parsed<0)reject(400,"Invalid cursor")
  return parsed
}
async function access(store:WorkflowStore,actor:Actor,id:string) {
  const room=await store.read("chat_conversations",id), member=await store.read("chat_members",memberId(id,actor.user._id))
  if(!room||!member||!member.data.active||(room.data.kind==="group"&&!staff(actor.user)))reject(404,"Conversation not found")
  if(!staff(actor.user)) {
    if(room.data.audience!=="customer")reject(404,"Conversation not found")
    const participants=await people(store,id)
    if(!participants.some(person=>person.role==="staff"||person.role==="super_admin"))reject(404,"Conversation not found")
  }
  return {room,member}
}
async function people(store:WorkflowStore,room:string) {
  const rows=await store.db.prepare("SELECT u.data FROM chat_members m JOIN users u ON u.id=m.userId WHERE m.conversationId=? AND m.active=1 ORDER BY u.id").bind(room).all<{data:string}>()
  return rows.results.map(row=>person(JSON.parse(row.data)))
}
function canManage(actor:Actor,room:Snapshot) {
  return staff(actor.user)&&room.data.kind==="group"&&(room.data.ownerId===actor.user._id||actor.user.role==="super_admin")
}
export async function chatRequest(db:D1Binding,request:Request):Promise<Response> {
  try {
    const store=new WorkflowStore(db),actor=await actorFor(store,request),user=actor.user
    if(user.status!=="active")reject(403,"Account is not active")
    const url=new URL(request.url)
    if(!["GET","POST"].includes(request.method))return json({error:"Method not allowed"},405)
    if(request.method==="POST"&&request.headers.get("origin")!==url.origin)reject(403,"Same-origin request required")
    if(!checkRateLimit(`chat:${user._id}:${request.method}`,{windowMs:60000,maxAttempts:request.method==="POST"?90:240}).allowed)reject(429,"Please slow down")
    if(request.method==="GET") {
      const action=url.searchParams.get("action")||"conversations"
      if(action==="directory") {
        if(!staff(user))reject(403,"Staff access required")
        const q=(url.searchParams.get("q")||"").trim();if(q.length>100)reject(400,"Search is too long")
        const term=`%${q.replace(/[\\%_]/g,c=>"\\"+c)}%`
        const group=url.searchParams.get("group")==="true"
        const rows=await db.prepare(`SELECT json_remove(u.data,'$.passwordHash','$.mailbox') AS data,c.companyName FROM users u LEFT JOIN customers c ON c.id=u.customerId WHERE u.status='active' AND u.id<>? ${group?"AND u.role IN ('staff','super_admin')":""} AND (json_extract(u.data,'$.firstName') LIKE ? ESCAPE '\\' OR json_extract(u.data,'$.lastName') LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR c.companyName LIKE ? ESCAPE '\\') ORDER BY json_extract(u.data,'$.firstName'),u.id LIMIT 50`).bind(user._id,term,term,term,term).all<{data:string;companyName:string}>()
        return json({people:rows.results.map(row=>({...person(JSON.parse(row.data)),company:row.companyName||""}))})
      }
      if(action==="conversations"||action==="unread") {
        const rows=await db.prepare(`SELECT c.data,m.data AS membership,(SELECT count(*) FROM chat_messages msg WHERE msg.conversationId=c.id AND msg.senderId<>? AND msg.sequence>max(coalesce(json_extract(m.data,'$.lastReadSequence'),0),coalesce(json_extract(m.data,'$.joinedSequence'),0))) AS unread FROM chat_members m JOIN chat_conversations c ON c.id=m.conversationId WHERE m.userId=? AND m.active=1 ${staff(user)?"":"AND c.kind='direct' AND json_extract(c.data,'$.audience')='customer' AND EXISTS(SELECT 1 FROM chat_members cm JOIN users u ON u.id=cm.userId WHERE cm.conversationId=c.id AND cm.active=1 AND u.role IN ('staff','super_admin'))"} ORDER BY c.updatedAt DESC,c.id DESC LIMIT 200`).bind(user._id,user._id).all<{data:string;membership:string;unread:number}>()
        if(action==="unread")return json({unread:rows.results.reduce((n,row)=>n+row.unread,0),deliveryReceipts:rows.results.flatMap(row=>{
          const room=JSON.parse(row.data),member=JSON.parse(row.membership)
          return Number(room.lastSequence||0)>Math.max(Number(member.lastDeliveredSequence||0),Number(member.lastReadSequence||0))?[{conversationId:room._id,sequence:room.lastSequence}]:[]
        })})
        const memberRows=await db.prepare(`SELECT m.conversationId,u.data FROM chat_members m JOIN users u ON u.id=m.userId JOIN chat_members mine ON mine.conversationId=m.conversationId AND mine.userId=? AND mine.active=1 JOIN chat_conversations c ON c.id=m.conversationId WHERE m.active=1 ${staff(user)?"":"AND c.kind='direct'"} LIMIT 10000`).bind(user._id).all<{conversationId:string;data:string}>()
        const grouped=new Map<string,ReturnType<typeof person>[]>()
        for(const entry of memberRows.results){const list=grouped.get(entry.conversationId)||[];list.push(person(JSON.parse(entry.data)));grouped.set(entry.conversationId,list)}
        const conversations=rows.results.map(row=>{
          const data=JSON.parse(row.data),members=grouped.get(data._id)||[],other=members.find(p=>p.id!==user._id)
          return {id:data._id,kind:data.kind,title:data.kind==="group"?data.title:other?.name||"Conversation",members,ownerId:data.ownerId,unread:row.unread,lastMessage:data.lastMessage||"",lastSenderId:data.lastSenderId,updatedAt:data.updatedAt,lastSequence:data.lastSequence||0,canManage:canManage(actor,{data} as Snapshot)}
        })
        return json({conversations,user:person(user)})
      }
      if(action==="messages") {
        const id=url.searchParams.get("conversationId")||"",{room}=await access(store,actor,id)
        const after=positive(url.searchParams.get("after")),before=positive(url.searchParams.get("before"))
        if(after&&before)reject(400,"Choose one cursor")
        const rows=await db.prepare(`SELECT data FROM chat_messages WHERE conversationId=? ${after?"AND sequence>?":before?"AND sequence<?":""} ORDER BY sequence ${after?"ASC":"DESC"} LIMIT 50`).bind(id,...(after?[after]:before?[before]:[])).all<{data:string}>()
        const messages=rows.results.map(row=>JSON.parse(row.data));if(!after)messages.reverse()
        const members=await store.list("chat_members","conversationId=?",[id])
        return json({messages,lastSequence:room.data.lastSequence||0,hasMore:messages.length===50,readBy:members.map(m=>({userId:m.data.userId,sequence:m.data.lastReadSequence||0,deliveredSequence:Math.max(m.data.lastDeliveredSequence||0,m.data.lastReadSequence||0)}))})
      }
      reject(400,"Unknown chat action")
    }
    const raw=await request.text();if(raw.length>16000)reject(413,"Message is too large")
    let input;try{input=JSON.parse(raw)}catch{reject(400,"Invalid input")}
    if(!input||typeof input!=="object"||Array.isArray(input))reject(400,"Invalid input")
    if(input.action==="delivered") {
      const parsed=z.object({action:z.literal("delivered"),receipts:z.array(z.object({conversationId:z.string().min(1).max(100),sequence:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict()).min(1).max(50)}).strict().safeParse(input)
      if(!parsed.success||new Set(parsed.data.receipts.map(receipt=>receipt.conversationId)).size!==parsed.data.receipts.length)reject(400,"Invalid delivery receipts")
      const checked=await Promise.all(parsed.data.receipts.map(async receipt=>{
        const {room,member}=await access(store,actor,receipt.conversationId)
        if(receipt.sequence>Number(room.data.lastSequence||0))reject(400,"Unknown delivery sequence")
        return {receipt,member}
      }))
      const changed=checked.filter(({receipt,member})=>receipt.sequence>Math.max(Number(member.data.lastDeliveredSequence||0),Number(member.data.lastReadSequence||0)))
      if(changed.length)await store.commit({checks:[actor.snapshot,...changed.map(value=>value.member)],extra:changed.map(({receipt,member})=>db.prepare("UPDATE chat_members SET data=json_set(data,'$.lastDeliveredSequence',max(coalesce(json_extract(data,'$.lastDeliveredSequence'),0),?)),revision=revision+1 WHERE id=? AND active=1").bind(receipt.sequence,member.id))})
      return json({success:true})
    }
    if(input?.action==="create") {
      if(!staff(user))reject(403,"Only staff can start conversations")
      const parsed=z.object({action:z.literal("create"),kind:z.enum(["direct","group"]),title:z.string().trim().min(2).max(80).optional(),userIds:z.array(z.string().min(1).max(100)).min(1).max(49)}).strict().safeParse(input)
      if(!parsed.success)reject(400,"Invalid conversation")
      const ids=[...new Set([user._id,...parsed.data.userIds])].sort()
      if(parsed.data.kind==="direct"&&ids.length!==2)reject(400,"Direct chat needs two people")
      if(parsed.data.kind==="group"&&(!parsed.data.title||ids.length<2))reject(400,"Group title and members are required")
      const users=await Promise.all(ids.map(id=>store.read("users",id)))
      if(users.some(row=>!row||row.data.status!=="active"||(parsed.data.kind==="group"&&!staff(row.data as any))))reject(400,"Groups can contain active staff only")
      const directKey=parsed.data.kind==="direct"?ids.join(":"):null
      if(directKey){const existing=await store.list("chat_conversations","directKey=?",[directKey]);if(existing.length){await access(store,actor,existing[0].id);return json({id:existing[0].id})}}
      const room=timestamped({kind:parsed.data.kind,audience:users.every(row=>staff(row!.data as any))?"internal":"customer",directKey,title:parsed.data.title||"",ownerId:user._id,lastSequence:0,lastMessage:""})
      try {
        await store.commit({checks:users as Snapshot[],inserts:[{table:"chat_conversations",data:room},...ids.map(id=>({table:"chat_members" as const,data:timestamped({_id:memberId(room._id,id),conversationId:room._id,userId:id,active:true,lastReadSequence:0})}))],extra:[activityStatement(db,{user,action:"chat-create"},{type:"chat",id:room._id,label:room.title||"Private conversation"})]})
      } catch(error) {
        if(directKey){const replay=await store.list("chat_conversations","directKey=?",[directKey]);if(replay.length){await access(store,actor,replay[0].id);return json({id:replay[0].id})}}
        throw error
      }
      return json({id:room._id},201)
    }
    const id=typeof input?.conversationId==="string"?input.conversationId:""
    const {room,member}=await access(store,actor,id)
    if(input.action==="send") {
      const parsed=z.object({action:z.literal("send"),conversationId:z.string(),text:z.string().trim().min(1).max(4000),clientMessageId:z.uuid(),replyTo:z.string().max(150).optional()}).strict().safeParse(input)
      if(!parsed.success)reject(400,"Write a message of up to 4000 characters")
      const data=parsed.data
      const replay=async()=>{
        const rows=await store.list("chat_messages","senderId=? AND clientMessageId=?",[user._id,data.clientMessageId])
        if(!rows.length)return null
        const old=rows[0].data;if(old.conversationId!==id||old.text!==data.text||(old.replyTo?.id||undefined)!==data.replyTo)reject(409,"Retry ID was used for another message")
        return json({message:old,replayed:true})
      }
      const previous=await replay();if(previous)return previous
      let replyTo=null
      if(data.replyTo){const replied=await store.read("chat_messages",data.replyTo);if(!replied||replied.data.conversationId!==id)reject(400,"Reply is outside this conversation");replyTo={id:replied.id,name:replied.data.sender.name,text:String(replied.data.text).slice(0,160)}}
      const members=await people(store,id)
      if(room.data.kind==="direct"&&members.some(p=>p.status!=="active"))reject(409,"The other account is unavailable")
      const message=timestamped({conversationId:id,senderId:user._id,sender:person(user),recipientIds:members.filter(person=>person.id!==user._id).map(person=>person.id),clientMessageId:data.clientMessageId,text:data.text,sequence:Number(room.data.lastSequence||0)+1,replyTo})
      try{await store.commit({checks:[actor.snapshot,member],updates:[{before:room,patch:{lastSequence:message.sequence,lastMessage:data.text.slice(0,120),lastSenderId:user._id}},{before:member,patch:{lastReadSequence:message.sequence}}],inserts:[{table:"chat_messages",data:message}]})}
      catch(error){const previous=await replay();if(previous)return previous;throw error}
      return json({message},201)
    }
    if(input.action==="read") {
      const value=input.sequence;if(!Number.isSafeInteger(value)||value<0||value>Number(room.data.lastSequence||0))reject(400,"Invalid read marker")
      if(value<=Number(member.data.lastReadSequence||0))return json({success:true})
      // SQL max prevents older tabs moving the read marker backwards.
      await store.commit({checks:[actor.snapshot,room,member],extra:[db.prepare("UPDATE chat_members SET data=json_set(data,'$.lastReadSequence',max(coalesce(json_extract(data,'$.lastReadSequence'),0),?),'$.lastDeliveredSequence',max(coalesce(json_extract(data,'$.lastDeliveredSequence'),0),?)),revision=revision+1 WHERE id=? AND active=1").bind(value,value,member.id)]})
      return json({success:true})
    }
    if(input.action==="manage") {
      if(!canManage(actor,room))reject(403,"Only the group owner or a participating administrator can manage this group")
      const parsed=z.object({action:z.literal("manage"),conversationId:z.string(),title:z.string().trim().min(2).max(80).optional(),add:z.array(z.string()).max(49).default([]),remove:z.array(z.string()).max(49).default([])}).strict().safeParse(input)
      if(!parsed.success)reject(400,"Invalid group settings")
      const changes=parsed.data,existing=await store.list("chat_members","conversationId=?",[id])
      if(changes.remove.includes(room.data.ownerId)||changes.remove.some(v=>changes.add.includes(v)))reject(400,"The group owner cannot be removed")
      const additions=await Promise.all([...new Set(changes.add)].map(value=>store.read("users",value)))
      if(additions.some(value=>!value||!staff(value.data as any)||value.data.status!=="active"))reject(400,"Groups can contain active staff only")
      const active=new Set(existing.filter(m=>m.data.active).map(m=>m.data.userId));changes.remove.forEach(v=>active.delete(v));changes.add.forEach(v=>active.add(v));if(active.size>50||active.size<2)reject(400,"A group needs 2 to 50 members")
      const updates=existing.filter(m=>changes.remove.includes(m.data.userId)||changes.add.includes(m.data.userId)).map(m=>({before:m,patch:{active:!changes.remove.includes(m.data.userId),...(!m.data.active?{joinedSequence:room.data.lastSequence||0}:{})}}))
      const inserts=additions.filter(value=>!existing.some(m=>m.data.userId===value!.id)).map(value=>({table:"chat_members" as const,data:timestamped({_id:memberId(id,value!.id),conversationId:id,userId:value!.id,active:true,lastReadSequence:0,joinedSequence:room.data.lastSequence||0})}))
      await store.commit({checks:[actor.snapshot,member,...additions as Snapshot[]],updates:[{before:room,patch:{...(changes.title?{title:changes.title}:{})}},...updates],inserts,extra:[activityStatement(db,{user,action:"chat-group-update"},{type:"chat",id,label:changes.title||room.data.title})]})
      return json({success:true})
    }
    reject(400,"Unknown chat action")
  } catch(error) {return json({error:error instanceof WorkflowError?error.message:"Chat is temporarily unavailable"},error instanceof WorkflowError?error.status:503)}
}

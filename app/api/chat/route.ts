import { getD1 } from "@/lib/db/d1"
import { chatRequest } from "@/lib/chat/handler"
async function handle(request:Request){try{return await chatRequest(await getD1(),request)}catch{return Response.json({error:"Chat unavailable"},{status:503,headers:{"cache-control":"private, no-store"}})}}
export const GET=handle
export const POST=handle

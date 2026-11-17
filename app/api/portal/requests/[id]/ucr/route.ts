import {handleD1Workflow} from "@/lib/workflows/d1-handlers"
import {getDatabaseProvider} from "@/lib/db/provider"
async function handle(request:Request,{params}:{params:Promise<{id:string}>}){
 if(getDatabaseProvider()!=="d1")return Response.json({error:"D1 runtime required"},{status:503})
 return handleD1Workflow({action:"request-ucr",request,id:(await params).id})
}
export {handle as GET,handle as POST}

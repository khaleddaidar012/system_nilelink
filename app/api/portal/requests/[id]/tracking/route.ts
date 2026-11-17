import {handleD1Workflow} from "@/lib/workflows/d1-handlers"
import {getDatabaseProvider} from "@/lib/db/provider"
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 if(getDatabaseProvider()!=="d1")return Response.json({error:"D1 runtime required"},{status:503})
 return handleD1Workflow({action:"request-tracking",request,id:(await params).id})
}

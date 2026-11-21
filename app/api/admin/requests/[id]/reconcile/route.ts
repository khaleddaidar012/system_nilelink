import {handleD1Workflow} from "@/lib/workflows/d1-handlers"
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return handleD1Workflow({action:"admin-request-reconcile",request,id:(await params).id})}

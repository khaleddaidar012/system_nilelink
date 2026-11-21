import {handleD1Workflow} from "@/lib/workflows/d1-handlers"
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return handleD1Workflow({action:"admin-request-agreements",request,id:(await params).id})}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return handleD1Workflow({action:"admin-request-use-agreement",request,id:(await params).id})}

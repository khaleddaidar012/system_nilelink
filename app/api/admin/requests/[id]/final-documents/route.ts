import {handleD1Workflow} from "@/lib/workflows/d1-handlers"
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return handleD1Workflow({action:"admin-request-final-documents",request,id:(await params).id})}
export const POST=GET
export const DELETE=GET

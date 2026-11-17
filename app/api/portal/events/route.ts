import { getDatabaseProvider } from "@/lib/db/provider"
import { getD1 } from "@/lib/db/d1"
import { WorkflowStore, WorkflowError } from "@/lib/workflows/runtime"
import { portalLiveSnapshot } from "@/lib/notifications/live-snapshot"

export const dynamic = "force-dynamic"
/** Bounded D1-backed stream: works across Worker instances; no process-local event bus. */
export async function GET(request: Request) {
  if(getDatabaseProvider()!=="d1")return Response.json({error:"Use polling"},{status:503})
  try {
    const store=new WorkflowStore(await getD1())
    let previous=await portalLiveSnapshot(store,request), stopped=false, timer:ReturnType<typeof setTimeout>|undefined
    let controller:ReadableStreamDefaultController<Uint8Array>
    const encoder=new TextEncoder()
    const close=()=>{if(stopped)return;stopped=true;clearTimeout(timer);request.signal.removeEventListener("abort",close);try{controller.close()}catch{}}
    const stream=new ReadableStream<Uint8Array>({
      start(current){
        controller=current
        const emit=(type:string)=>{if(!stopped)controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({type})}\n\n`))}
        emit("ready");const started=Date.now()
        const tick=async()=>{
          if(stopped)return
          if(Date.now()-started>35000){emit("rotate");close();return}
          try{
            const next=await portalLiveSnapshot(store,request)
            for(const type of Object.keys(next))if(next[type]!==previous[type])emit(type)
            previous=next;emit("ping")
            if(!stopped)timer=setTimeout(tick,5000)
          }catch{emit("auth_or_connection_error");close()}
        }
        request.signal.addEventListener("abort",close,{once:true});if(request.signal.aborted){close();return}
        timer=setTimeout(tick,5000)
      },cancel(){close()},
    })
    return new Response(stream,{headers:{"content-type":"text/event-stream; charset=utf-8","cache-control":"private, no-cache, no-store, no-transform","x-accel-buffering":"no"}})
  }catch(error){return Response.json({error:"Live updates unavailable"},{status:error instanceof WorkflowError?error.status:503})}
}

import {serviceStages,trackingKind} from "./tracking"
export type ExecutableService={_id:string;serviceKey:string;status:string;trackingStages?:ReturnType<typeof serviceStages>;[key:string]:any}
export const serviceSequenceRank=(key:string)=>({road:0,customs:1,sea:2,air:2,other:3})[trackingKind(key)]
export const serviceTheme=(key:string)=>trackingKind(key)==="road"?"border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100":trackingKind(key)==="customs"?"border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100":"border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
export function executionServices<T extends ExecutableService>(services:T[],acceptedIds?:string[]){
 const included=services.filter(s=>s.status!=="cancelled"&&(!Array.isArray(acceptedIds)||acceptedIds.includes(String(s._id)))).sort((a,b)=>serviceSequenceRank(a.serviceKey)-serviceSequenceRank(b.serviceKey))
 return included.map((service,index)=>{
  const previous=included.slice(0,index).find(row=>!executionCompleted(row))
  return {...service,executionOrder:index+1,executionLocked:!!previous,waitingForService:previous?.serviceKey||null,executionCompleted:executionCompleted(service)}
 })
}
export function executionCompleted(service:ExecutableService){return ["completed","done"].includes(service.status)&&serviceStages(service).every(stage=>stage.status==="completed")}

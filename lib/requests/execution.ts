import {serviceColorKey} from "./service-colors"
import {serviceStages,trackingKind} from "./tracking"
export type ExecutableService={_id:string;serviceKey:string;status:string;trackingStages?:ReturnType<typeof serviceStages>;[key:string]:any}
export const serviceSequenceRank=(key:string)=>({road:0,customs:1,sea:2,air:2,other:3})[trackingKind(key)]
export const serviceTheme=(key:string)=>`service-skin service-panel service-${serviceColorKey(key)}`
export function executionServices<T extends ExecutableService>(services:T[],acceptedIds?:string[]){
 const included=services.filter(s=>s.status!=="cancelled"&&(!Array.isArray(acceptedIds)||acceptedIds.includes(String(s._id)))).sort((a,b)=>serviceSequenceRank(a.serviceKey)-serviceSequenceRank(b.serviceKey))
 return included.map((service,index)=>{
  const previous=included.slice(0,index).find(row=>!executionCompleted(row))
  return {...service,executionOrder:index+1,executionLocked:!!previous,waitingForService:previous?.serviceKey||null,executionCompleted:executionCompleted(service)}
 })
}
export function executionCompleted(service:ExecutableService){return ["completed","done"].includes(service.status)&&serviceStages(service).every(stage=>stage.status==="completed")}

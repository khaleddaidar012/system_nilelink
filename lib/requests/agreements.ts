import type {Data} from "../workflows/runtime"
const detailKeys=["origin","destination","containerType","containerSize","containerCount","weight","volume"]
export function agreementMatches(source:Data,target:Data,sourceServices:Data[],targetServices:Data[],quote:Data){
 if(quote.reusableAgreement!==true||!["accepted","partially_accepted"].includes(quote.status)||Date.parse(quote.validUntil)<=Date.now()||!Number.isFinite(Date.parse(quote.validUntil)))return false
 if(source.customerId!==target.customerId||source.operationType!==target.operationType)return false
 const accepted=quote.acceptedServices||sourceServices.map(s=>s.serviceKey)
 return targetServices.length>0&&targetServices.every(service=>{const previous=sourceServices.find(s=>s.serviceKey===service.serviceKey&&accepted.includes(s.serviceKey));return previous&&detailKeys.every(key=>String(previous.details?.[key]??"").trim().toLowerCase()===String(service.details?.[key]??"").trim().toLowerCase())})
}

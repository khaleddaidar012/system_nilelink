export function normaliseContainerCount(value:unknown):number|undefined{
 if(value===undefined||value===null||value==="")return undefined
 const text=String(value).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776))
 if(!/^\d+$/.test(text))throw Error("Container count must be a positive whole number")
 const count=Number(text);if(!Number.isSafeInteger(count)||count<1)throw Error("Container count must be a positive safe integer")
 return count
}
export function requestContainerCount(input:{containerCount?:unknown;details?:any;services?:any[]}):number|undefined{
 const values=[input.containerCount,input.details?.containerCount,...(input.services||[]).map(s=>s.details?.containerCount)].filter(v=>v!==undefined&&v!==null&&v!=="").map(normaliseContainerCount)
 if(new Set(values).size>1)throw Error("One shipment cannot have conflicting container counts")
 return values[0]
}

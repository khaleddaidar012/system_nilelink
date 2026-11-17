export interface MemberReceipt { userId:string; sequence:number; deliveredSequence?:number }
export function messageReceipt(sequence:number,senderId:string,receipts:MemberReceipt[],recipientIds?:string[]):"sent"|"delivered"|"read" {
  const recipients=recipientIds ?? receipts.filter(value=>value.userId!==senderId).map(value=>value.userId)
  if(!recipients.length)return "sent"
  const byUser=new Map(receipts.map(value=>[value.userId,value]))
  if(recipients.every(id=>(byUser.get(id)?.sequence||0)>=sequence))return "read"
  if(recipients.every(id=>Math.max(byUser.get(id)?.deliveredSequence||0,byUser.get(id)?.sequence||0)>=sequence))return "delivered"
  return "sent"
}

"use client"
import { useEffect } from "react"

/** Mounted for the account, so delivery doesn't require opening its chat page. */
export function ChatDeliveryObserver(){
  useEffect(()=>{
    const controller=new AbortController();let busy=false
    const refresh=async()=>{
      if(busy||!navigator.onLine)return
      busy=true
      try{
        const result=await fetch('/api/chat?action=unread',{cache:'no-store',signal:controller.signal})
        if(!result.ok)return
        const data=await result.json()
        if(controller.signal.aborted)return
        window.dispatchEvent(new CustomEvent('chat-unread-count',{detail:{unread:data.unread}}))
        const receipts=data.deliveryReceipts||[]
        for(let offset=0;offset<receipts.length;offset+=50){
          const ack=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delivered',receipts:receipts.slice(offset,offset+50)}),signal:controller.signal})
          if(!ack.ok)break
        }
      }catch{/* No acknowledgement means messages remain unconfirmed; next poll retries. */}
      finally{busy=false}
    }
    void refresh();const timer=setInterval(refresh,10000)
    window.addEventListener('chat-updated',refresh);window.addEventListener('online',refresh);window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('chat-updated',refresh);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },[])
  return null
}

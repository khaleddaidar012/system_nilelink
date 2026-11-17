"use client"
import { useEffect, useRef, useState } from "react"
export const portalLiveEvent = "nilelink:portal-live"
export type LiveStatus = "connecting" | "live" | "polling" | "offline" | "paused"
export function usePortalLiveRefresh(refresh:()=>void, types: string[]) {
  const latest=useRef(refresh), filters=useRef(types)
  useEffect(()=>{latest.current=refresh;filters.current=types},[refresh,types])
  useEffect(()=>{const listener=(event:Event)=>{const type=(event as CustomEvent<string>).detail;if(type==="all"||filters.current.includes(type))latest.current()};window.addEventListener(portalLiveEvent,listener);return()=>window.removeEventListener(portalLiveEvent,listener)},[])
}
export function useLiveUpdates(enabled:boolean,onUpdate:()=>void) {
  const [status,setStatus]=useState<LiveStatus>("connecting"),latest=useRef(onUpdate)
  useEffect(()=>{latest.current=onUpdate},[onUpdate])
  useEffect(()=>{
    if(!enabled)return
    let source:EventSource|null=null,retry:ReturnType<typeof setTimeout>|undefined,poll:ReturnType<typeof setInterval>|undefined,failures=0,disposed=false
    const broadcast=(type:string)=>{latest.current();window.dispatchEvent(new CustomEvent(portalLiveEvent,{detail:type}))}
    const stop=()=>{source?.close();source=null;clearTimeout(retry);clearInterval(poll)}
    const fallback=()=>{setStatus(navigator.onLine?"polling":"offline");clearInterval(poll);poll=setInterval(()=>{if(!document.hidden&&navigator.onLine)broadcast("all")},30000);retry=setTimeout(connect,60000)}
    const connect=()=>{
      stop();if(disposed)return
      if(document.hidden){setStatus("paused");return}
      if(!navigator.onLine){fallback();return}
      setStatus("connecting")
      if(typeof EventSource==="undefined"){fallback();return}
      source=new EventSource("/api/portal/events")
      source.addEventListener("ready",()=>{failures=0;setStatus("live")})
      for(const type of ["notification","document_updated","quote_updated","request_updated","account_updated"])source.addEventListener(type,()=>broadcast(type))
      source.addEventListener("rotate",()=>{source?.close();retry=setTimeout(connect,500)})
      const failed=()=>{source?.close();if(disposed)return;if(++failures>=3){fallback();return};setStatus("connecting");retry=setTimeout(connect,Math.min(1000*2**failures,15000))}
      source.addEventListener("auth_or_connection_error",failed);source.onerror=failed
    }
    const resume=()=>{if(document.hidden){stop();setStatus("paused")}else{broadcast("all");connect()}}
    document.addEventListener("visibilitychange",resume);window.addEventListener("online",resume);window.addEventListener("offline",resume)
    connect()
    return()=>{disposed=true;stop();document.removeEventListener("visibilitychange",resume);window.removeEventListener("online",resume);window.removeEventListener("offline",resume)}
  },[enabled])
  return status
}

"use client"
import { useLocale } from "next-intl"
import { PortalHeader } from "@/components/portal/PortalHeader"
import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
export default function ChatPage(){const ar=useLocale()==="ar";return <div><PortalHeader title={ar?"المحادثات":"Messages"}/><ChatWorkspace portal/></div>}

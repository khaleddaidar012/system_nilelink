"use client"
import { useLocale } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
export default function ChatPage(){const ar=useLocale()==="ar";return <div><AdminHeader title={ar?"المحادثات":"Messages"}/><ChatWorkspace/></div>}

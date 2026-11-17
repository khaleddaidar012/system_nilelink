"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "@/navigation"

const WorkspaceContext = createContext<Record<string, number>>({})
export const useWorkspaceCounts = () => useContext(WorkspaceContext)

export function WorkspaceActivity({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    let disposed = false
    let busy = false
    const section = pathname.replace(/^\/admin\/?/, "").replace(/\/$/, "")
    const key = section.startsWith("shipment-invoices") ? "shipment-invoices" : section.startsWith("documents/review") ? "documents/review" : section.startsWith("system/backups") ? "system/backups" : section.split("/")[0]
    const refresh = async () => {
      if (disposed || busy || document.hidden) return
      busy = true
      try {
        const res = await fetch("/api/admin/workspace-activity", { cache: "no-store" })
        if (res.ok) { const data = await res.json(); if (!disposed) setCounts(data.counts || {}) }
      } finally { busy = false }
    }
    if (key && key !== "shipment-invoices") {
      // Runs after the destination mounts, including direct links and sidebar navigation.
      void fetch("/api/admin/workspace-activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: key }) })
        .then(res => { if (res.ok && !disposed) setCounts(previous => ({ ...previous, [key]: 0 })) }).catch(() => {})
    }
    void refresh().catch(() => {})
    const poll = () => { void refresh().catch(() => {}) }
    const timer = window.setInterval(poll, 30000)
    window.addEventListener("focus", poll)
    document.addEventListener("visibilitychange", poll)
    window.addEventListener("nilelink-workspace-updates",poll)
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("focus", poll); document.removeEventListener("visibilitychange", poll);window.removeEventListener("nilelink-workspace-updates",poll) }
  }, [pathname])
  return <WorkspaceContext.Provider value={counts}>{children}</WorkspaceContext.Provider>
}

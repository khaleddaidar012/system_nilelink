"use client"

import { cn } from "@/lib/utils"

export type LiveSystemStatus = "healthy" | "degraded" | "offline" | "unknown"

interface LiveStatusDotProps {
  status: LiveSystemStatus
  className?: string
}

/**
 * Minimal Live Status Indicator Dot:
 * - healthy: small green dot with subtle 3s pulse halo
 * - degraded: amber dot with slower, softer 4s pulse halo
 * - offline: solid red dot (no pulse)
 * - unknown: static neutral gray dot
 *
 * Supports prefers-reduced-motion via CSS.
 */
export function LiveStatusDot({ status, className }: LiveStatusDotProps) {
  return (
    <span className={cn("relative flex h-2 w-2 items-center justify-center shrink-0", className)} aria-hidden="true">
      {status === "healthy" && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-status-healthy" />
      )}
      {status === "degraded" && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 animate-status-degraded" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full transition-colors",
          status === "healthy" && "bg-emerald-500",
          status === "degraded" && "bg-amber-500",
          status === "offline" && "bg-rose-500",
          status === "unknown" && "bg-slate-400"
        )}
      />
    </span>
  )
}

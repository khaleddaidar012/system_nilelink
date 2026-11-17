"use client"

export function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="h-16 w-full rounded-2xl bg-secondary-100 dark:bg-slate-800/60" />

      {/* Top 3 KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-48 rounded-2xl bg-secondary-100 dark:bg-slate-800/60" />
        <div className="h-48 rounded-2xl bg-secondary-100 dark:bg-slate-800/60" />
        <div className="h-48 rounded-2xl bg-secondary-100 dark:bg-slate-800/60" />
      </div>

      {/* Lower Details Grid Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-2xl bg-secondary-100 dark:bg-slate-800/60 lg:col-span-2" />
        <div className="h-80 rounded-2xl bg-secondary-100 dark:bg-slate-800/60" />
      </div>
    </div>
  )
}

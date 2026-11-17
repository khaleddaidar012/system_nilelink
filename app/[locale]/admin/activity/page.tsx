"use client"
import { useLocale } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { ActivityLog } from "@/components/admin/activity/ActivityLog"
export default function ActivityPage() {
  const ar = useLocale() === "ar"
  return <div><AdminHeader title={ar?"سجل الحركات":"Activity log"} subtitle={ar?"متابعة أنشطة العملاء وفريق العمل":"Customer and team activity"}/><ActivityLog/></div>
}

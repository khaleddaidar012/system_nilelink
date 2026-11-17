import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/token-service"
import { BackupsManager } from "@/components/admin/system/backups/BackupsManager"
import { D1BackupsManager } from "@/components/admin/system/backups/D1BackupsManager"
import { getDatabaseProvider } from "@/lib/db/provider"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ locale: string }>
}

export default async function AdminBackupsPage({ params }: Props) {
  const { locale } = await params
  const session = await getServerSession()
  if (!session) redirect(`/${locale}/login?callbackUrl=/${locale}/admin/system/backups`)

  const allowed = session.role === "super_admin" || (session.role === "staff" && session.staffPermissions?.canManageBackups === true)
  if (!allowed) redirect(`/${locale}/admin`)

  return getDatabaseProvider() === "d1" ? <D1BackupsManager /> : <BackupsManager />
}

import { getDatabaseProvider } from "@/lib/db/provider"
import { getD1 } from "@/lib/db/d1"
import { handleD1BackupInventory } from "@/lib/backup/d1-inventory"
import { handleD1BackupCreate } from "@/lib/backup/d1-create"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    if (getDatabaseProvider() !== "d1") return Response.json({ error: "Not found" }, { status: 404 })
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { env } = await getCloudflareContext({ async: true })
    const bindings = env as unknown as { D1_BACKUPS?: Parameters<typeof handleD1BackupInventory>[2]; D1_BACKUP_SCOPE?: string; D1_BACKUP_CREATE_ENABLED?: string; D1_BACKUP_RUNNER?: unknown }
    const response = await handleD1BackupInventory(request, await getD1(), bindings.D1_BACKUPS, bindings.D1_BACKUP_SCOPE)
    if (!response.ok) return response
    return Response.json({ ...await response.json(), canCreate: bindings.D1_BACKUP_CREATE_ENABLED === "true" && !!bindings.D1_BACKUP_RUNNER }, { headers: { "cache-control": "private, no-store" } })
  } catch { return Response.json({ error: "Backup inventory unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } }) }
}
export async function POST(request: Request) {
  try {
    if (getDatabaseProvider() !== "d1") return Response.json({ error: "Not found" }, { status: 404 })
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { env } = await getCloudflareContext({ async: true })
    const bindings = env as unknown as { D1_BACKUP_RUNNER?: Parameters<typeof handleD1BackupCreate>[2]["runner"]; D1_BACKUP_TRIGGER_KEY?: string; D1_BACKUP_CREATE_ENABLED?: string; D1_BACKUP_SCOPE?: string }
    return handleD1BackupCreate(request, await getD1(), { runner: bindings.D1_BACKUP_RUNNER, triggerKey: bindings.D1_BACKUP_TRIGGER_KEY, enabled: bindings.D1_BACKUP_CREATE_ENABLED, scope: bindings.D1_BACKUP_SCOPE })
  } catch { return Response.json({ error: "Backup creation unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } }) }
}

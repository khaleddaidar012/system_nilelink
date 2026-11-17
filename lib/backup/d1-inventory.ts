import { WorkflowStore, actorFor } from "../workflows/runtime"
import type { D1Binding } from "../db/d1"

interface BackupBucket {
  list(options: { prefix: string; limit: number; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>
  get(key: string): Promise<{ size: number; json(): Promise<unknown> } | null>
  head(key: string): Promise<{ size: number; customMetadata?: Record<string, string> } | null>
}
const headers = { "cache-control": "private, no-store" }
const uuid = "[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}"
const markerPattern = new RegExp(`^staging-backups/(${uuid})\\.complete\\.json$`)
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max

/** Metadata only. Never returns ciphertext, object keys, hashes or encryption/trigger credentials. */
export async function handleD1BackupInventory(request: Request, db: D1Binding, bucket?: BackupBucket, scope?: string) {
  try {
    const { user } = await actorFor(new WorkflowStore(db), request)
    if (user.status !== "active" || !(user.role === "super_admin" || (user.role === "staff" && user.staffPermissions?.canManageBackups === true))) return Response.json({ error: "Forbidden" }, { status: 403, headers })
    if (!bucket || !["baseline-staging", "first-launch"].includes(scope || "")) return Response.json({ error: "D1 backup inventory is not configured", code: "D1_BACKUP_INVENTORY_UNAVAILABLE" }, { status: 503, headers })
    const url = new URL(request.url), cursor = url.searchParams.get("cursor") || undefined
    if ([...url.searchParams.keys()].some(k => k !== "cursor") || (cursor && cursor.length > 2048)) return Response.json({ error: "Invalid query" }, { status: 400, headers })
    const page = await bucket.list({ prefix: "staging-backups/", limit: 50, ...(cursor ? { cursor } : {}) })
    const items = []
    for (const object of page.objects) {
      const match = markerPattern.exec(object.key)
      if (!match) continue
      const stored = await bucket.get(object.key)
      if (!stored || stored.size > 4096) throw new Error("Invalid marker")
      const receipt = await stored.json() as Record<string, unknown>
      const id = match[1]
      if (receipt.format !== "nilelink-backup-receipt-v1" || receipt.id !== id || receipt.objectKey !== `staging-backups/${id}.aesgcm` || typeof receipt.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.sha256) || !integer(receipt.encryptedBytes, 64 * 1024 * 1024) || (receipt.tables !== 23 && receipt.tables !== 26 && receipt.tables !== 27) || !integer(receipt.records, 5000) || !integer(receipt.files, 5000) || !integer(receipt.omittedFiles, 5000) || typeof receipt.verifiedAt !== "string" || !Number.isFinite(Date.parse(receipt.verifiedAt)) || (receipt.trigger !== undefined && receipt.trigger !== "manual" && receipt.trigger !== "scheduled")) throw new Error("Invalid receipt")
      const data = await bucket.head(String(receipt.objectKey))
      const available = data?.size === receipt.encryptedBytes && data?.customMetadata?.sha256 === receipt.sha256
      items.push({ id, verifiedAt: receipt.verifiedAt, trigger: receipt.trigger ?? "unknown", records: receipt.records, files: receipt.files, omittedFiles: receipt.omittedFiles,
        encryptedBytes: receipt.encryptedBytes, status: available ? "stored" : "unavailable" })
    }
    items.sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt))
    return Response.json({ provider: "d1", scope, readOnly: true, items, nextCursor: page.truncated ? page.cursor : null,
      verification: "receipt-and-object-metadata-only", checkedAt: new Date().toISOString() }, { headers })
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && [401, 403].includes(Number(error.status)) ? Number(error.status) : 503
    return Response.json({ error: status === 401 ? "Authentication required" : status === 403 ? "Forbidden" : "Backup inventory unavailable" }, { status, headers })
  }
}

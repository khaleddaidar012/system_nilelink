import { createHash } from "node:crypto"
import { WorkflowStore, actorFor, timestamped } from "../workflows/runtime"
import type { D1Binding } from "../db/d1"

interface Runner { fetch(request: Request): Promise<Response> }
interface Options { runner?: Runner; triggerKey?: string; enabled?: string; scope?: string }
const headers = { "cache-control": "private, no-store" }
export async function handleD1BackupCreate(request: Request, db: D1Binding, options: Options) {
  try {
    const store = new WorkflowStore(db), { user } = await actorFor(store, request)
    if (user.status !== "active" || !(user.role === "super_admin" || (user.role === "staff" && user.staffPermissions?.canManageBackups === true))) return Response.json({ error: "Forbidden" }, { status: 403, headers })
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Same-origin request required" }, { status: 403, headers })
    if (!options.runner || options.enabled !== "true" || !["baseline-staging", "first-launch"].includes(options.scope || "") || !/^[a-f0-9]{64}$/.test(options.triggerKey || "")) return Response.json({ error: "Backup creation is not configured" }, { status: 503, headers })
    const text = await request.text()
    if (text.length > 1024) return Response.json({ error: "Invalid request" }, { status: 400, headers })
    let body
    try { body = JSON.parse(text) } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers }) }
    if (!body || Object.keys(body).length !== 1 || typeof body.requestId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.requestId)) return Response.json({ error: "Invalid request" }, { status: 400, headers })
    const requestId = body.requestId
    const auditId = createHash("sha256").update(`backup:${user._id}:${requestId}`).digest("hex").slice(0, 24)
    const prior = await store.read("system_audit_logs", auditId)
    if (prior && (prior.data.actorId !== user._id || prior.data.requestId !== requestId)) return Response.json({ error: "Audit conflict" }, { status: 409, headers })
    if (!prior) {
      const data = timestamped({ _id: auditId, event: "D1_BACKUP_REQUESTED", jobId: `d1-backup-${auditId}`, actorId: user._id, requestId, scope: options.scope })
      await db.prepare("INSERT INTO system_audit_logs(id,data) VALUES(?,?) ON CONFLICT(id) DO NOTHING").bind(auditId, JSON.stringify(data)).run()
      const saved = await store.read("system_audit_logs", auditId)
      if (saved?.data.actorId !== user._id || saved?.data.requestId !== requestId) throw new Error("Audit not persisted")
    }
    // Fixed service binding destination. No caller supplied endpoint, key or source.
    const response = await options.runner.fetch(new Request("https://backup.internal/run", { method: "POST", headers: { authorization: "Bearer " + options.triggerKey, "idempotency-key": requestId, "x-nilelink-actor": user._id }, signal: AbortSignal.timeout(120000) }))
    const result = await response.json() as { requestId?: string; state?: string; receipt?: { id?: string; records?: number; files?: number } }
    if (result.requestId !== requestId || !["completed", "processing", "uncertain", "rate_limited"].includes(result.state || "")) throw new Error("Unknown runner result")
    if (result.state === "completed" && (typeof result.receipt?.id !== "string" || !Number.isSafeInteger(result.receipt.records) || !Number.isSafeInteger(result.receipt.files))) throw new Error("Incomplete receipt")
    const status = result.state === "completed" ? 200 : result.state === "processing" ? 202 : result.state === "rate_limited" ? 429 : 409
    return Response.json({ requestId, state: result.state, ...(result.state === "completed" ? { backup: { id: result.receipt?.id, records: result.receipt?.records, files: result.receipt?.files } } : {}) }, { status, headers })
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && [401, 403].includes(Number(error.status)) ? Number(error.status) : 503
    return Response.json({ error: status === 401 ? "Authentication required" : status === 403 ? "Forbidden" : "Backup outcome unavailable; retry only with the same request ID" }, { status, headers })
  }
}

import type { D1Binding, D1Value } from "../db/d1"
import { actorFor, WorkflowStore, requireStaff, WorkflowError } from "../workflows/runtime"

export async function activityFeed(db: D1Binding, request: Request): Promise<Response> {
  const headers = { "cache-control": "private, no-store" }
  try {
    const { user } = await actorFor(new WorkflowStore(db), request)
    requireStaff(user)
    if (user.status !== "active") return Response.json({ error: "Forbidden" }, { status: 403, headers })
    const params = new URL(request.url).searchParams
    if (params.get("from") && params.get("to") && params.get("from")! > params.get("to")!) throw new WorkflowError(400, "Invalid date range")
    const page = Number(params.get("page") || 1), limit = 30
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new WorkflowError(400, "Invalid page")
    const where = ["json_extract(data,'$.activityVersion')=1"]
    const values: D1Value[] = []
    const q = (params.get("q") || "").trim()
    if (q.length > 120) throw new WorkflowError(400, "Search is too long")
    if (q) {
      where.push("(json_extract(data,'$.actor.name') LIKE ? ESCAPE '\\' OR json_extract(data,'$.actor.username') LIKE ? ESCAPE '\\' OR json_extract(data,'$.target.label') LIKE ? ESCAPE '\\' OR json_extract(data,'$.target.id') LIKE ? ESCAPE '\\')")
      const term = `%${q.replace(/[\\%_]/g, value => "\\" + value)}%`
      values.push(term, term, term, term)
    }
    const category = params.get("category") || ""
    if (category) {
      if (!["create", "update", "delete", "upload", "download", "login", "send"].includes(category)) throw new WorkflowError(400, "Invalid category")
      where.push("json_extract(data,'$.category')=?"); values.push(category)
    }
    const role = params.get("role") || ""
    if (role) {
      if (!["customer", "staff", "super_admin"].includes(role)) throw new WorkflowError(400, "Invalid role")
      where.push(role === "customer" ? "json_extract(data,'$.actor.role') IN ('customer','customer_admin')" : "json_extract(data,'$.actor.role')=?")
      if (role !== "customer") values.push(role)
    }
    for (const key of ["from", "to"]) {
      const date = params.get(key)
      if (!date) continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new WorkflowError(400, "Invalid date")
      // Cairo business dates, independent of the visitor's timezone.
      const { cairoDayBoundary } = await import("./time")
      const bound = cairoDayBoundary(date, key === "to")
      where.push(`createdAt ${key === "from" ? ">=" : "<"} ?`); values.push(bound)
    }
    const predicate = where.join(" AND ")
    const [count, rows] = await Promise.all([
      db.prepare(`SELECT count(*) AS total FROM system_audit_logs WHERE ${predicate}`).bind(...values).first<{total:number}>(),
      db.prepare(`SELECT data FROM system_audit_logs WHERE ${predicate} ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,limit,(page-1)*limit).all<{data:string}>(),
    ])
    // Explicit public shape: never expose raw audit documents or unrelated logs.
    const events = rows.results.map(row => {
      const data = JSON.parse(row.data)
      return { id: data._id, createdAt: data.createdAt, action: data.action, category: data.category, actor: data.actor, target: data.target, changedFields: data.changedFields || [] }
    })
    return Response.json({ events, total: count?.total || 0, page, pages: Math.max(1, Math.ceil((count?.total || 0)/limit)) }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof WorkflowError ? error.message : "Activity log unavailable" }, { status: error instanceof WorkflowError ? error.status : 503, headers })
  }
}

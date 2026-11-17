import { getD1 } from "@/lib/db/d1"
import { workspaceActivity } from "@/lib/activity/workspace"
export const dynamic = "force-dynamic"
async function handle(request: Request) {
  try { return await workspaceActivity(await getD1(), request) }
  catch { return Response.json({ error: "Workspace updates unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } }) }
}
export const GET = handle
export const POST = handle

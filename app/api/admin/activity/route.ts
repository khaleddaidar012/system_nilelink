import { getD1 } from "@/lib/db/d1"
import { activityFeed } from "@/lib/activity/query"
export async function GET(request: Request) {
  try { return await activityFeed(await getD1(), request) }
  catch { return Response.json({ error: "Activity log unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } }) }
}

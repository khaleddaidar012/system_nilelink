import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
type Context = { params: Promise<{ id: string }> }
export const dynamic = "force-dynamic"
async function handle(request: Request, context: Context) {
  const response = await handleD1Workflow({ action: "admin-request-workflow", request, id: (await context.params).id })
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
export const GET = handle
export const POST = handle

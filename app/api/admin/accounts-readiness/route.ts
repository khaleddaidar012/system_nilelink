import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const response = await handleD1Workflow({ action: "accounts-readiness-list", request })
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

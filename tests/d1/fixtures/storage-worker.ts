import { createR2PreviewStorage } from "../../../lib/storage/r2-preview-storage"
import type { PreviewStorageBindings } from "../../../lib/storage/r2-preview-storage"

// Test-only entry point, never included in the application's route tree.
const worker = {
  async fetch(request: Request, env: PreviewStorageBindings) {
    try {
      const key = new URL(request.url).searchParams.get("key") || ""
      const storage = createR2PreviewStorage(env)
      if (request.method === "PUT") return Response.json(await storage.put(Buffer.from(await request.arrayBuffer()), key, request.headers.get("content-type") || "application/octet-stream", {}))
      if (request.method === "DELETE") return Response.json({ removed: await storage.remove(key) })
      const result = await storage.get(key)
      return new Response(result.body as BodyInit, { headers: { "Content-Type": result.contentType } })
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Storage failure" }, { status: 409 }) }
  },
}

export default worker

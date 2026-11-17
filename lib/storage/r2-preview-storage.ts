import { createHash } from "node:crypto"
import { validatePreviewKey } from "./preview-key"
import { PREVIEW_OBJECT_PREFIX as prefix } from "./preview-object-prefix.mjs"
import type { WorkflowStorage } from "../workflows/documents"

interface StoredObject {
  size: number
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
  arrayBuffer(): Promise<ArrayBuffer>
}
interface ReadBucket { get(key: string): Promise<StoredObject | null> }
interface PreviewBucket extends ReadBucket {
  put(key: string, value: Uint8Array, options: { onlyIf: { etagDoesNotMatch: string }; customMetadata: Record<string, string>; httpMetadata: { contentType: string } }): Promise<unknown | null>
  delete(key: string): Promise<void>
}
export interface PreviewStorageBindings { D1_PREVIEW_FILES?: PreviewBucket; D1_SOURCE_FILES?: ReadBucket }

/** A distinct destination binding is mandatory; the source capability is read-only. */
export function createR2PreviewStorage(env: PreviewStorageBindings): WorkflowStorage {
  const bucket = env.D1_PREVIEW_FILES, source = env.D1_SOURCE_FILES
  if (!bucket) throw new Error("D1_PREVIEW_FILES binding is required for r2-preview storage")
  if (bucket === source) throw new Error("Preview and source storage bindings must be distinct")
  return {
    async put(bytes, key, mime) {
      validatePreviewKey(key)
      const fileHash = createHash("sha256").update(bytes).digest("hex")
      // The precondition belongs to the write, not a separate head-then-put race.
      const result = await bucket.put(prefix + key, bytes, { onlyIf: { etagDoesNotMatch: "*" }, customMetadata: { sha256: fileHash }, httpMetadata: { contentType: mime } })
      if (result === null) throw new Error("Preview object already exists (EEXIST)")
      return { fileHash, fileSize: bytes.length }
    },
    async get(key) {
      validatePreviewKey(key)
      const preview = await bucket.get(prefix + key)
      // Errors and corrupt preview objects never fall back to a source version.
      const object = preview ?? await source?.get(key)
      if (!object) throw new Error("Document object not found in preview or configured source storage")
      if (!Number.isSafeInteger(object.size) || object.size < 0 || object.size > 10 * 1024 * 1024) throw new Error("Stored document size requires review")
      const bytes = Buffer.from(await object.arrayBuffer())
      if (bytes.length !== object.size) throw new Error("Stored document size mismatch")
      if (preview && (!object.customMetadata?.sha256 || createHash("sha256").update(bytes).digest("hex") !== object.customMetadata.sha256)) throw new Error("Preview object integrity mismatch")
      return { body: bytes, contentType: object.httpMetadata?.contentType || "application/octet-stream", contentLength: bytes.length }
    },
    async remove(key) {
      validatePreviewKey(key)
      await bucket.delete(prefix + key)
      return true
    },
  }
}

export async function getR2PreviewStorage(): Promise<WorkflowStorage> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare")
  const { env } = await getCloudflareContext({ async: true })
  return createR2PreviewStorage(env as unknown as PreviewStorageBindings)
}

import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { validatePreviewKey } from "./preview-key"

async function r2Storage() {
  const mode = process.env.D1_STORAGE_MODE || "local"
  if (mode === "local") return null
  if (mode !== "r2-preview") throw new Error("Invalid D1_STORAGE_MODE")
  return (await import("./r2-preview-storage")).getR2PreviewStorage()
}

/** New preview uploads never write to or delete from the current R2 bucket. */
function previewFile(key: string): string {
  validatePreviewKey(key)
  if (!key || key.includes("\\") || key.includes(":") || key.includes("\0") || key.split("/").some(part => part === ".." || part === ".") || path.isAbsolute(key)) throw new Error("Invalid preview storage key")
  const root = path.resolve(process.cwd(), ".private", "d1-preview-files")
  const file = path.resolve(root, key)
  if (!file.startsWith(root + path.sep)) throw new Error("Preview storage path escapes its root")
  return file
}
export async function putPreviewFile(bytes: Buffer, key: string, mime = "application/octet-stream"): Promise<{ fileHash: string; fileSize: number }> {
  const storage = await r2Storage()
  if (storage) return storage.put(bytes, key, mime, {})
  const file = previewFile(key)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 })
  return { fileHash: createHash("sha256").update(bytes).digest("hex"), fileSize: bytes.length }
}
export async function readPreviewOrSourceFile(key: string) {
  const storage = await r2Storage()
  if (storage) return storage.get(key)
  try {
    const bytes = await fs.readFile(previewFile(key))
    return { body: bytes, contentType: "application/octet-stream", contentLength: bytes.length }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
    // Existing imported keys are read using the original storage gateway.
    // There is deliberately no write/delete fallback to source storage.
    return (await import("./r2-storage")).getFileStreamFromR2(key)
  }
}
export async function removePreviewFile(key: string): Promise<boolean> {
  const storage = await r2Storage()
  if (storage) return storage.remove(key)
  try { await fs.unlink(previewFile(key)); return true } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT"
  }
}

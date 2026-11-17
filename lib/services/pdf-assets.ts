import fs from "node:fs/promises"
import path from "node:path"

export interface PdfAssets { regular: Buffer; bold: Buffer; logo?: Buffer }
export interface PdfAssetBinding { fetch(input: string): Promise<Response> }

/** Fixed asset paths only: never fetch a URL supplied by a customer or invoice. */
export async function loadPdfAssetsFromBinding(binding: PdfAssetBinding): Promise<PdfAssets> {
  const read = async (name: string, font: boolean) => {
    const response = await binding.fetch("https://assets.local/" + name)
    if (!response.ok) throw new Error("Required PDF asset is unavailable: " + name)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Invalid PDF asset size: " + name)
    const signature = bytes.subarray(0, 4).toString("hex")
    if (font && signature !== "00010000" && signature !== "4f54544f") throw new Error("Invalid PDF font: " + name)
    if (!font && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Invalid PDF logo")
    return bytes
  }
  const [regular, bold, logo] = await Promise.all([read("fonts/Amiri-Regular.ttf", true), read("fonts/Amiri-Bold.ttf", true), read("images/logo.png", false)])
  return { regular, bold, logo }
}

export async function getPdfAssets(): Promise<PdfAssets> {
  const mode = process.env.PDF_ASSET_MODE || "local"
  if (mode === "binding") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { env } = await getCloudflareContext({ async: true })
    const assets = (env as unknown as { ASSETS?: PdfAssetBinding }).ASSETS
    if (!assets) throw new Error("ASSETS binding is required for PDF generation")
    return loadPdfAssetsFromBinding(assets)
  }
  if (mode !== "local") throw new Error("Invalid PDF_ASSET_MODE")
  const root = path.join(process.cwd(), "public")
  let regular: Buffer, bold: Buffer
  try {
    ;[regular, bold] = await Promise.all([fs.readFile(path.join(root, "fonts/Amiri-Regular.ttf")), fs.readFile(path.join(root, "fonts/Amiri-Bold.ttf"))])
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
    // Preserve the existing Arial fallback, but never silently lose Arabic support.
    ;[regular, bold] = await Promise.all([fs.readFile(path.join(root, "fonts/Arial.ttf")), fs.readFile(path.join(root, "fonts/Arial-Bold.ttf"))])
  }
  let logo: Buffer | undefined
  try { logo = await fs.readFile(path.join(root, "images/logo.png")) } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
  }
  return { regular, bold, logo }
}

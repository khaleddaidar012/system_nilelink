import { promises as fs } from "node:fs"
import path from "node:path"

export interface DiskSpace {
  freeBytes: number
  totalBytes: number
}

/** Free/total bytes of the volume that holds `dir`. */
export async function getDiskSpace(dir: string): Promise<DiskSpace> {
  const st = await fs.statfs(dir)
  return {
    freeBytes: Number(st.bavail) * Number(st.bsize),
    totalBytes: Number(st.blocks) * Number(st.bsize),
  }
}

export async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSizeBytes(full)
    else if (entry.isFile()) total += (await fs.stat(full)).size
  }
  return total
}

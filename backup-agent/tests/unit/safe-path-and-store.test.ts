import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { resolveBackupDir, assertInsideRoot } from "../../src/storage/safe-path"
import { ensureLayout } from "../../src/storage/layout"
import { BackupStore } from "../../src/storage/backup-store"
import { generateBackupId } from "../../src/lib/ids"
import { writeMetadata } from "../../src/storage/metadata"
import { ARCHIVE_FILE_NAME, METADATA_FILE_NAME } from "../../src/types/backup"

describe("safe-path", () => {
  const root = path.join(os.tmpdir(), "nilelink_test_safepath")

  it("resolves valid backup dir inside root", () => {
    const id = generateBackupId("automatic")
    const { dir, type } = resolveBackupDir(root, id)
    expect(type).toBe("automatic")
    expect(dir.startsWith(path.resolve(root))).toBe(true)
  })

  it("throws on path escape attempts", () => {
    expect(() => assertInsideRoot(root, path.join(root, "..", "escape"))).toThrow()
    expect(() => resolveBackupDir(root, "../../../escape")).toThrow()
  })
})

describe("BackupStore and metadata", () => {
  let testRoot: string

  beforeEach(async () => {
    testRoot = path.join(os.tmpdir(), `nl_bk_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    await ensureLayout(testRoot)
  })

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {})
  })

  it("lists empty backups initially", async () => {
    const store = new BackupStore(testRoot)
    const list = await store.list()
    expect(list).toEqual([])
  })

  it("creates, reads, lists and protects a backup", async () => {
    const store = new BackupStore(testRoot)
    const id = generateBackupId("manual")
    const { dir } = resolveBackupDir(testRoot, id)

    await fs.mkdir(dir, { recursive: true })
    const dummyArchive = path.join(dir, ARCHIVE_FILE_NAME)
    await fs.writeFile(dummyArchive, "mock archive content")
    const stat = await fs.stat(dummyArchive)

    const meta = {
      schemaVersion: 1 as const,
      id,
      type: "manual" as const,
      status: "completed" as const,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdBy: { kind: "system" as const },
      source: { database: "nilelink", host: "test-atlas" },
      archive: {
        file: ARCHIVE_FILE_NAME as const,
        sizeBytes: stat.size,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        compression: "gzip" as const,
      },
      collections: [{ name: "users", documents: 10 }],
      protected: false,
    }

    await writeMetadata(path.join(dir, METADATA_FILE_NAME), meta)

    // Test list
    const list = await store.list()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(id)
    expect(list[0].status).toBe("completed")

    // Test get
    const fetched = await store.get(id)
    expect(fetched.id).toBe(id)
    expect(fetched.protected).toBe(false)

    // Test setProtected
    await store.setProtected(id, true)
    const afterProtect = await store.get(id)
    expect(afterProtect.protected).toBe(true)

    // Delete should throw PROTECTED error
    await expect(store.delete(id)).rejects.toThrow(/protected/i)

    // Unprotected, but it is the only valid backup: deletion must still be refused
    await store.setProtected(id, false)
    await expect(store.delete(id)).rejects.toThrow(/last valid backup/i)

    // Once it is no longer "completed" (e.g. quarantined) it can be removed by an explicit action
    await store.markQuarantined(id)
    await store.delete(id)

    expect(await store.exists(id)).toBe(false)
  })
})

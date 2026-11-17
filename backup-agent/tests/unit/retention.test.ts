import { describe, expect, it } from "vitest"
import { planRetention, RetentionPolicy } from "../../src/services/retention.service"
import { BackupSummary, BackupType } from "../../src/types/backup"

const policy: RetentionPolicy = { automaticCount: 30, safetyMinCount: 3, safetyMaxAgeDays: 30 }
const NOW = new Date("2026-07-10T00:00:00Z")

let n = 0
function item(type: BackupType, daysAgo: number, extra: Partial<BackupSummary> = {}): BackupSummary {
  const created = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
  const id = `bk_${created.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}_${type === "automatic" ? "auto" : type}_${String(n++).padStart(8, "0")}`
  return {
    id,
    type,
    status: "completed",
    createdAt: created,
    completedAt: created,
    sizeBytes: 10,
    protected: type === "safety" || type === "import",
    createdBy: null,
    reason: null,
    problem: null,
    ...extra,
  }
}

describe("planRetention", () => {
  it("35 automatic + mixed others => exactly the oldest 5 automatic are deleted", () => {
    const autos = Array.from({ length: 35 }, (_, i) => item("automatic", i + 1))
    const others = [item("manual", 100), item("import", 100), item("automatic", 200, { protected: true })]
    const plan = planRetention([...autos, ...others], policy, NOW)
    expect(plan.aborted).toBeUndefined()
    expect(plan.delete.sort()).toEqual(autos.slice(30).map((a) => a.id).sort())
  })

  it("never deletes manual, import or protected backups", () => {
    const items = [item("manual", 400), item("import", 400), item("automatic", 400, { protected: true }), item("automatic", 1)]
    expect(planRetention(items, policy, NOW).delete).toEqual([])
  })

  it("empty folder => empty plan", () => {
    expect(planRetention([], policy, NOW)).toMatchObject({ keep: [], delete: [] })
  })

  it("failed backups do not consume slots and are kept", () => {
    const failed = Array.from({ length: 40 }, (_, i) => item("automatic", i + 1, { status: "failed" }))
    expect(planRetention(failed, policy, NOW).delete).toEqual([])
    const mixed = [...failed, ...Array.from({ length: 30 }, (_, i) => item("automatic", i + 1))]
    expect(planRetention(mixed, policy, NOW).delete).toEqual([])
  })

  it("safety: keeps newest 3 always, deletes older than 30 days beyond those", () => {
    const s = [item("safety", 1), item("safety", 40), item("safety", 50), item("safety", 60), item("safety", 70)]
    const plan = planRetention(s, policy, NOW)
    expect(plan.delete.sort()).toEqual([s[3].id, s[4].id].sort())
  })

  it("safety referenced by a recent restore is kept", () => {
    const s = [item("safety", 1), item("safety", 2), item("safety", 3), item("safety", 90)]
    const plan = planRetention(s, policy, NOW, { referencedSafetyIds: new Set([s[3].id]) })
    expect(plan.delete).toEqual([])
  })

  it("aborts (deletes nothing) when any entry is quarantined", () => {
    const autos = Array.from({ length: 35 }, (_, i) => item("automatic", i + 1))
    const bad = item("automatic", 5, { status: "quarantined", problem: "Metadata is missing or invalid" })
    const plan = planRetention([...autos, bad], policy, NOW)
    expect(plan.delete).toEqual([])
    expect(plan.aborted).toBeTruthy()
  })

  it("aborts on future timestamps (clock skew)", () => {
    const future = item("automatic", -10)
    const plan = planRetention([future, ...Array.from({ length: 35 }, (_, i) => item("automatic", i + 1))], policy, NOW)
    expect(plan.delete).toEqual([])
    expect(plan.aborted).toBeTruthy()
  })

  it("never deletes the last valid backup", () => {
    const only = [item("automatic", 5)]
    expect(planRetention(only, { ...policy, automaticCount: 0 }, NOW).delete).toEqual([])
  })
})

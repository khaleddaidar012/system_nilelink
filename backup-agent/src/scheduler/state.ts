import { promises as fs } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { writeJsonAtomic } from "../storage/metadata"

export const SchedulerStateSchema = z.object({
  lastScheduledKey: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastResult: z.enum(["succeeded", "failed", "missed"]).nullable(),
  lastBackupId: z.string().nullable(),
})

export type SchedulerState = z.infer<typeof SchedulerStateSchema>

export const EMPTY_STATE: SchedulerState = {
  lastScheduledKey: null,
  lastRunAt: null,
  lastResult: null,
  lastBackupId: null,
}

export function schedulerStatePath(root: string): string {
  return path.join(root, "logs", "scheduler-state.json")
}

/** Missing or corrupt state is treated as empty (the per-date key still prevents duplicates after the first run). */
export async function readSchedulerState(file: string): Promise<SchedulerState> {
  try {
    return SchedulerStateSchema.parse(JSON.parse(await fs.readFile(file, "utf8")))
  } catch {
    return { ...EMPTY_STATE }
  }
}

export async function writeSchedulerState(file: string, state: SchedulerState): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await writeJsonAtomic(file, state)
}

export type OverviewDataOverride = (() => Promise<{ staff: any[]; audits: any[] }>) | null

let override: OverviewDataOverride = null

/** Kept outside the route: Next.js route modules only permit framework exports. */
export function setDbOverviewOverrideForTesting(value: OverviewDataOverride) { override = value }
export function getDbOverviewOverrideForTesting(): OverviewDataOverride { return override }

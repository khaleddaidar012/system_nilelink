import { isIsolatedStagingRequest, isApprovedFirstLaunchRequest } from "./staging-context.mjs"

/** One provider for the entire process. A failed D1 operation never falls back to MongoDB. */
export function getDatabaseProvider(): "mongodb" | "d1" {
  const provider = process.env.DATABASE_PROVIDER ?? "mongodb"
  if (provider !== "mongodb" && provider !== "d1") throw new Error("Invalid DATABASE_PROVIDER")
  // Production requires an authenticated review context or the pinned live
  // entry point approved for this first launch. A flag alone is insufficient.
  const preview = process.env.D1_MIGRATION_PREVIEW ?? process.env.D1_ACCOUNTS_PREVIEW
  if (provider === "d1" && (preview !== "true" || (process.env.NODE_ENV === "production" && !isIsolatedStagingRequest() && !isApprovedFirstLaunchRequest()))) {
    throw new Error("D1 is available only in an explicitly enabled local preview until migration is complete")
  }
  return provider
}

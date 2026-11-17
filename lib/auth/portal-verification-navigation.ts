/** Refresh signed claims from the database before entering the portal. */
export async function refreshVerifiedPortalSession(fetcher: typeof fetch = fetch): Promise<void> {
  const refreshed = await fetcher("/api/auth/refresh", { method: "POST", credentials: "same-origin", cache: "no-store" })
  if (!refreshed.ok) throw new Error("SESSION_REFRESH_FAILED")
  const response = await fetcher("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
  if (!response.ok) throw new Error("SESSION_REFRESH_FAILED")
  const data = await response.json()
  if (!data.authenticated || data.user?.emailVerified !== true) throw new Error("EMAIL_VERIFICATION_REQUIRED")
}

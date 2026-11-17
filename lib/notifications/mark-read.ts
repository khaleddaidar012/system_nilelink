export async function markPortalNotificationsRead(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher("/api/portal/notifications/mark-read", { method: "POST", credentials: "same-origin", cache: "no-store" })
  if (!response.ok || (await response.json()).success !== true) throw new Error("NOTIFICATIONS_NOT_MARKED_READ")
}
